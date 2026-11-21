require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const path = require('path');

const app = express();

// Covers from the Cover Art Archive are kept on this computer, and the links point to those copies.
const COVER_DIR = path.join(__dirname, 'cache', 'covers');
function localCover(u) {
  const m = /coverartarchive\.org\/release-group\/([0-9a-f-]{36})\//.exec(u);
  return m ? '/api/mb/cover/' + m[1] : u;
}

// Requests from the page to the music routes come first: background loading waits while any is in progress.
let userRequests = 0;
app.use((req, res, next) => {
  if (req.path.startsWith('/api/mb/')) {
    const sendJson = res.json.bind(res);
    res.json = body => sendJson(JSON.parse(JSON.stringify(body), (k, v) => (typeof v === 'string' ? localCover(v) : v)));
  }
  if (!req.path.startsWith('/api/mb/') && !req.path.startsWith('/api/yt/')) return next();
  if (req.get('x-prefetch')) return next();
  userRequests++;
  let done = false;
  const end = () => { if (!done) { done = true; userRequests--; } };
  res.on('finish', end);
  res.on('close', end);
  next();
});
async function bgPause() {
  while (userRequests > 0) await new Promise(resolve => setTimeout(resolve, 300));
}
const PORT = process.env.PORT || 3000;
const YT_BASE = 'https://www.googleapis.com/youtube/v3/';
const DEEZER_BASE = 'https://api.deezer.com/';

// Every Deezer request goes through one queue, spaced out so Deezer's rate limit is not hit.
let dzQueue = Promise.resolve();
let dzLast = 0;
function dzFetch(url, options) {
  const run = async () => {
    const wait = dzLast + 130 - Date.now();
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
    dzLast = Date.now();
    return fetch(url, options);
  };
  const result = dzQueue.then(run);
  dzQueue = result.catch(() => {});
  return result;
}

// MusicBrainz asks for a contact in the User-Agent; set MB_CONTACT in backend/.env (for example an email).
const MB_HEADERS = { 'User-Agent': 'Vinylla/1.0 (' + (process.env.MB_CONTACT || 'local app') + ')', Accept: 'application/json' };

// MusicBrainz allows one request per second, so every call goes through this queue.
let mbQueue = Promise.resolve();
let mbLast = 0;
function mbFetch(path) {
  const run = async () => {
    const wait = mbLast + 1100 - Date.now();
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
    mbLast = Date.now();
    let r = await fetch('https://musicbrainz.org/ws/2/' + path + '&fmt=json', { headers: MB_HEADERS });
    // MusicBrainz answers 503 when it is over its rate limit: wait and try again.
    for (let tries = 0; r.status === 503 && tries < 8; tries++) {
      await new Promise(resolve => setTimeout(resolve, 4000));
      mbLast = Date.now();
      r = await fetch('https://musicbrainz.org/ws/2/' + path + '&fmt=json', { headers: MB_HEADERS });
    }
    if (!r.ok) throw new Error('MusicBrainz ' + r.status);
    return r.json();
  };
  const result = mbQueue.then(run);
  mbQueue = result.catch(() => {});
  return result;
}

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Official audio only: YouTube "- Topic" channels and VEVO channels.
function isOfficial(channelTitle) {
  return /- Topic$/.test(channelTitle) || /VEVO$/i.test(channelTitle);
}

function isVevo(channelTitle) {
  return /VEVO$/i.test(channelTitle);
}

// Compare names loosely: "BLACKPINK - Topic" and "Blackpink" both become "blackpink".
function norm(s) {
  return String(s).replace(/\s*-\s*topic$/i, '').replace(/vevo$/i, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function ytRequest(endpoint, params, res) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    res.status(500).json({ error: 'YOUTUBE_API_KEY is not set in backend/.env' });
    return null;
  }
  const query = new URLSearchParams({ ...params, key });
  try {
    const r = await fetch(YT_BASE + endpoint + '?' + query);
    const data = await r.json();
    if (!r.ok) {
      res.status(r.status).json({ error: (data.error && data.error.message) || 'YouTube request failed' });
      return null;
    }
    return data.items || [];
  } catch (err) {
    res.status(502).json({ error: 'Could not reach YouTube' });
    return null;
  }
}

function bestThumb(thumbs) {
  const t = thumbs.maxres || thumbs.standard || thumbs.high || thumbs.medium || thumbs.default || {};
  return t.url || '';
}

// The official album cover of a song, from Deezer (free, no quota).
const trackCoverCache = new Map();
async function deezerTrackCover(artist, title) {
  const key = artist + '|' + title;
  if (trackCoverCache.has(key)) return trackCoverCache.get(key);
  let cover = '';
  try {
    const d = await dzFetch(DEEZER_BASE + 'search/track?q=' + encodeURIComponent(artist + ' ' + title) + '&limit=5').then(r => r.json());
    const hit = (d.data || []).find(t => t.artist && norm(t.artist.name) === norm(artist) && t.album);
    if (hit) cover = hit.album.cover_xl || hit.album.cover_big || '';
  } catch (err) { /* keep the YouTube thumbnail */ }
  trackCoverCache.set(key, cover);
  return cover;
}

// YouTube titles arrive with HTML codes such as &quot; and &#39;.
function decodeEntities(t) {
  return String(t).replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
function toVideo(item) {
  const videoId = typeof item.id === 'string' ? item.id : item.id.videoId;
  return {
    videoId,
    title: decodeEntities(item.snippet.title),
    channel: item.snippet.channelTitle,
    thumb: bestThumb(item.snippet.thumbnails)
  };
}

// Finds the official upload of one song by its artist, for playing from an album.
app.get('/api/youtube/resolve', async (req, res) => {
  const artist = String(req.query.artist || '').trim();
  const title = String(req.query.title || '').trim();
  if (!artist || !title) return res.status(400).json({ error: 'artist and title are required' });
  const items = await ytRequest('search', {
    part: 'snippet', type: 'video', videoCategoryId: '10', maxResults: '10', q: artist + ' ' + title
  }, res);
  if (!items) return;
  const want = norm(artist);
  const hit = items.find(i => isOfficial(i.snippet.channelTitle) && norm(i.snippet.channelTitle) === want);
  if (!hit) return res.status(404).json({ error: 'No official upload found' });
  res.json({ videoId: typeof hit.id === 'string' ? hit.id : hit.id.videoId });
});

app.get('/api/youtube/chart', async (req, res) => {
  const region = String(req.query.region || 'US').toUpperCase().slice(0, 2);
  const items = await ytRequest('videos', {
    part: 'snippet', chart: 'mostPopular', videoCategoryId: '10', maxResults: '50', regionCode: region
  }, res);
  if (items) res.json({ items: items.filter(i => isVevo(i.snippet.channelTitle)).map(toVideo) });
});

// Country lookups for search results: one at a time, spaced out for MusicBrainz's limit.
const countryQueue = [];
let countryRunning = false;
function queueCountry(name) {
  if (countryCache.has(name) || countryQueue.includes(name)) return;
  countryQueue.push(name);
  if (!countryRunning) runCountryQueue();
}
async function runCountryQueue() {
  countryRunning = true;
  while (countryQueue.length) {
    await artistCountry(countryQueue.shift());
  }
  countryRunning = false;
}

// ---- Search and artist pages from YouTube. Official artist channels ("Name - Topic") hold every song
// with its album, so an artist's full catalogue is read from its uploads (about 1 quota unit per 50 songs).
const YT_CACHE = path.join(__dirname, 'cache', 'youtube.json');
const ytStore = (() => {
  try { return JSON.parse(require('fs').readFileSync(YT_CACHE, 'utf8')); } catch (err) { return { search: {}, artists: {}, names: {}, handles: {} }; }
})();
// Older cache files may lack the newer fields.
for (const k of ['search', 'artists', 'names', 'handles']) ytStore[k] = ytStore[k] || {};
function saveYt() {
  try {
    require('fs').mkdirSync(path.dirname(YT_CACHE), { recursive: true });
    require('fs').writeFileSync(YT_CACHE, JSON.stringify(ytStore));
  } catch (err) { /* keep going without saving */ }
}
const DAY = 24 * 60 * 60 * 1000;

// "PT3M42S" to seconds.
function isoSeconds(iso) {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '');
  return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
}

// Topic descriptions read: "Provided to YouTube by ...", then "Title · Artist", then the album name.
function albumOf(desc) {
  const lines = String(desc || '').split('\n').map(s => s.trim()).filter(Boolean);
  const i = lines.findIndex(l => /^Provided to YouTube/i.test(l));
  const album = i >= 0 ? lines[i + 2] || '' : '';
  return /^(℗|Released on|Composer|Lyricist|Auto-generated|Provided)/i.test(album) ? '' : album;
}

// Remixes, live and karaoke versions are not the artist's own songs.
const NOT_ORIGINAL_TITLE = /\b(demo|remix\w*|mix|edit|rework|karaoke|instrumental|sped up|slowed|nightcore|8d|bootleg|cover|tribute|made famous|live|acapella|mashup|version|diaries|practice|focused camera|inkigayo|performance|rehearsal|fancam|episode|vlog|reaction|teaser|highlight|camera|cam)\b/i;
// Compilations and playlists (Hits, Party, Workout...) are not the artist's own albums.
const NOT_ORIGINAL_ALBUM = /\b(hits?|remix\w*|mix|playlist|party|workout|greatest|best|top|chart|anthems|radio|fm|summer|nye|karaoke|tribute|live|songs|tunes|vibes|essentials|collection|compilation|tour|workout|car|picks|feel good|music|teen|viral|fit|cardio|peloton|students?|back to school|everyday|morning|sunday|holiday|christmas)\b/i;

