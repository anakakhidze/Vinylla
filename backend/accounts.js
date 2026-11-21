// Accounts, sessions, and saved library (favourites + playlists) backed by PostgreSQL.
// Loaded from server.js with: require('./accounts')(app);
const crypto = require('crypto');
const express = require('express');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const json = express.json({ limit: '2mb' });
const SESSION_DAYS = 30;

// Applies each numbered file in backend/migrations once, in order, and records it in schema_migrations.
async function migrate() {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const dir = require('path').join(__dirname, 'migrations');
  const files = require('fs').readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  for (const f of files) {
    const done = await pool.query('SELECT 1 FROM schema_migrations WHERE name = $1', [f]);
    if (done.rowCount) continue;
    const sql = require('fs').readFileSync(require('path').join(dir, f), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
      await client.query('COMMIT');
      console.log('Applied database migration', f);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return 'scrypt$' + salt + '$' + crypto.scryptSync(pw, salt, 64).toString('hex');
}
function checkPassword(pw, stored) {
  const [scheme, salt, hex] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !hex) return false;
  const want = Buffer.from(hex, 'hex');
  const got = crypto.scryptSync(pw, salt, want.length);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

function getCookie(req, name) {
  const part = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(name + '='));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : null;
}
async function currentUser(req) {
  const token = getCookie(req, 'vsid');
  if (!token) return null;
  const r = await pool.query(
    'SELECT u.id, u.email, u.name, u.avatar FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = $1 AND s.created_at > now() - ($2 || \' days\')::interval',
    [token, String(SESSION_DAYS)]
  );
  return r.rows[0] || null;
}
async function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query('INSERT INTO sessions (token, user_id) VALUES ($1, $2)', [token, userId]);
  res.setHeader('Set-Cookie', 'vsid=' + token + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + SESSION_DAYS * 86400);
}
function clean(s, max) {
  return String(s || '').trim().slice(0, max);
}