// Every song on an artist's channel, newest first. Cached for a week.
async function artistTracks(channelId) {
  const cached = ytStore.artists[channelId];
  if (cached && cached.v === 3 && Date.now() - cached.at < 7 * DAY) return cached;
  try {
    return await fetchArtistTracks(channelId);
  } catch (err) {
    // YouTube sometimes stops listing a channel's uploads: an older saved list is better than none.
    if (cached) return { ...cached, topic: cached.topic !== false };
    throw err;
  }
}

async function fetchArtistTracks(channelId) {
  const ch = await ytCall('channels', { part: 'snippet,contentDetails', id: channelId });
  if (ch.error) throw new Error(ch.error);
  if (!ch.items.length) throw new Error('Channel not found');
  const info = ch.items[0];
  const uploads = info.contentDetails.relatedPlaylists.uploads;
  const name = info.snippet.title.replace(/\s*-\s*Topic$|\s*VEVO$/i, '').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
  const items = [];
  let token = '';
  do {
    const params = { part: 'snippet', playlistId: uploads, maxResults: '50' };
    if (token) params.pageToken = token;
    const page = await ytCall('playlistItems', params);
    if (page.error) throw new Error(page.error);
    items.push(...page.items);
    token = page.nextPageToken || '';
  } while (token && items.length < 3000);

  const durations = new Map();
  const videoIds = items.map(i => i.snippet.resourceId.videoId);
  for (let i = 0; i < videoIds.length; i += 50) {
    const v = await ytCall('videos', { part: 'contentDetails', id: videoIds.slice(i, i + 50).join(',') });
    if (v.error) throw new Error(v.error);
    for (const x of v.items) durations.set(x.id, isoSeconds(x.contentDetails.duration));
  }

  const songs = new Map();
  for (const it of items) {
    const s = it.snippet;
    if (s.title === 'Deleted video' || s.title === 'Private video') continue;
    const album = albumOf(s.description);
    if (NOT_ORIGINAL_TITLE.test(s.title) || NOT_ORIGINAL_ALBUM.test(album)) continue;
    const videoId = s.resourceId.videoId;
    const track = {
      videoId, title: s.title, artist: name, album,
      year: (/Released on:?\s*(\d{4})/.exec(s.description || '') || [])[1] || '',
      duration: durations.get(videoId) || 0,
      thumb: bestThumb(s.thumbnails || {})
    };
    // One entry per song (a song on several albums is listed once). The plain title wins over one with
    // brackets, then the earliest release wins, since compilations come out after the original album.
    const key = norm(s.title.replace(/\s*[([].*?[)\]]/g, '').replace(/\s+-[^-]*-$/, ''));
    const have = songs.get(key);
    const plainer = !have || (/[([]/.test(have.title) && !/[([]/.test(s.title));
    const earlier = have && !/[([]/.test(have.title) === !/[([]/.test(s.title) && (track.year || '9999') < (have.year || '9999');
    if (plainer || earlier) songs.set(key, track);
  }
  const tracks = [...songs.values()];
  const entry = { v: 3, at: Date.now(), name, topic: /- Topic$/.test(info.snippet.title), picture: bestThumb(info.snippet.thumbnails || {}), tracks };
  ytStore.artists[channelId] = entry;
  saveYt();
  return entry;
}

// The albums of one artist, read from the album names of its songs.
function albumsOf(channelId, entry) {
  const map = new Map();
  for (const t of entry.tracks) {
    if (t.album && !map.has(t.album)) map.set(t.album, { id: channelId + '|' + t.album, title: t.album, artist: entry.name, cover: t.thumb, year: t.year });
  }
  return [...map.values()];
}

// Search anything: artists (official channels), albums (of the matching artists) and songs (YouTube videos).
// Real video durations, batched and cached (YouTube videos.contentDetails).
const durFile = path.join(__dirname, 'cache', 'durations.json');
let durCache = {};
try { durCache = JSON.parse(fs.readFileSync(durFile, 'utf8')); } catch (e) { durCache = {}; }
function isoToSec(iso) {
  const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '');
  if (!m) return 0;
  return (+(m[1] || 0)) * 86400 + (+(m[2] || 0)) * 3600 + (+(m[3] || 0)) * 60 + (+(m[4] || 0));
}
app.get('/api/yt/durations', async (req, res) => {
  const ids = String(req.query.ids || '').split(',').filter(x => /^[\w-]{6,20}$/.test(x)).slice(0, 200);
  const need = [...new Set(ids.filter(id => !(id in durCache)))];
  for (let i = 0; i < need.length; i += 50) {
    const r = await ytCall('videos', { part: 'contentDetails', id: need.slice(i, i + 50).join(',') });
    if (r.error) break;
    for (const v of r.items) durCache[v.id] = isoToSec(v.contentDetails && v.contentDetails.duration);
  }
  if (need.length) { try { fs.writeFileSync(durFile, JSON.stringify(durCache)); } catch (e) {} }
  const out = {};
  ids.forEach(id => { if (id in durCache) out[id] = durCache[id]; });
  res.json(out);
});
// Synced lyrics from LRCLIB (free, no API key). Returns LRC text with timestamps when available.

// Lyrics from LRCLIB (free, no key). Tries an exact match first, then a looser search with cleaned names.
const lyricsCache = new Map();
function cleanForLyrics(t) {
  return String(t || '')
    .replace(/\s*[(\[][^)\]]*[)\]]/g, ' ')
    .replace(/\s+(ft\.?|feat\.?|featuring)\s.*$/i, '')
    .replace(/\s*-\s*(official|lyrics?|audio|video).*$/i, '')
    .replace(/\s*\|.*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function cleanArtistName(a) {
  return String(a || '').replace(/VEVO$/i, '').replace(/\s*-\s*Topic$/i, '').replace(/\s*·.*$/, '').trim();
}
// The lyric entry must be the same song: its title and artist must match the track.
function lyricMatch(item, title, artist) {
  const clean = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const t = clean(title), a = clean(artist);
  const it = clean(item.trackName || item.name), ia = clean(item.artistName);
  if (!t || !it || !ia) return false;
  const titleOk = it === t || it.includes(t) || t.includes(it);
  const artistOk = !a || ia.includes(a) || a.includes(ia);
  return titleOk && artistOk;
}
async function lrclibGet(title, artist, duration) {
  // (see length check below)
  const params = new URLSearchParams({ track_name: title, artist_name: artist });
  if (duration) params.set('duration', String(duration));
  const r = await fetch('https://lrclib.net/api/get?' + params, { headers: { 'User-Agent': 'Vinylla/1.0 (music player)' } });
  if (!r.ok) return null;
  const j = await r.json();
  if (!j || !j.syncedLyrics) return null;
  if (!lyricMatch(j, title, artist)) return null;
  if (duration && j.duration && Math.abs(j.duration - duration) > 3) return null;
  return j.syncedLyrics;
}
async function lrclibSearch(title, artist, duration) {
  const r = await fetch('https://lrclib.net/api/search?' + new URLSearchParams({ track_name: title, artist_name: artist }), { headers: { 'User-Agent': 'Vinylla/1.0 (music player)' } });
  if (!r.ok) return null;
  const list = await r.json();
  const hit = (Array.isArray(list) ? list : []).find(x => x.syncedLyrics && lyricMatch(x, title, artist) && (!duration || !x.duration || Math.abs(x.duration - duration) <= 3));
  return hit ? hit.syncedLyrics : null;
}
// Per-song corrections kept in backend/lyric-overrides.json. Key: 'title|artist' (normalised, as norm() makes it).
// Use { "shift": -2.5 } to move every line by that many seconds, or { "lrc": "[00:12.00] line..." } to replace the lyrics.
const OVR_FILE = require('path').join(__dirname, 'lyric-overrides.json');
let lyricOverrides = {};
try { lyricOverrides = JSON.parse(require('fs').readFileSync(OVR_FILE, 'utf8')) || {}; } catch (e) { lyricOverrides = {}; }
function applyLyricOverride(title, artist, lrc) {
  const ov = lyricOverrides[norm(title) + '|' + norm(artist)];
  if (!ov) return lrc;
  if (typeof ov.lrc === 'string') return ov.lrc;
  if (typeof ov.shift === 'number' && lrc) {
    return lrc.split('\n').map(line => line.replace(/^\[(\d+):(\d+(?:\.\d+)?)\]/, (m, mm, ss) => {
      const t = Math.max(0, (+mm) * 60 + (+ss) + ov.shift);
      const mins = Math.floor(t / 60);
      return '[' + String(mins).padStart(2, '0') + ':' + (t - mins * 60).toFixed(2).padStart(5, '0') + ']';
    })).join('\n');
  }
  return lrc;
}
// Image proxy for artist photos from YouTube's image hosts (the browser can't always load them directly).
const IMG_HOSTS = /^https:\/\/(yt3\.ggpht\.com|yt4\.ggpht\.com|i\.ytimg\.com|coverartarchive\.org|([a-z-]+\.)?dzcdn\.net)\//;
const imgCache = new Map();
app.get('/api/img', async (req, res) => {
  const u = String(req.query.u || '');
  if (!IMG_HOSTS.test(u)) return res.status(400).end();
  if (imgCache.has(u)) { const c = imgCache.get(u); res.set('Content-Type', c.type); res.set('Cache-Control', 'public, max-age=86400'); return res.end(c.buf); }
  try {
    const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return res.status(502).end();
    const buf = Buffer.from(await r.arrayBuffer());
    const type = r.headers.get('content-type') || 'image/jpeg';
    if (imgCache.size > 500) imgCache.clear();
    imgCache.set(u, { buf, type });
    res.set('Content-Type', type); res.set('Cache-Control', 'public, max-age=86400'); res.end(buf);
  } catch (e) { res.status(502).end(); }
});
app.get('/api/lyrics', async (req, res) => {
  const rawTitle = String(req.query.title || '').slice(0, 200);
  const rawArtist = String(req.query.artist || '').slice(0, 200);
  const duration = Math.round(Number(req.query.duration) || 0);
  const ck = rawTitle + '|' + rawArtist + '|' + duration;
  if (lyricsCache.has(ck)) return res.json(lyricsCache.get(ck));
  try {
    const title = cleanForLyrics(rawTitle);
    const artist = cleanArtistName(rawArtist);
    let lrc = await lrclibGet(title, artist, duration);
    if (!lrc) lrc = await lrclibGet(title, artist, 0);
    if (!lrc) lrc = await lrclibSearch(title, artist, duration);
    if (!lrc) lrc = await lrclibSearch(title, '', duration);
    const out = { lrc: applyLyricOverride(title, artist, lrc || null) };
    lyricsCache.set(ck, out);
    res.json(out);
  } catch (e) {
    res.json({ error: 'Could not reach the lyrics service' });
  }
});
// Official audio (or lyric video) for a song, found once and saved. Never an official music video.
app.get('/api/yt/audio', async (req, res) => {
  const title = String(req.query.title || '').slice(0, 120);
  const artist = String(req.query.artist || '').slice(0, 80);
  if (!title) return res.json({ videoId: null });
  ytStore.audio = ytStore.audio || {};
  const key = norm(artist) + '|' + norm(title);
  if (key in ytStore.audio) return res.json({ videoId: ytStore.audio[key] });
  const r = await ytCall('search', { part: 'snippet', type: 'video', maxResults: '50', q: title + ' ' + artist + ' official audio' });
  if (r.error) return res.json({ videoId: null });
  const isAud = v => /official audio|(audio)|audio/i.test(v.snippet.title) || /- Topic$/i.test(v.snippet.channelTitle || '');
  const isLyric = v => /lyric/i.test(v.snippet.title) && !/official video|music video/i.test(v.snippet.title);
  const pick = r.items.find(isAud) || r.items.find(isLyric) || null;
  const id = pick ? pick.id.videoId : null;
  ytStore.audio[key] = id;
  saveYt();
  res.json({ videoId: id });
});
app.get('/api/yt/search', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  if (q.length < 2) return res.json({ artists: [], albums: [], songs: [] });
  const key = q.toLowerCase();
  const hit = ytStore.search[key];
  if (hit && hit.v === 6 && Date.now() - hit.at < DAY) return res.json(hit.result);
  try {
    const [channels, videos] = await Promise.all([
      ytCall('search', { part: 'snippet', type: 'channel', q, maxResults: '50' }),
      ytCall('search', { part: 'snippet', type: 'video', videoCategoryId: '10', maxResults: '50', q })
    ]);
    if (channels.error || videos.error) return res.status(503).json({ error: channels.error || videos.error });
    // One entry per artist: the channel named exactly like the search, with the most subscribers.
    const same = channels.items.filter(c => artistKey(c.snippet.channelTitle) === artistKey(q));
    const stats = same.length
      ? await ytCall('channels', { part: 'snippet,statistics', id: same.map(c => c.id.channelId).join(',') })
      : { items: [] };
    const best = (stats.items || []).sort((x, y) => (Number(y.statistics.subscriberCount) || 0) - (Number(x.statistics.subscriberCount) || 0))[0];
    const artists = best ? [{
      id: best.id,
      name: best.snippet.title.replace(/\s*-\s*Topic$|\s*VEVO$/i, '').replace(/([a-z])([A-Z])/g, '$1 $2').trim(),
      photo: bestThumb(best.snippet.thumbnails || {}),
      country: '',
      subs: best.statistics.hiddenSubscriberCount ? null : Number(best.statistics.subscriberCount) || 0
    }] : [];
    const albums = [];
    for (const a of artists.slice(0, 3)) {
      const entry = await artistTracks(a.id).catch(() => null);
      if (!entry) continue;
      const artistMatches = norm(a.name) === norm(q);
      for (const al of albumsOf(a.id, entry)) {
        if (artistMatches || norm(al.title).includes(norm(q))) albums.push(al);
      }
    }
    const isAudio = v => /official audio|(audio)|audio/i.test(v.snippet.title) || /- Topic$/i.test(v.snippet.channelTitle || '');
    const skip = /(cover|karaoke|instrumental|reaction|tutorial|remix|sped up|slowed|8d|nightcore)/i;
    const songKey = v => (String(v.snippet.title).replace(/s*[([][^)]]*[)]]/g, '').replace(/s*[-–|].*$/, '').replace(/[^a-z0-9]/gi, '').toLowerCase()) + '|' + artistKey(String(v.snippet.channelTitle || '').replace(/VEVO$/i, '').replace(/s*-s*Topic$/i, ''));
    const seen = new Set();
    const ranked = [...videos.items].filter(v => isAudio(v) && !skip.test(v.snippet.title)).sort((a, b) => (isAudio(b) ? 1 : 0) - (isAudio(a) ? 1 : 0)).filter(v => { const k = songKey(v); if (seen.has(k)) return false; seen.add(k); return true; });
    const cleanSongName = t => { let x = String(t).replace(/[([][^)]]*[)]]/g, '').replace(/(official|lyrics?|lyric video|audio|video|hd|4k)/ig, ''); const parts = x.split(/s+[-–|]s+/); x = parts.length > 1 ? parts[parts.length - 1] : parts[0]; return x.replace(/s+/g, ' ').replace(/[-–|:]+s*$/, '').trim(); };
    // No official audio for this song: fall back to its lyric video (same song, no intro), with just the song name.
    const lyricFallback = [...videos.items].filter(v => /lyric/i.test(v.snippet.title) && !skip.test(v.snippet.title)).filter(v => { const k = songKey(v); if (seen.has(k)) return false; seen.add(k); return true; }).map(v => ({ ...v, snippet: { ...v.snippet, title: cleanSongName(v.snippet.title) }, lyricOnly: true }));
    const songList = ranked.concat(lyricFallback).map(v => { const o = toVideo(v); o.lyricOnly = !!v.lyricOnly; return o; });
    const result = { artists, albums: albums.slice(0, 40), songs: songList };
    prefetchArtists(artists.map(a => a.id));
    ytStore.search[key] = { v: 6, at: Date.now(), result };
    saveYt();
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: 'Could not reach YouTube' });
  }
});

// The name an artist's channel is known by, without "Official", "Music", "VEVO" or "- Topic".
function artistKey(title) {
  return norm(String(title).replace(/official/gi, '').replace(/music$/i, ''));
}

// The official YouTube channel of an artist, found by name once and then remembered.
async function channelFor(name) {
  if (!name) return null;
  const key = name.toLowerCase();
  if (ytStore.names[key] !== undefined) return ytStore.names[key];
  const found = await ytCall('search', { part: 'snippet', type: 'channel', q: name + ' - Topic', maxResults: '5' });
  if (found.error) throw new Error(found.error);
  const topic = found.items.find(c => /- Topic$/.test(c.snippet.channelTitle) && norm(c.snippet.channelTitle) === norm(name))
    || found.items.find(c => /- Topic$/.test(c.snippet.channelTitle));
  ytStore.names[key] = topic ? topic.id.channelId : null;
  saveYt();
  return ytStore.names[key];
}

// Songs for an artist whose channel has no uploads (YouTube drops the uploads list then): a search for their
// official audio, keeping only videos posted by a channel with the artist's name. Costs one search, cached a week.
async function searchedTracks(name) {
  const cacheKey = 'name:' + name.toLowerCase();
  const cached = ytStore.artists[cacheKey];
  if (cached && cached.v === 5 && Date.now() - cached.at < 7 * DAY) return cached;
  const found = await ytCall('search', { part: 'snippet', type: 'video', videoCategoryId: '10', maxResults: '50', q: name + ' official audio' });
  if (found.error) throw new Error(found.error);
  const mine = found.items.filter(v => artistKey(v.snippet.channelTitle.replace(/\s*-\s*Topic$/, '')) === artistKey(name));
  const durations = new Map();
  if (mine.length) {
    const d = await ytCall('videos', { part: 'contentDetails', id: mine.map(v => v.id.videoId).join(',') });
    if (d.error) throw new Error(d.error);
    for (const x of d.items) durations.set(x.id, isoSeconds(x.contentDetails.duration));
  }
  // Songs only: no clips, teasers, reactions or posts shorter than 90 seconds.
  // Titles of releases: "Official", "Lyric", "Audio" or "MV", or the "Artist - Title" form.
  const songsOnly = mine.filter(v => (durations.get(v.id.videoId) || 0) >= 90 && !/behind the scenes|teaser|trailer|reaction|interview|vlog|shorts|making of/i.test(v.snippet.title) && (/official|lyric|audio|visuali[sz]er|music video|mv|performance/i.test(v.snippet.title) || / - /.test(v.snippet.title)));
  const tracks = songsOnly.map(v => ({
    videoId: v.id.videoId, title: v.snippet.title, artist: name, album: '', year: '',
    duration: durations.get(v.id.videoId) || 0, thumb: bestThumb(v.snippet.thumbnails || {})
  }));
  const entry = { v: 5, at: Date.now(), name, topic: false, picture: '', tracks };
  ytStore.artists[cacheKey] = entry;
  saveYt();
  return entry;
}

// A release, not a clip: "Official", "Lyric", "Audio" or "MV" in the title, or the "Artist - Title" form.
function isReleaseTitle(title) {
  if (/behind the scenes|teaser|trailer|reaction|interview|vlog|shorts|making of/i.test(title)) return false;
  return /official|lyric|audio|visuali[sz]er|music video|\bmv\b/i.test(title);
}