// Today's most-listened songs, from the plays table.
async function topToday(n) {
  const today = await pool.query('SELECT track FROM plays WHERE day = CURRENT_DATE ORDER BY count DESC, video_id LIMIT $1', [n * 3]);
  let rows = today.rows.map(x => x.track);
  if (rows.length < n) {
    const allTime = await pool.query('SELECT p.track FROM (SELECT video_id, SUM(count) AS total FROM plays GROUP BY video_id) s JOIN LATERAL (SELECT track FROM plays WHERE video_id = s.video_id ORDER BY day DESC LIMIT 1) p ON true ORDER BY s.total DESC LIMIT $1', [n * 3]);
    rows = rows.concat(allTime.rows.map(x => x.track));
  }
  const seen = new Set();
  const out = [];
  for (const t of rows) {
    const k = (String(t.title || '') + '|' + String(t.channel || '')).toLowerCase();
    if (seen.has(k) || seen.has(t.videoId)) continue;
    seen.add(k);
    seen.add(t.videoId);
    out.push(t);
    if (out.length >= n) break;
  }
  return out;
}
module.exports = function mountAccounts(app) {
  migrate().catch(e => console.error('Database setup failed:', e.message));

  app.post('/api/auth/register', json, async (req, res) => {
    const email = clean(req.body.email, 200).toLowerCase();
    const password = String(req.body.password || '');
    const name = clean(req.body.name, 60) || email.split('@')[0];
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    try {
      const r = await pool.query('INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id, email, name, avatar',
        [email, name, hashPassword(password)]);
      await startSession(res, r.rows[0].id);
      res.json({ user: r.rows[0] });
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'An account with this email already exists.' });
      res.status(500).json({ error: 'Could not create the account.' });
    }
  });

  app.post('/api/auth/login', json, async (req, res) => {
    const email = clean(req.body.email, 200).toLowerCase();
    const password = String(req.body.password || '');
    const r = await pool.query('SELECT id, email, name, avatar, password_hash FROM users WHERE email = $1', [email]);
    const u = r.rows[0];
    if (!u || !checkPassword(password, u.password_hash)) return res.status(401).json({ error: 'Email or password is incorrect.' });
    await startSession(res, u.id);
    res.json({ user: { id: u.id, email: u.email, name: u.name, avatar: u.avatar } });
  });

  app.post('/api/auth/logout', async (req, res) => {
    const token = getCookie(req, 'vsid');
    if (token) await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
    res.setHeader('Set-Cookie', 'vsid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    res.json({ ok: true });
  });

  // Record one listen (called by the app after a song has played for 30 seconds).
  app.post('/api/plays', json, async (req, res) => {
    const videoId = String(req.body.videoId || '');
    if (!/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) return res.status(400).json({ error: 'Bad video id.' });
    const track = { videoId, title: clean(req.body.title, 160), channel: clean(req.body.channel, 120), thumb: clean(req.body.thumb, 400) };
    await pool.query(
      `INSERT INTO plays (video_id, day, count, track) VALUES ($1, CURRENT_DATE, 1, $2)
       ON CONFLICT (video_id, day) DO UPDATE SET count = plays.count + 1`,
      [videoId, JSON.stringify(track)]
    );
    res.json({ ok: true });
  });
  // Profile photo: a small JPG, PNG, or WebP stored as a data URL (about 300 KB at most).
  app.put('/api/me/avatar', json, async (req, res) => {
    const user = await currentUser(req);
    if (!user) return res.status(401).json({ error: 'Sign in first.' });
    const a = String(req.body.avatar || '');
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(a) || a.length > 400000) return res.status(400).json({ error: 'Choose a JPG, PNG, or WebP image under 300 KB.' });
    await pool.query('UPDATE users SET avatar = $1 WHERE id = $2', [a, user.id]);
    res.json({ ok: true, avatar: a });
  });
  app.delete('/api/me/avatar', async (req, res) => {
    const user = await currentUser(req);
    if (!user) return res.status(401).json({ error: 'Sign in first.' });
    await pool.query('UPDATE users SET avatar = NULL WHERE id = $1', [user.id]);
    res.json({ ok: true });
  });
  // ---- People: search, follow, block, and public profiles. Actions are rate-limited per user. ----
  const actionLog = new Map();
  function limited(uid) { const now = Date.now(); const a = (actionLog.get(uid) || []).filter(t => now - t < 60000); if (a.length >= 30) { actionLog.set(uid, a); return true; } a.push(now); actionLog.set(uid, a); return false; }
  const safeId = v => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
  const blockedEither = `NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = u.id AND b.blocked_id = $1) OR (b.blocker_id = $1 AND b.blocked_id = u.id))`;
  app.get('/api/users/search', async (req, res) => {
    const me = await currentUser(req);
    if (!me) return res.status(401).json({ error: 'Sign in first.' });
    if (limited(me.id)) return res.status(429).json({ error: 'Too many searches. Try again in a minute.' });
    const q = clean(req.query.q, 60);
    if (q.length < 2) return res.json({ items: [] });
    const r = await pool.query(`SELECT u.id, u.name, u.avatar, (SELECT COUNT(*) FROM follows f WHERE f.followee_id = u.id)::int AS followers FROM users u WHERE u.id <> $1 AND u.name ILIKE $2 AND ${blockedEither} ORDER BY u.name LIMIT 20`, [me.id, '%' + q.replace(/[%_]/g, function (m) { return '\\' + m; }) + '%']);
    res.json({ items: r.rows });
  });
  app.get('/api/users/:id', async (req, res) => {
    const me = await currentUser(req);
    if (!me) return res.status(401).json({ error: 'Sign in first.' });
    const id = safeId(req.params.id);
    if (!id) return res.status(404).json({ error: 'Not found.' });
    const r = await pool.query(`SELECT u.id, u.name, u.avatar, l.playlists FROM users u LEFT JOIN libraries l ON l.user_id = u.id WHERE u.id = $2 AND ${blockedEither}`, [me.id, id]);
    const u = r.rows[0];
    if (!u) return res.status(404).json({ error: 'Not found.' });
    const c = await pool.query('SELECT (SELECT COUNT(*) FROM follows WHERE followee_id = $1)::int AS followers, (SELECT COUNT(*) FROM follows WHERE follower_id = $1)::int AS following, EXISTS (SELECT 1 FROM follows WHERE follower_id = $2 AND followee_id = $1) AS is_following', [id, me.id]);
    const pls = (Array.isArray(u.playlists) ? u.playlists : []).filter(p => p && p.public === true).map(p => ({ id: p.id, name: p.name, tracks: (Array.isArray(p.tracks) ? p.tracks : []).slice(0, 100).map(t => ({ id: t.id, t: t.t, a: t.a, yt: t.yt || null, img: t.img || null })) }));
    res.json({ user: { id: u.id, name: u.name, avatar: u.avatar, followers: c.rows[0].followers, following: c.rows[0].following, isFollowing: c.rows[0].is_following, isSelf: u.id === me.id }, playlists: pls });
  });
  app.post('/api/users/:id/follow', async (req, res) => {
    const me = await currentUser(req);
    if (!me) return res.status(401).json({ error: 'Sign in first.' });
    if (limited(me.id)) return res.status(429).json({ error: 'Too many actions. Try again in a minute.' });
    const id = safeId(req.params.id);
    if (!id || id === me.id) return res.status(400).json({ error: 'Invalid user.' });
    const ok = await pool.query(`SELECT 1 FROM users u WHERE u.id = $2 AND ${blockedEither}`, [me.id, id]);
    if (!ok.rowCount) return res.status(404).json({ error: 'Not found.' });
    await pool.query('INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [me.id, id]);
    res.json({ ok: true });
  });
  app.delete('/api/users/:id/follow', async (req, res) => {
    const me = await currentUser(req);
    if (!me) return res.status(401).json({ error: 'Sign in first.' });
    if (limited(me.id)) return res.status(429).json({ error: 'Too many actions. Try again in a minute.' });
    const id = safeId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid user.' });
    await pool.query('DELETE FROM follows WHERE follower_id = $1 AND followee_id = $2', [me.id, id]);
    res.json({ ok: true });
  });
  app.post('/api/users/:id/block', async (req, res) => {
    const me = await currentUser(req);
    if (!me) return res.status(401).json({ error: 'Sign in first.' });
    if (limited(me.id)) return res.status(429).json({ error: 'Too many actions. Try again in a minute.' });
    const id = safeId(req.params.id);
    if (!id || id === me.id) return res.status(400).json({ error: 'Invalid user.' });
    await pool.query('INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [me.id, id]);
    await pool.query('DELETE FROM follows WHERE (follower_id = $1 AND followee_id = $2) OR (follower_id = $2 AND followee_id = $1)', [me.id, id]);
    res.json({ ok: true });
  });
  app.delete('/api/users/:id/block', async (req, res) => {
    const me = await currentUser(req);
    if (!me) return res.status(401).json({ error: 'Sign in first.' });
    const id = safeId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid user.' });
    await pool.query('DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2', [me.id, id]);
    res.json({ ok: true });
  });
  // Friends: people you follow who also follow you back (and are not blocked either way).
  app.get('/api/me/friends', async (req, res) => {
    const me = await currentUser(req);
    if (!me) return res.status(401).json({ error: 'Sign in first.' });
    const r = await pool.query(
      'SELECT u.id, u.name, u.avatar FROM follows f1 ' +
      'JOIN follows f2 ON f2.follower_id = f1.followee_id AND f2.followee_id = f1.follower_id ' +
      'JOIN users u ON u.id = f1.followee_id ' +
      'WHERE f1.follower_id = $1 AND NOT EXISTS (SELECT 1 FROM blocks bl WHERE (bl.blocker_id = $1 AND bl.blocked_id = u.id) OR (bl.blocker_id = u.id AND bl.blocked_id = $1)) ' +
      'ORDER BY u.name',
      [me.id]
    );
    res.json({ items: r.rows });
  });
  // ---- Liked playlists: like another user's public playlist, and see your liked list. Stale likes drop out automatically. ----
  const likeBlocked = "NOT EXISTS (SELECT 1 FROM blocks bl WHERE (bl.blocker_id = $1 AND bl.blocked_id = $2) OR (bl.blocker_id = $2 AND bl.blocked_id = $1))";
  app.post('/api/users/:id/playlists/:pid/like', async (req, res) => {
    const me = await currentUser(req);
    if (!me) return res.status(401).json({ error: 'Sign in first.' });
    if (limited(me.id)) return res.status(429).json({ error: 'Too many actions. Try again in a minute.' });
    const id = safeId(req.params.id);
    const pid = clean(req.params.pid, 60);
    if (!id || id === me.id || !pid) return res.status(400).json({ error: 'Invalid playlist.' });
    const lib = await pool.query('SELECT playlists FROM libraries WHERE user_id = $1', [id]);
    const found = (lib.rows[0] && Array.isArray(lib.rows[0].playlists) ? lib.rows[0].playlists : []).find(p => p && p.id === pid && p.public === true);
    if (!found) return res.status(404).json({ error: 'This playlist is not public.' });
    const ok = await pool.query('SELECT 1 FROM users u WHERE u.id = $2 AND ' + likeBlocked, [me.id, id]);
    if (!ok.rowCount) return res.status(404).json({ error: 'Not available.' });
    await pool.query('INSERT INTO playlist_likes (user_id, owner_id, playlist_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [me.id, id, pid]);
    res.json({ ok: true });
  });
  app.delete('/api/users/:id/playlists/:pid/like', async (req, res) => {
    const me = await currentUser(req);
    if (!me) return res.status(401).json({ error: 'Sign in first.' });
    const id = safeId(req.params.id);
    const pid = clean(req.params.pid, 60);
    if (!id || !pid) return res.status(400).json({ error: 'Invalid playlist.' });
    await pool.query('DELETE FROM playlist_likes WHERE user_id = $1 AND owner_id = $2 AND playlist_id = $3', [me.id, id, pid]);
    res.json({ ok: true });
  });
  app.get('/api/me/liked', async (req, res) => {
    const me = await currentUser(req);
    if (!me) return res.status(401).json({ error: 'Sign in first.' });
    const r = await pool.query('SELECT pl.owner_id, pl.playlist_id, u.name AS owner_name, l.playlists FROM playlist_likes pl JOIN users u ON u.id = pl.owner_id LEFT JOIN libraries l ON l.user_id = pl.owner_id WHERE pl.user_id = $1 ORDER BY pl.created_at DESC', [me.id]);
    const items = [];
    const stale = [];
    for (const row of r.rows) {
      const p = (Array.isArray(row.playlists) ? row.playlists : []).find(x => x && x.id === row.playlist_id && x.public === true);
      if (!p) { stale.push(row); continue; }
      items.push({ ownerId: row.owner_id, ownerName: row.owner_name, id: p.id, name: p.name, tracks: (Array.isArray(p.tracks) ? p.tracks : []).slice(0, 100).map(t => ({ id: t.id, t: t.t, a: t.a, yt: t.yt || null, img: t.img || null })) });
    }
    if (stale.length) await pool.query('DELETE FROM playlist_likes WHERE user_id = $1 AND (owner_id, playlist_id) IN (SELECT * FROM unnest($2::int[], $3::text[]))', [me.id, stale.map(x => x.owner_id), stale.map(x => x.playlist_id)]);
    res.json({ items });
  });
  app.get('/api/auth/me', async (req, res) => {
    const user = await currentUser(req);
    res.json({ user });
  });

  app.get('/api/me/library', async (req, res) => {
    const user = await currentUser(req);
    if (!user) return res.status(401).json({ error: 'Sign in first.' });
    const r = await pool.query('SELECT favourites, playlists FROM libraries WHERE user_id = $1', [user.id]);
    const row = r.rows[0] || { favourites: [], playlists: [] };
    res.json({ favourites: row.favourites, playlists: row.playlists });
  });

  app.put('/api/me/library', json, async (req, res) => {
    const user = await currentUser(req);
    if (!user) return res.status(401).json({ error: 'Sign in first.' });
    const favs = Array.isArray(req.body.favourites) ? req.body.favourites.slice(0, 2000) : null;
    const pls = Array.isArray(req.body.playlists) ? req.body.playlists.slice(0, 200).map(p => ({
      id: clean(p.id, 60), name: clean(p.name, 80), public: p.public === true, tracks: Array.isArray(p.tracks) ? p.tracks.slice(0, 500) : []
    })) : null;
    const cur = await pool.query('SELECT favourites, playlists FROM libraries WHERE user_id = $1', [user.id]);
    const base = cur.rows[0] || { favourites: [], playlists: [] };
    await pool.query(
      `INSERT INTO libraries (user_id, favourites, playlists, updated_at) VALUES ($1, $2, $3, now())
       ON CONFLICT (user_id) DO UPDATE SET favourites = EXCLUDED.favourites, playlists = EXCLUDED.playlists, updated_at = now()`,
      [user.id, JSON.stringify(favs ?? base.favourites), JSON.stringify(pls ?? base.playlists)]
    );
    res.json({ ok: true });
  });
};
module.exports.topToday = topToday;
module.exports.currentUser = currentUser;