// The filters applied whenever a list is shown, so saved lists follow the current rules too.
function cleanTracks(entry) {
  const songs = new Map();
  for (const t of entry.tracks) {
    if (NOT_ORIGINAL_TITLE.test(t.title) || NOT_ORIGINAL_ALBUM.test(t.album || '')) continue;
    if (!entry.topic && !(t.duration >= 90 && isReleaseTitle(t.title))) continue;
    // "Artist - Title" titles name the artist: a song credited to someone else is left out.
    const credited = /^(.+?) - /.exec(t.title);
    if (!entry.topic && credited && norm(credited[1]) !== norm(entry.name)) continue;
    const key = norm(t.title.replace(/s*[([].*?[)]]/g, '').replace(/s+-[^-]*-$/, ''));
    const have = songs.get(key);
    if (!have || (/[([]/.test(have.title) && !/[([]/.test(t.title))) songs.set(key, t);
  }
  return { ...entry, tracks: [...songs.values()] };
}

// The display name of a channel, without "- Topic" or "VEVO".
async function channelTitle(channelId) {
  const r = await ytCall('channels', { part: 'snippet', id: channelId });
  if (!r.items || !r.items.length) return '';
  return r.items[0].snippet.title.replace(/\s*-\s*Topic$|\s*VEVO$/i, '').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
}

// One artist: all of their official songs, and their albums.
// The songs of an artist: the Topic channel when there is one, otherwise a search for their songs.
async function artistPage(channelId) {
  let entry = await artistTracks(channelId).catch(() => null);
  let shownId = channelId;
  if (!entry || !entry.topic) {
    const name = entry ? entry.name : await channelTitle(channelId);
    const topicId = name ? await channelFor(name).catch(() => null) : null;
    const topicEntry = topicId && topicId !== channelId ? await artistTracks(topicId).catch(() => null) : null;
    if (topicEntry) { entry = topicEntry; shownId = topicId; }
  }
  if (!entry) {
    const name = await channelTitle(channelId);
    entry = name ? await searchedTracks(name).catch(() => null) : null;
  }
  if (!entry) throw new Error('No songs found for this artist');
  return { shownId, entry: cleanTracks(entry) };
}

// Artists are loaded in the background when they appear in a list, so opening them does not wait.
const warming = new Set();
function prefetchArtists(channelIds) {
  for (const id of channelIds) {
    if (!id || warming.has(id)) continue;
    warming.add(id);
    artistPage(id).catch(() => null).finally(() => warming.delete(id));
  }
}

// One artist: all of their official songs, and their albums.
app.get('/api/yt/artist/:id', async (req, res) => {
  const id = String(req.params.id).replace(/[^A-Za-z0-9_-]/g, '');
  if (!id) return res.status(400).json({ error: 'Invalid artist id' });
  try {
    // Artists from the Artists list are looked up by their name; YouTube channel ids start with "UC".
    const channelId = /^UC/.test(id) ? id : await channelFor(String(req.query.name || ''));
    if (!channelId) return res.status(404).json({ error: 'No YouTube channel found for this artist' });
    const { shownId, entry } = await artistPage(channelId);
    res.json({
      artist: { id: shownId, name: entry.name, picture: entry.picture },
      albums: albumsOf(shownId, entry),
      tracks: entry.tracks.map(t => ({ videoId: t.videoId, title: t.title, artist: t.artist, album: t.album, duration: t.duration, cover: t.thumb }))
    });
  } catch (err) {
    console.error('Artist songs failed:', err.message);
    res.status(502).json({ error: 'Could not load songs from YouTube' });
  }
});

// One album of an artist, by the key "channelId|album name".
app.get('/api/yt/album', async (req, res) => {
  const key = String(req.query.key || '');
  const sep = key.indexOf('|');
  if (sep < 0) return res.status(400).json({ error: 'Invalid album key' });
  const channelId = key.slice(0, sep).replace(/[^A-Za-z0-9_-]/g, '');
  const title = key.slice(sep + 1);
  try {
    const entry = await artistTracks(channelId);
    const tracks = entry.tracks.filter(t => t.album === title);
    if (!tracks.length) return res.status(404).json({ error: 'Album not found' });
    res.json({
      album: { id: key, title, artist: entry.name, cover: tracks[0].thumb, year: tracks[0].year, kind: 'Album' },
      tracks: tracks.map(t => ({ videoId: t.videoId, title: t.title, artist: t.artist, album: t.album, duration: t.duration, cover: t.thumb }))
    });
  } catch (err) {
    res.status(502).json({ error: 'Could not load the album from YouTube' });
  }
});

// Well-known artists, in the order they are shown. Their albums come from Deezer.
const POPULAR_ARTISTS = [
  'Bruno Mars', 'Dua Lipa', 'BLACKPINK', 'Billie Eilish', 'Justin Bieber', 'Taylor Swift', 'Drake',
  'Ed Sheeran', 'The Weeknd', 'Ariana Grande', 'Rihanna', 'Beyoncé', 'Adele', 'Coldplay',
  'Olivia Rodrigo', 'Harry Styles', 'Lady Gaga', 'Post Malone', 'Bad Bunny', 'Sabrina Carpenter',
  'Doja Cat', 'Kendrick Lamar', 'Eminem', 'Selena Gomez', 'Shawn Mendes', 'Katy Perry', 'Miley Cyrus',
  'Maroon 5', 'Imagine Dragons', 'Michael Jackson', 'Madonna', 'Queen', 'Linkin Park', 'Lana Del Rey',
  'SZA', 'Shakira', 'Karol G', 'Stray Kids', 'BTS', 'Charlie Puth', 'Halsey', 'Tate McRae', 'Sia'
];
const popularCache = new Map();

// Seeded shuffle: the same seed always gives the same order.
function seededShuffle(list, seed) {
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function albumsOfArtist(name) {
  if (popularCache.has(name)) return popularCache.get(name);
  const artistId = await deezerArtistId(name);
  let albums = [];
  if (artistId) {
    const list = await dzFetch(DEEZER_BASE + 'artist/' + artistId + '/albums?limit=50').then(r => r.json());
    // Official studio albums only (no singles or EPs), and no tribute, karaoke or remix releases.
    const unofficial = /karaoke|tribute|instrumental|cover|remix|sped up|slowed|nightcore|8d|bootleg|made famous|in the style of/i;
    albums = (list.data || [])
      .filter(a => a.record_type === 'album' && !unofficial.test(a.title))
      .slice(0, 4)
      .map(a => ({
      id: String(a.id),
      title: a.title,
      artist: name,
      cover: a.cover_xl || a.cover_big || a.cover_medium || '',
      year: (a.release_date || '').slice(0, 4)
    }));
  }
  popularCache.set(name, albums);
  return albums;
}

// Albums of the next few well-known artists, in order.
// The albums on the Albums list are loaded in the background, one at a time, so opening one shows its songs at once.
const albumWarming = new Set();
async function prefetchAlbums(items) {
  const base = 'http://localhost:' + PORT;
  const headers = { 'x-prefetch': '1' };
  for (const a of items) {
    const key = a.title + '|' + a.artist;
    if (albumWarming.has(key)) continue;
    albumWarming.add(key);
    try {
      await bgPause();
      const found = await fetch(base + '/api/mb/resolve-album?title=' + encodeURIComponent(a.title) + '&artist=' + encodeURIComponent(a.artist), { headers }).then(r => r.json());
      if (found.id) {
        await bgPause();
        await fetch(base + '/api/mb/album/' + found.id, { headers });
        await fetch(base + '/api/mb/cover/' + found.id, { headers });
      }
    } catch (err) { /* opened later instead */ }
    albumWarming.delete(key);
  }
}

app.get('/api/music/popular', async (req, res) => {
  const index = Math.max(0, parseInt(req.query.index, 10) || 0);
  const seed = parseInt(req.query.seed, 10) || 0;
  const names = seededShuffle(POPULAR_ARTISTS, seed).slice(index, index + 8);
  try {
    const lists = await Promise.all(names.map(n => albumsOfArtist(n).catch(() => [])));
    const items = lists.flat();
    prefetchAlbums(items);
    res.json({ items, done: index + 8 >= POPULAR_ARTISTS.length });
  } catch (err) {
    res.status(502).json({ error: 'Could not reach Deezer' });
  }
});

// Most-viewed official videos of each well-known artist, saved to a file so the
// YouTube quota is spent once. A search costs about 100 units, so this builds slowly.
const VIEW_FILE = path.join(__dirname, 'cache', 'top-views.json');
let viewCache = {};
try { viewCache = JSON.parse(require('fs').readFileSync(VIEW_FILE, 'utf8')); } catch (err) { viewCache = {}; }
let viewBuilding = false;

function saveViews() {
  try {
    require('fs').mkdirSync(path.dirname(VIEW_FILE), { recursive: true });
    require('fs').writeFileSync(VIEW_FILE, JSON.stringify(viewCache));
  } catch (err) { /* keep going without saving */ }
}

// Like ytRequest, but returns the error instead of answering the browser.
async function ytCall(endpoint, params) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return { error: 'YOUTUBE_API_KEY is not set' };
  try {
    const r = await fetch(YT_BASE + endpoint + '?' + new URLSearchParams({ ...params, key }));
    const data = await r.json();
    if (!r.ok) return { error: (data.error && data.error.message) || 'YouTube request failed' };
    return { items: data.items || [], nextPageToken: data.nextPageToken };
  } catch (err) {
    return { error: 'Could not reach YouTube' };
  }
}

async function buildViews() {
  if (viewBuilding) return;
  viewBuilding = true;
  try {
    for (const name of POPULAR_ARTISTS) {
      if (viewCache[name] && (viewCache[name].length === 0 || viewCache[name][0].channelId)) continue;
      const found = await ytCall('search', {
        part: 'snippet', type: 'video', videoCategoryId: '10', order: 'viewCount', maxResults: '10', q: name + ' official'
      });
      if (found.error) {
        if (/quota/i.test(found.error)) break;   // out of quota for today: try again later
        viewCache[name] = []; saveViews(); continue;
      }
      const ids = found.items
        .filter(i => isOfficial(i.snippet.channelTitle) && norm(i.snippet.channelTitle) === norm(name))
        .map(i => (typeof i.id === 'string' ? i.id : i.id.videoId));
      let tracks = [];
      if (ids.length) {
        const stats = await ytCall('videos', { part: 'snippet,statistics', id: ids.join(',') });
        if (stats.error) {
          if (/quota/i.test(stats.error)) break;
        } else {
          tracks = stats.items.map(v => ({
            videoId: v.id,
            title: v.snippet.title,
            channel: v.snippet.channelTitle,
            channelId: v.snippet.channelId,
            thumb: bestThumb(v.snippet.thumbnails),
            views: Number(v.statistics.viewCount) || 0
          }));
        }
      }
      viewCache[name] = tracks;
      saveViews();
    }
  } finally {
    viewBuilding = false;
  }
}

// YouTube's current most-popular music videos, refreshed every six hours (one quota unit each refresh).
let trendingCache = { at: 0, items: [] };
async function getTrending() {
  if (Date.now() - trendingCache.at < 6 * 60 * 60 * 1000 && trendingCache.items.length) return trendingCache.items;
  const r = await ytCall('videos', { part: 'snippet', chart: 'mostPopular', videoCategoryId: '10', regionCode: 'US', maxResults: '50' });
  if (r.error) return trendingCache.items;
  trendingCache = {
    at: Date.now(),
    items: r.items.filter(v => isOfficial(v.snippet.channelTitle)).map(v => ({
      videoId: v.id, title: v.snippet.title, channel: v.snippet.channelTitle, thumb: bestThumb(v.snippet.thumbnails), views: 0
    }))
  };
  return trendingCache.items;
}

// The full-size (1280x720) YouTube thumbnail, or the 480x360 one when that size is missing.
const hdCache = new Map();
async function hdThumb(videoId) {
  if (hdCache.has(videoId)) return hdCache.get(videoId);
  let url = 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg';
  try {
    const r = await fetch('https://i.ytimg.com/vi/' + videoId + '/maxresdefault.jpg', { method: 'HEAD' });
    if (r.ok) url = 'https://i.ytimg.com/vi/' + videoId + '/maxresdefault.jpg';
  } catch (err) { /* keep the 480x360 version */ }
  hdCache.set(videoId, url);
  return url;
}

// Covers are answered from memory; anything not ready yet uses the YouTube thumbnail at once.
function coverFor(channel, title) {
  const key = channel.replace(/s*-s*topic$|s*vevo$/i, '') + '|' + title;
  return trackCoverCache.get(key) || '';
}
function thumbFor(videoId) {
  return 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg';
}

// Top songs of the day: YouTube's most-popular music chart (official channels), cached for 6 hours.
app.get('/api/music/top', async (req, res) => {
  let items = [];
  try { items = await require('./accounts').topToday(6); } catch (e) { items = []; }
  res.json({ items: items.map(t => ({ videoId: t.videoId, title: t.title, channel: t.channel, thumb: t.thumb })) });
});
app.get('/api/music/hits', (req, res) => {
  const index = Math.max(0, parseInt(req.query.index, 10) || 0);
  const seed = parseInt(req.query.seed, 10) || 0;
  if (!viewBuilding && Object.keys(viewCache).length < POPULAR_ARTISTS.length) buildViews();

  const seen = new Set();
  const pool = [...Object.values(viewCache).flat(), ...trendingCache.items]
    .filter(t => (seen.has(t.videoId) ? false : seen.add(t.videoId)));
  // A fresh random order for every refresh: most-viewed and less-viewed songs are mixed.
  const ordered = seededShuffle(pool, seed);
  const slice = ordered.slice(index, index + 40);

  res.json({
    items: slice.map(t => ({
      id: 'yt' + t.videoId, yt: t.videoId, title: t.title, artist: t.channel, album: '',
      cover: coverFor(t.channel, t.title) || t.thumb || thumbFor(t.videoId), duration: 0
    })),
    done: index + 40 >= ordered.length && !viewBuilding && Object.keys(viewCache).length >= POPULAR_ARTISTS.length
  });
});

// Artist country from MusicBrainz (free). It allows one request per second, so it is spaced out.
const countryCache = new Map();
async function artistCountry(name) {
  if (countryCache.has(name)) return countryCache.get(name);
  try {
    const q = encodeURIComponent('artist:"' + name + '"');
    const data = await mbFetch('artist/?query=' + q + '&limit=1');
    const artist = (data.artists || [])[0];
    const country = artist && artist.country ? artist.country : '';
    countryCache.set(name, country);
    return country;
  } catch (err) {
    return '';
  }
}

// YouTube subscriber counts of official channels, cached for a day (cheap: one unit per 50 channels).
const subsCache = new Map();
async function subscriberCounts(ids) {
  const now = Date.now();
  const need = ids.filter(id => !(subsCache.has(id) && now - subsCache.get(id).at < 86400000));
  if (need.length) {
    const r = await ytCall('channels', { part: 'statistics', id: need.join(',') });
    if (!r.error) {
      for (const c of r.items) {
        const hidden = c.statistics.hiddenSubscriberCount;
        subsCache.set(c.id, { count: hidden ? null : Number(c.statistics.subscriberCount) || 0, at: now });
      }
    }
  }
  return ids.map(id => (subsCache.has(id) ? subsCache.get(id).count : null));
}

// Deezer id of a well-known artist, matched by exact name (cached).
const artistIdCache = new Map();
async function deezerArtistId(name) {
  if (artistIdCache.has(name)) return artistIdCache.get(name);
  const d = await dzFetch(DEEZER_BASE + 'search/artist?q=' + encodeURIComponent(name) + '&limit=5').then(r => r.json());
  // A rate-limit error is not cached, so the artist is looked up again later.
  if (d.error) throw new Error('Deezer search failed');
  // An exact name wins over a looser match (so "Eminem" is not confused with "Emine'm").
  const a = (d.data || []).find(x => x.name.toLowerCase() === name.toLowerCase()) || (d.data || []).find(x => norm(x.name) === norm(name));
  const id = a ? a.id : null;
  artistIdCache.set(name, id);
  return id;
}

// Famous artists for the Artists list. Each official channel is found by its YouTube handle (1 quota unit,
// remembered), and only channels with a million or more subscribers are shown. Five million or more come first.
const FAMOUS_ARTISTS = [
  'Bruno Mars', 'Dua Lipa', 'BLACKPINK', 'Billie Eilish', 'Justin Bieber', 'Taylor Swift', 'Drake', 'Ed Sheeran',
  'The Weeknd', 'Ariana Grande', 'Rihanna', 'Beyoncé', 'Adele', 'Coldplay', 'Olivia Rodrigo', 'Harry Styles',
  'Lady Gaga', 'Post Malone', 'Bad Bunny', 'Sabrina Carpenter', 'Doja Cat', 'Kendrick Lamar', 'Eminem',
  'Selena Gomez', 'Shawn Mendes', 'Katy Perry', 'Miley Cyrus', 'Maroon 5', 'Imagine Dragons', 'Michael Jackson',
  'Madonna', 'Queen', 'Linkin Park', 'Lana Del Rey', 'SZA', 'Shakira', 'KAROL G', 'Stray Kids', 'BTS', 'Charlie Puth',
  'Halsey', 'Tate McRae', 'Sia', 'Travis Scott', 'Cardi B', 'Megan Thee Stallion', 'Nicki Minaj', 'Lil Nas X',
  'Jung Kook', 'Jennie', 'IU', 'TWICE', 'NewJeans', 'aespa', 'SEVENTEEN', 'TXT', 'ENHYPEN', 'Rosalía', 'Peso Pluma',
  'Feid', 'Anitta', 'Burna Boy', 'Tems', 'Wizkid', 'Davido', 'Tyla', 'Rauw Alejandro', 'Ozuna', 'Maluma', 'J Balvin',
  'Daddy Yankee', 'Enrique Iglesias', 'Pitbull', 'Usher', 'Chris Brown', 'The Kid LAROI', 'Central Cee',
  'Ava Max', 'Camila Cabello', 'Demi Lovato', 'Lorde', 'Bebe Rexha', 'Jason Derulo', 'Pharrell Williams'
];
// The channel of a famous artist, or null when it is not found. Lookups that fail (quota) are not remembered.
async function channelByHandle(name) {
  const key = name.toLowerCase();
  if (ytStore.handles[key] !== undefined) return ytStore.handles[key];
  const handle = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]/g, '');
  const r = await ytCall('channels', { part: 'snippet,statistics', forHandle: handle });
  if (r.error) return null;
  const c = r.items[0];
  // "EminemMusic" and "EminemVEVO" count as "Eminem"; any other name is not the artist.
  const title = c ? norm(c.snippet.title).replace(/(vevo|music|official)$/, '') : '';
  const hit = c && title === norm(name)
    ? { id: c.id, name, photo: bestThumb(c.snippet.thumbnails || {}), country: '', subs: Number(c.statistics.subscriberCount) || 0 }
    : null;
  ytStore.handles[key] = hit;
  saveYt();
  return hit;
}

async function artistPoolYT() {
  const found = [];
  for (const name of FAMOUS_ARTISTS) {
    const hit = await channelByHandle(name);
    if (hit && hit.subs >= 1000000) found.push({ ...hit, tier: hit.subs >= 5000000 ? 0 : 1 });
  }
  return found;
}

app.get('/api/music/popular-artists', async (req, res) => {
  const index = Math.max(0, parseInt(req.query.index, 10) || 0);
  const seed = parseInt(req.query.seed, 10) || 0;
  try {
    const pool = await artistPoolYT();
    const ordered = [0, 1].flatMap(t => seededShuffle(pool.filter(a => a.tier === t), seed + t));
    const page = ordered.slice(index, index + 12);
    prefetchArtists(page.map(a => a.id));
    res.json({
      items: page.map(a => ({ id: a.id, name: a.name, photo: a.photo, country: a.country, subs: a.subs || null })),
      done: index + 12 >= ordered.length
    });
  } catch (err) {
    res.status(502).json({ error: 'Could not reach YouTube' });
  }
});

// Music genres from Deezer, for the genre filters.
let genreCache = null;
app.get('/api/music/genres', async (req, res) => {
  try {
    if (!genreCache) {
      const r = await dzFetch(DEEZER_BASE + 'genre');
      const data = await r.json();
      genreCache = (data.data || []).filter(g => g.id !== 0).map(g => ({ id: g.id, name: g.name }));
    }
    res.json({ items: genreCache });
  } catch (err) {
    res.status(502).json({ error: 'Could not reach Deezer' });
  }
});

// Popular albums or artists from Deezer's charts, one page at a time.
app.get('/api/music/charts/:kind', async (req, res) => {
  const kind = ['artists', 'tracks'].includes(req.params.kind) ? req.params.kind : 'albums';
  const index = Math.max(0, parseInt(req.query.index, 10) || 0);
  try {
    const genre = /^d+$/.test(String(req.query.genre || '')) ? String(req.query.genre) : '0';
    const r = await dzFetch(DEEZER_BASE + 'chart/' + genre + '/' + kind + '?limit=40&index=' + index);
    const data = await r.json();
    if (data.error) return res.status(502).json({ error: data.error.message || 'Deezer chart failed' });
    const items = (data.data || []).map(x => {
      if (kind === 'albums') return { id: String(x.id), title: x.title, artist: x.artist ? x.artist.name : '', cover: x.cover_xl || x.cover_big || x.cover_medium || '' };
      if (kind === 'tracks') return { id: String(x.id), title: x.title, artist: x.artist ? x.artist.name : '', album: x.album ? x.album.title : '', cover: (x.album && (x.album.cover_xl || x.album.cover_big || x.album.cover_medium)) || '', duration: x.duration || 0 };
      return { id: String(x.id), name: x.name, photo: x.picture_xl || x.picture_big || x.picture_medium || '', fans: x.nb_fan || 0 };
    });
    res.json({ items });
  } catch (err) {
    res.status(502).json({ error: 'Could not reach Deezer' });
  }
});

// ---- MusicBrainz catalogue: search for any artist, album or song, and complete official discographies.
// Read once from MusicBrainz and kept on this computer, so an artist is only slow the first time.
const MB_CACHE = path.join(__dirname, 'cache', 'musicbrainz.json');
const mbStore = (() => {
  try { return JSON.parse(require('fs').readFileSync(MB_CACHE, 'utf8')); } catch (err) { return {}; }
})();
for (const k of ['artists', 'albums', 'searches']) mbStore[k] = mbStore[k] || {};
function saveMb() {
  try {
    require('fs').mkdirSync(path.dirname(MB_CACHE), { recursive: true });
    require('fs').writeFileSync(MB_CACHE, JSON.stringify(mbStore));
  } catch (err) { /* keep going without saving */ }
}

// Covers from the Cover Art Archive (free, linked to MusicBrainz releases).
const coverArt = (kind, id) => 'https://coverartarchive.org/' + kind + '/' + id + '/front-500';

// The artist's own studio albums, singles and EPs (not live, remix, compilation, DJ or demo releases).
const MB_NOT_ORIGINAL = ['Live', 'Compilation', 'Remix', 'DJ-mix', 'Mixtape/Street', 'Demo', 'Interview', 'Spokenword', 'Audiobook', 'Karaoke'];
function isOriginalGroup(g) {
  return ['Album', 'EP', 'Single'].includes(g['primary-type']) && !(g['secondary-types'] || []).some(t => MB_NOT_ORIGINAL.includes(t));
}
function creditOf(credit) { return (credit || []).map(c => c.name + (c.joinphrase || '')).join('').trim(); }
function mainCredit(credit, mbid) { return (credit || []).length > 0 && !!credit[0].artist && credit[0].artist.id === mbid; }

// Songs ranked: the exact title first, then songs by the famous artists in their list order, then the rest.
function rankSongs(list, q) {
  const famousIndex = new Map(FAMOUS_ARTISTS.map((name, i) => [norm(name), i]));
  const exact = norm(q);
  const rank = r => {
    const credit = (r['artist-credit'] || []).map(c => c.name).join(' ');
    const famous = famousIndex.has(norm(credit)) ? famousIndex.get(norm(credit)) : 999;
    return [norm(r.title) === exact ? 0 : 1, famous];
  };
  return [...list].sort((a, b) => { const x = rank(a), y = rank(b); return x[0] - y[0] || x[1] - y[1]; });
}

// Search anything: artists, albums and songs.
app.get('/api/mb/search', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  if (q.length < 2) return res.json({ artists: [], albums: [], songs: [] });
  const key = q.toLowerCase();
  const hit = mbStore.searches[key];
  if (hit && Date.now() - hit.at < 7 * DAY) return res.json(hit.result);
  try {
    const enc = encodeURIComponent(q);
    const artists = await mbFetch('artist/?query=' + enc + '&limit=25');
    const groups = await mbFetch('release-group/?query=' + enc + '&limit=25');
    const recs = await mbFetch('recording/?query=' + encodeURIComponent('recording:"' + q + '"') + '&limit=50');
    // Albums are the top artist's own: tribute albums and unreleased or bootleg releases are left out.
    const top = (artists.artists || []).find(a => a.score >= 90);
    const result = {
      artists: (artists.artists || []).filter(a => a.score >= 80).slice(0, 12).map(a => ({
        id: a.id, name: a.name, photo: '', country: a.country || '', subs: null, disambiguation: a.disambiguation || ''
      })),
      albums: (groups['release-groups'] || []).filter(g => isOriginalGroup(g) && !/unreleased|bootleg/i.test(g.title) && (!top || norm(creditOf(g['artist-credit'])) === norm(top.name))).slice(0, 30).map(g => ({
        id: g.id, title: g.title, artist: creditOf(g['artist-credit']), cover: coverArt('release-group', g.id), year: (g['first-release-date'] || '').slice(0, 4)
      })),
      songs: rankSongs(recs.recordings || [], q).filter(r => !NOT_ORIGINAL_TITLE.test(r.title) && (r.releases || []).some(x => isOriginalGroup(x['release-group'] || {}))).slice(0, 40).map(r => {
        const rel = r.releases.find(x => isOriginalGroup(x['release-group'] || {}));
        return { id: r.id, title: r.title, artist: creditOf(r['artist-credit']), album: rel.title, cover: coverArt('release-group', rel['release-group'].id), duration: Math.round((r.length || 0) / 1000) };
      })
    };
    mbStore.searches[key] = { at: Date.now(), result };
    saveMb();
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: 'Could not reach MusicBrainz' });
  }
});

// The famous artists' discographies are read in the background when the server starts, one at a time
// (MusicBrainz allows one request per second). Their tags are kept too, so genres can use them at once.
async function warmCatalogue() {
  mbStore.famous = mbStore.famous || {};
  for (const name of FAMOUS_ARTISTS) {
    await bgPause();
    try {
      let mbid = mbStore.famous[name];
      if (!mbid) {
        const d = await mbFetch('artist/?query=' + encodeURIComponent('artist:"' + name + '"') + '&limit=3');
        const a = (d.artists || []).find(x => norm(x.name) === norm(name));
        if (!a) continue;
        mbid = a.id;
        mbStore.famous[name] = mbid;
        saveMb();
      }
      const entry = await mbArtistAll(mbid);
      if (!entry.tags) {
        const t = await mbFetch('artist/' + mbid + '?inc=tags');
        entry.tags = (t.tags || []).map(x => x.name.toLowerCase());
        saveMb();
      }
    } catch (err) { /* loaded when the artist is opened */ }
  }
}

// An artist's complete official discography with tracklists. Read once, then kept.
const mbBuilding = new Map();
function mbArtistAll(mbid) {
  if (mbStore.artists[mbid] && mbStore.artists[mbid].v === 2) return Promise.resolve(mbStore.artists[mbid]);
  if (mbBuilding.has(mbid)) return mbBuilding.get(mbid);
  const job = (async () => {
    const info = await mbFetch('artist/' + mbid + '?');
    const groups = [];
    for (let offset = 0; ;) {
      const page = await mbFetch('release-group?artist=' + mbid + '&limit=100&offset=' + offset);
      const list = page['release-groups'] || [];
      groups.push(...list);
      offset += list.length;
      if (offset >= (page['release-group-count'] || 0)) break;
      if (!list.length) throw new Error('MusicBrainz returned no more release groups');
    }
    const releases = [];
    for (let offset = 0; ;) {
      const page = await mbFetch('release?artist=' + mbid + '&limit=100&offset=' + offset + '&inc=recordings+artist-credits+release-groups');
      const list = page.releases || [];
      releases.push(...list);
      offset += list.length;
      if (offset >= (page['release-count'] || 0)) break;
      if (!list.length) throw new Error('MusicBrainz returned no more releases');
    }
    // An album is the artist's when one of its releases credits the artist as the main artist.
    const ownGroups = new Set(releases.filter(r => mainCredit(r['artist-credit'], mbid)).map(r => (r['release-group'] || {}).id));
    const albums = groups.filter(g => isOriginalGroup(g) && ownGroups.has(g.id) && !/remix|unreleased|bootleg/i.test(g.title)).map(g => ({
      id: g.id, title: g.title, kind: g['primary-type'], year: (g['first-release-date'] || '').slice(0, 4),
      artist: creditOf(g['artist-credit']), cover: coverArt('release-group', g.id)
    }));
    const albumById = new Map(albums.map(a => [a.id, a]));
    const songs = new Map();
    for (const rel of releases) {
      const g = rel['release-group'] || {};
      const album = albumById.get(g.id);
      if (rel.status !== 'Official' || !album) continue;
      for (const medium of rel.media || []) {
        for (const tr of medium.tracks || []) {
          if (!mainCredit(tr['artist-credit'], mbid) || NOT_ORIGINAL_TITLE.test(tr.title)) continue;
          const year = (g['first-release-date'] || rel.date || '').slice(0, 4);
          const key = norm(tr.title.replace(/\s*[([].*?[)\]]/g, '').replace(/\s+-[^-]*-$/, ''));
          const have = songs.get(key);
          // One entry per song: the earliest release wins; the plain title wins over one with brackets.
          const earlier = !have || (year && (!have.year || year < have.year));
          const plainer = have && year === have.year && /[([]/.test(have.title) && !/[([]/.test(tr.title);
          if (earlier || plainer) songs.set(key, {
            id: tr.recording ? tr.recording.id : tr.id, title: tr.title, artist: creditOf(tr['artist-credit']),
            album: album.title, year, duration: Math.round((tr.length || 0) / 1000), cover: album.cover
          });
        }
      }
    }
    const entry = {
      v: 2, at: Date.now(), name: info.name, albums,
      tracks: [...songs.values()].sort((a, b) => b.year.localeCompare(a.year) || a.album.localeCompare(b.album))
    };
    mbStore.artists[mbid] = entry;
    saveMb();
    return entry;
  })().finally(() => mbBuilding.delete(mbid));
  mbBuilding.set(mbid, job);
  return job;
}

app.get('/api/mb/artist/:id', async (req, res) => {
  const id = String(req.params.id);
  if (!/^[0-9a-f-]{36}$/.test(id)) return res.status(400).json({ error: 'Invalid artist id' });
  try {
    const entry = await mbArtistAll(id);
    res.json({
      artist: { id, name: entry.name, picture: entry.albums[0] ? entry.albums[0].cover : '' },
      albums: entry.albums,
      tracks: entry.tracks.map(t => ({ videoId: null, title: t.title, artist: t.artist, album: t.album, duration: t.duration, cover: t.cover }))
    });
  } catch (err) {
    console.error('MusicBrainz artist failed:', err.message);
    res.status(502).json({ error: 'Could not load songs from MusicBrainz' });
  }
});

// One album with its tracklist (the official release with the most tracks).
app.get('/api/mb/album/:id', async (req, res) => {
  const id = String(req.params.id);
  if (!/^[0-9a-f-]{36}$/.test(id)) return res.status(400).json({ error: 'Invalid album id' });
  try {
    let album = mbStore.albums[id];
    if (!album || album.v !== 4) {
      const g = await mbFetch('release-group/' + id + '?inc=artist-credits');
      const page = await mbFetch('release?release-group=' + id + '&limit=25&inc=recordings+artist-credits+media');
      const official = (page.releases || []).filter(r => !['Bootleg', 'Withdrawn', 'Cancelled', 'Pseudo-Release'].includes(r.status)).sort((a, b) => (b.status === 'Official') - (a.status === 'Official'));
      const count = r => (r.media || []).reduce((n, m) => n + (m.tracks || []).length, 0);
      const pick = official.sort((a, b) => count(b) - count(a))[0];
      if (!pick) return res.status(404).json({ error: 'No official release found' });
      const tracks = [];
      for (const medium of pick.media || []) {
        for (const tr of medium.tracks || []) {
          if (NOT_ORIGINAL_TITLE.test(tr.title)) continue;
          tracks.push({ videoId: null, title: tr.title, artist: creditOf(tr['artist-credit']), album: g.title, duration: Math.round((tr.length || 0) / 1000), cover: coverArt('release-group', id) });
        }
      }
      album = { v: 4, title: g.title, artist: creditOf(g['artist-credit']), cover: coverArt('release-group', id), year: (g['first-release-date'] || '').slice(0, 4), kind: g['primary-type'] || 'Album', tracks };
      mbStore.albums[id] = album;
      saveMb();
    }
    res.json({
      album: { id, title: album.title, artist: album.artist, cover: album.cover, year: album.year, kind: album.kind },
      tracks: album.tracks
    });
  } catch (err) {
    console.error('MusicBrainz album failed:', err.message);
    res.status(502).json({ error: 'Could not load the album from MusicBrainz' });
  }
});

// ---- Genres: each has a high-quality picture (Wikipedia's article image) and songs found by its MusicBrainz tag.
const GENRE_LIST = [
  ['Pop', 'pop', 'Pop_music'], ['Hip-hop', 'hip hop', 'Hip_hop_music'], ['Rock', 'rock', 'Rock_music'],
  ['R&B', 'r&b', 'Rhythm_and_blues'], ['Electronic', 'electronic', 'Electronic_music'], ['Dance', 'dance', 'Dance_music'],
  ['Indie', 'indie', 'Indie_music'], ['Latin', 'latin', 'Latin_music'], ['Jazz', 'jazz', 'Jazz'],
  ['Classical', 'classical', 'Classical_music'], ['Country', 'country', 'Country_music'], ['Metal', 'metal', 'Heavy_metal_music'],
  ['Reggae', 'reggae', 'Reggae'], ['K-pop', 'k-pop', 'K-pop'], ['Afrobeats', 'afrobeats', 'Afrobeats'],
  ['Soul', 'soul', 'Soul_music'], ['Funk', 'funk', 'Funk'], ['Blues', 'blues', 'Blues'], ['Folk', 'folk', 'Folk_music'],
  ['Disco', 'disco', 'Disco'], ['House', 'house', 'House_music'], ['Techno', 'techno', 'Techno'],
  ['Trap', 'trap', 'Trap_music'], ['Lo-fi', 'lo-fi', 'Lo-fi_music']
];

// Pictures are read once and kept: the Wikipedia article's image, or else the image of its Wikidata item.
async function genrePicture(title) {
  const json = async url => {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Vinylla/1.0 (local app)' } });
      return r.ok ? await r.json() : null;
    } catch (err) { return null; }
  };
  const summary = await json('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title));
  const direct = summary && ((summary.originalimage && summary.originalimage.source) || (summary.thumbnail && summary.thumbnail.source));
  if (direct) return direct;
  const page = await json('https://en.wikipedia.org/w/api.php?action=query&prop=pageprops&titles=' + encodeURIComponent(title) + '&format=json');
  const pages = page && page.query && page.query.pages ? Object.values(page.query.pages) : [];
  const item = pages[0] && pages[0].pageprops && pages[0].pageprops.wikibase_item;
  if (!item) return commonsPicture(title);
  const entity = await json('https://www.wikidata.org/wiki/Special:EntityData/' + item + '.json');
  const claim = entity && entity.entities && entity.entities[item] && entity.entities[item].claims && entity.entities[item].claims.P18;
  const file = claim && claim[0] && claim[0].mainsnak && claim[0].mainsnak.datavalue && claim[0].mainsnak.datavalue.value;
  return file ? 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(file) + '?width=1200' : commonsPicture(title);
}

// A picture from Wikimedia Commons that matches the genre name.
async function commonsPicture(title) {
  const term = title.replace(/_music$/, '').replace(/_/g, ' ') + ' music';
  try {
    const r = await fetch('https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrlimit=8&gsrsearch=' + encodeURIComponent(term) + '&prop=imageinfo&iiprop=url&iiurlwidth=1200&format=json', { headers: { 'User-Agent': 'Vinylla/1.0 (local app)' } });
    const d = await r.json();
    const pics = d.query && d.query.pages ? Object.values(d.query.pages) : [];
    const pick = pics.find(p => p.imageinfo && /\.(jpe?g|png)$/i.test(p.title) && p.imageinfo[0].thumburl);
    return pick ? pick.imageinfo[0].thumburl : '';
  } catch (err) {
    return '';
  }
}

// A genre without a picture uses the cover of a famous album in it (from the cache, so nothing waits).
function genreFallbackImage(tag) {
  for (const name of FAMOUS_ARTISTS) {
    const e = mbStore.artists[(mbStore.famous || {})[name]];
    if (e && (e.tags || []).includes(tag) && e.albums && e.albums[0] && e.albums[0].cover) return e.albums[0].cover;
  }
  return '';
}

// Genre pictures are saved on this computer when the server starts, and served from there, so they show at once.
const fs = require('fs');
const GENRE_IMG_DIR = path.join(__dirname, 'cache', 'genres');
app.use('/genre-img', express.static(GENRE_IMG_DIR));
function genreFile(name) { return path.join(GENRE_IMG_DIR, name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.jpg'); }
const GENRE_PICS = {"Afrobeats":"https://commons.wikimedia.org/wiki/Special:FilePath/Afrobeats%20star%20Burna%20Boy%20performing%20with%20at%20Nativeland%20Concert%2C%20Lagos%2C%20Nigeria%202016.jpg?width=640","Blues":"https://commons.wikimedia.org/wiki/Special:FilePath/Blues%20singer%20Alvin%20Madison%20with%20his%20guitar%20in%20Summit%2C%20New%20Jersey%20between%20performances.jpg?width=640","Latin":"https://commons.wikimedia.org/wiki/Special:FilePath/Sin%20Animo%20de%20Lucro%20LIVE.JPG?width=640","Lo-fi":"https://commons.wikimedia.org/wiki/Special:FilePath/Will%20this%20lo-fi%20studio%20work%3F.jpg?width=640","Trap":"https://commons.wikimedia.org/wiki/Special:FilePath/Chance%20the%20Rapper%20Red%20Rocks%2005.02.17%20(33598259824).jpg?width=640","Hip-hop":"https://commons.wikimedia.org/wiki/Special:FilePath/Hip%20Hop%20Mural.jpg?width=640","Soul":"https://commons.wikimedia.org/wiki/Special:FilePath/BLACK%20SOUL%20SINGER%20JOHNNY%20TAYLOR%20PERFORMS%20AT%20THE%20INTERNATIONAL%20AMPHITHEATER%20IN%20CHICAGO%20AS%20PART%20OF%20PUSH%20'BLACK%20EXPO'%20IN...%20-%20NARA%20-%20556306.jpg?width=640","Reggae":"https://commons.wikimedia.org/wiki/Special:FilePath/Rebelution%20Reggae%20Band.jpg?width=640","Electronic":"https://commons.wikimedia.org/wiki/Special:FilePath/Cheat%20Codes.jpg?width=640","Metal":"https://commons.wikimedia.org/wiki/Special:FilePath/Deep%20Purple%20-%20MN%20Gredos%20-%2001.jpg?width=640","Country":"https://commons.wikimedia.org/wiki/Special:FilePath/Katie%20Armiger%207-28-11%20Everett.jpg?width=640","Indie":"https://commons.wikimedia.org/wiki/Special:FilePath/Indie%20rock%20band%20Ans.%20Andur%20in%20J%C3%A4neda%2C%20Estonia%20(July%202026).jpg?width=640","Disco":"https://commons.wikimedia.org/wiki/Special:FilePath/Disco%20ball%20with%20reflections%20104.JPG?width=640"};
function genreRemote(name, tag) {
  if (GENRE_PICS[name]) return GENRE_PICS[name];
  return (mbStore.genres[name].image || genreFallbackImage(tag)).replace('?width=1200', '?width=640');
}
async function buildGenres() {
  if (!mbStore.genres || mbStore.genres.v !== 2) {
    mbStore.genres = { v: 2 };
    await Promise.all(GENRE_LIST.map(async ([name, tag, article]) => {
      mbStore.genres[name] = { tag, image: await genrePicture(article) };
    }));
    saveMb();
  }
}
async function warmGenreImages() {
  await buildGenres();
  for (const [name, tag] of GENRE_LIST) {
    const url = genreRemote(name, tag);
    if (!url || fs.existsSync(genreFile(name))) continue;
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Vinylla/1.0 (local app)' } });
      if (!r.ok) continue;
      fs.mkdirSync(GENRE_IMG_DIR, { recursive: true });
      fs.writeFileSync(genreFile(name), Buffer.from(await r.arrayBuffer()));
    } catch (err) { /* tried again when the server next starts */ }
  }
}
app.get('/api/genres', async (req, res) => {
  await buildGenres();
  res.json({
    items: GENRE_LIST.map(([name, tag]) => ({
      name, tag,
      image: fs.existsSync(genreFile(name)) ? '/genre-img/' + path.basename(genreFile(name)) : genreRemote(name, tag)
    }))
  });
});

// Songs of one genre: the songs of the famous artists tagged with it, in the order of FAMOUS_ARTISTS.
// Built from what is already cached, so it answers at once.
function genreSongs(tag) {
  const seen = new Set();
  const items = [];
  for (const name of FAMOUS_ARTISTS) {
    const entry = mbStore.artists[(mbStore.famous || {})[name]];
    if (!entry || !(entry.tags || []).includes(tag)) continue;
    for (const t of entry.tracks) {
      const k = norm(t.title);
      if (seen.has(k)) continue;
      seen.add(k);
      items.push({ id: t.id, title: t.title, artist: t.artist, album: t.album, cover: t.cover, duration: t.duration });
    }
  }
  return { items };
}

app.get('/api/mb/genre', (req, res) => {
  const tag = String(req.query.tag || '').replace(/[^a-z0-9 &'-]/gi, '').slice(0, 40).toLowerCase();
  if (!tag) return res.status(400).json({ error: 'Invalid genre' });
  res.json(genreSongs(tag));
});

// The album cover (1200 px, from the Cover Art Archive) of a song, found through MusicBrainz and kept.
// Second free source for album covers: Deezer's public search (no key needed).
async function deezerCover(artist, title) {
  try {
    const q = [title, artist].filter(Boolean).join(' ');
    const r = await fetch('https://api.deezer.com/search?q=' + encodeURIComponent(q) + '&limit=5', { signal: AbortSignal.timeout(4000) });
    const j = await r.json();
    const hit = (j.data || []).find(t => t.album && t.album.cover_xl);
    return hit ? hit.album.cover_xl : '';
  } catch (e) { return ''; }
}
app.get('/api/cover', async (req, res) => {
  const artist = String(req.query.artist || '').trim().slice(0, 80);
  const title = String(req.query.title || '').replace(/\s*[([][^)\]]*[)\]]/g, '').trim().slice(0, 80);
  if (!title) return res.json({ cover: '' });
  mbStore.covers = mbStore.covers || {};
  if (!mbStore.coversCleaned) { for (const k of Object.keys(mbStore.covers)) if (!mbStore.covers[k]) delete mbStore.covers[k]; mbStore.coversCleaned = true; saveMb(); }
  const key = norm(artist) + '|' + norm(title);
  if (key in mbStore.covers) return res.json({ cover: mbStore.covers[key] });
  try {
    const dz = await deezerCover(artist, title);
    if (dz) { mbStore.covers[key] = dz; saveMb(); return res.json({ cover: dz }); }
    const q = 'recording:"' + title + '"' + (artist ? ' AND artist:"' + artist + '"' : '');
    const d = await mbFetch('recording/?query=' + encodeURIComponent(q) + '&limit=5');
    let cover = '';
    for (const r of d.recordings || []) {
      const rel = (r.releases || []).find(x => isOriginalGroup(x['release-group'] || {}));
      if (rel) { cover = 'https://coverartarchive.org/release-group/' + rel['release-group'].id + '/front-1200'; break; }
    }
    if (!cover) cover = await deezerCover(artist, title);
    mbStore.covers[key] = cover;
    saveMb();
    res.json({ cover });
  } catch (err) {
    res.json({ cover: await deezerCover(artist, title) });
  }
});

// The MusicBrainz album of a card, found by its exact title and artist. Kept once found.
app.get('/api/mb/resolve-album', async (req, res) => {
  const title = String(req.query.title || '').trim().slice(0, 120);
  const artist = String(req.query.artist || '').trim().slice(0, 80);
  if (!title) return res.status(400).json({ error: 'title is required' });
  mbStore.albumIds = mbStore.albumIds || {};
  const key = 'v4|' + norm(artist) + '|' + norm(title);
  if (key in mbStore.albumIds) return res.json({ id: mbStore.albumIds[key] });
  try {
    const d = await mbFetch('release-group/?query=' + encodeURIComponent('releasegroup:"' + title.replace(/\s*[(\[].*$/, '') + '" AND artist:"' + artist + '"') + '&limit=15');
    const groups = (d['release-groups'] || []).filter(g => ['Album', 'EP', 'Single'].includes(g['primary-type']) && norm(creditOf(g['artist-credit'])) === norm(artist));
    // The album's own title (edition words such as Deluxe are ignored), preferring a studio album over a single.
    const base = t => norm(t.replace(/\s*[([].*$/, '').replace(/:.*$/, ''));
    const exact = groups.find(g => base(g.title) === base(title) && g['primary-type'] === 'Album') || groups.find(g => base(g.title) === base(title));
    // A title that starts the same way (for example "SOS Deluxe: LANA" for "SOS") when there is no exact one.
    const near = exact || groups.find(g => base(g.title).length >= 3 && base(title).startsWith(base(g.title)));
    const id = near ? near.id : '';
    mbStore.albumIds[key] = id;
    saveMb();
    res.json({ id });
  } catch (err) {
    res.status(502).json({ error: 'Could not reach MusicBrainz' });
  }
});

// An album cover (500 px), kept on this computer after the first time.
app.get('/api/mb/cover/:id', async (req, res) => {
  const id = String(req.params.id).replace(/[^0-9a-f-]/g, '');
  const file = path.join(COVER_DIR, id + '.jpg');
  res.set('Cache-Control', 'public, max-age=2592000');
  if (fs.existsSync(file)) return res.sendFile(file);
  try {
    const r = await fetch('https://coverartarchive.org/release-group/' + id + '/front-500');
    if (!r.ok) return res.status(404).end();
    const buf = Buffer.from(await r.arrayBuffer());
    fs.mkdirSync(COVER_DIR, { recursive: true });
    fs.writeFileSync(file, buf);
    res.type('jpg').send(buf);
  } catch (err) {
    res.status(502).end();
  }
});

app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Loads everything in the background when the server starts, so the pages answer at once.
async function warmAll() {
  try { await getTrending(); } catch (err) { /* try again on the next request */ }
  for (const name of POPULAR_ARTISTS) {
    await albumsOfArtist(name).catch(() => []);
  }
  // Songs: build the list if needed, then the album covers.
  if (!viewBuilding) buildViews().catch(() => null);
  for (const t of Object.values(viewCache).flat().slice(0, 400)) {
    await deezerTrackCover(t.channel.replace(/s*-s*topic$|s*vevo$/i, ''), t.title).catch(() => null);
  }
}

// Countries of the well-known artists, one request per second (MusicBrainz's limit), in their own task.
async function warmCountries() {
  for (const name of POPULAR_ARTISTS) {
    if (!countryCache.has(name)) await artistCountry(name);
  }
}

require('./accounts')(app);
require('./assistant')(app);
app.listen(PORT, () => {
  console.log(`Vinylla running on http://localhost:${PORT}`);
  warmAll();
  warmCountries();
  artistPoolYT().catch(() => null);
  warmGenreImages().catch(() => null);
  warmCatalogue().then(() => warmGenreImages()).catch(() => null);
});
