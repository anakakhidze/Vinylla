let likedView=false;
let peopleTab='search';
/* Carousel state (declared first, because the home page draws the carousel while the script loads). */
let cfIdx=0,cfTimer=null,cfWheelT=0,cfDragX=null,cfCount=0;
let lidOpenT=0;
// Genres (pictures and MusicBrainz tags come from the server) and playlists (saved on this computer).
let GENRE_INFO={};
let plStore=[];try{plStore=JSON.parse(localStorage.getItem('vinylla.playlists')||'[]')}catch(e){plStore=[]}
let songSearchOn=false;
let signedIn=false,favItems=[],upT=null,currentUser=null;
async function authCall(path,body){try{const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json().catch(()=>({}));if(!r.ok){alert(j.error||'Something went wrong.');return null}return j}catch(e){alert('Could not reach the server.');return null}}
function reconcileFav(){favourites.clear();T.forEach((t,i)=>{if(favItems.some(f=>f.id===t.id))favourites.add(i)})}
function scheduleUpload(){if(!signedIn)return;clearTimeout(upT);upT=setTimeout(uploadLibrary,800)}
async function uploadLibrary(){if(!signedIn)return;try{await fetch('/api/me/library',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({favourites:favItems,playlists:plStore})})}catch(e){}}
async function afterSignIn(user){signedIn=true;currentUser=user||null;try{localStorage.setItem('vin-user',user.name)}catch(e){}setAcct();try{const r=await fetch('/api/me/library');if(r.ok){const j=await r.json();const empty=!j.favourites.length&&!j.playlists.length;const localHas=plStore.length>0||favItems.length>0;if(empty&&localHas){await uploadLibrary()}else{favItems=j.favourites;plStore=j.playlists;savePl()}}}catch(e){}reconcileFav();render()}
function setFavItem(t,on){if(!t)return;if(on){if(!favItems.some(f=>f.id===t.id))favItems.push({id:t.id,t:t.t,a:t.a,g:t.g,yt:t.yt||null,lyricOnly:!!t.lyricOnly})}else{favItems=favItems.filter(f=>f.id!==t.id)}scheduleUpload()}
function savePl(){try{localStorage.setItem('vinylla.playlists',JSON.stringify(plStore))}catch(e){}scheduleUpload()}
function plById(id){return plStore.find(p=>p.id===id)}
function toast(msg){const stack=[...document.querySelectorAll('.toast:not(.hide)')];stack.forEach((o,k)=>o.style.setProperty('--lift',((stack.length-k)*64)+'px'));const t=document.createElement('div');t.className='toast'+(/^Removed/.test(msg)?' neutral':'');t.innerHTML='<span class="toast-ico"><svg viewBox="0 0 24 24" aria-hidden="true"><circle class="toast-ring" cx="12" cy="12" r="10"/><path class="toast-tick" d="M7.5 12.5l3 3 6-6.5"/></svg></span><span class="toast-txt">'+esc(msg)+'</span>';document.body.appendChild(t);requestAnimationFrame(()=>requestAnimationFrame(()=>t.classList.add('show')));setTimeout(()=>{t.classList.remove('show');t.classList.add('hide');setTimeout(()=>t.remove(),450)},2000)}
function askText(title,value,ok){const o=document.createElement('div');o.className='dlg';o.innerHTML='<div class="dlg-box"><h3>'+esc(title)+'</h3><input id="dlgIn" maxlength="60" value="'+esc(value||'')+'" autocomplete="off"><div class="dlg-actions"><button class="pill" id="dlgNo">Cancel</button><button class="big" id="dlgYes">Save</button></div></div>';document.body.appendChild(o);const inp=o.querySelector('#dlgIn');inp.focus();inp.select();const close=()=>o.remove();o.querySelector('#dlgNo').onclick=close;o.onclick=e=>{if(e.target===o)close()};const done=()=>{const v=inp.value.trim();close();if(v)ok(v)};o.querySelector('#dlgYes').onclick=done;inp.onkeydown=e=>{if(e.key==='Enter')done();if(e.key==='Escape')close()}}
function newPlaylist(){askText('New playlist','',name=>{const p={id:'p'+Date.now().toString(36),name,tracks:[]};plStore.push(p);savePl();openPlaylist(p.id)})}
function openPlaylist(id){const p=plById(id);if(!p)return;albumView={loaded:true,playlist:id,album:{id:'pl:'+id,title:p.name,artist:'Your playlist',cover:p.cover||(p.tracks[0]&&p.tracks[0].img)||'',year:'',kind:'Playlist'},tracks:p.tracks.map(t=>({videoId:t.yt||null,title:t.t,artist:t.a,album:t.al,duration:t.dur,cover:t.img}))};render()}
function removeFromPlaylist(id,i){const p=plById(id);if(!p)return;p.tracks.splice(i,1);savePl();openPlaylist(id)}
function renamePlaylist(id){const p=plById(id);if(!p)return;askText('Rename playlist',p.name,name=>{p.name=name;savePl();openPlaylist(id)})}
function deletePlaylist(id){const p=plById(id);if(!p)return;if(!confirm('Delete "'+p.name+'"? This cannot be undone.'))return;plStore=plStore.filter(x=>x.id!==id);savePl();albumView=null;render()}
function playlistBar(id){const p=plById(id);return '<div class="pl-bar"><button class="pill" data-plrename="'+esc(id)+'">Rename</button><label class="pill pl-up">Change cover<input type="file" accept="image/*" data-plcover="'+esc(id)+'"></label>'+(p&&p.cover?'<button class="pill" data-plrmcover="'+esc(id)+'">Remove cover</button>':'')+'<button class="pill pl-del" data-pldelete="'+esc(id)+'">Delete playlist</button></div>'}
function closePop(){document.getElementById('plPop')?.remove()}
function addTo(p,t){p.tracks.push({id:t.id,t:t.t,a:t.a,al:t.al,img:t.img,yt:t.yt,q:t.q,dur:t.dur});savePl();toast('Added to '+p.name)}
function openAddTo(index,anchor){closePop();const t=T[index];if(!t)return;const r=anchor.getBoundingClientRect();const pop=document.createElement('div');pop.id='plPop';pop.className='pl-pop';pop.style.left=Math.max(8,Math.min(r.left,innerWidth-250))+'px';pop.style.top=(r.bottom+6)+'px';pop.innerHTML=plStore.map(p=>'<button data-plpick="'+esc(p.id)+'">'+esc(p.name)+'<small>'+p.tracks.length+'</small></button>').join('')+'<button class="pl-new" data-plnew="1">+ New playlist</button>';document.body.appendChild(pop);pop.onclick=e=>{const b=e.target.closest('button');if(!b)return;closePop();if(b.dataset.plnew){askText('New playlist','',name=>{const p={id:'p'+Date.now().toString(36),name,tracks:[]};plStore.push(p);addTo(p,t)});return}const p=plById(b.dataset.plpick);if(p){addTo(p,t)}};setTimeout(()=>document.addEventListener('click',ev=>{if(!ev.target.closest||!ev.target.closest('#plPop'))closePop()},{once:true}),0)}
const $=id=>document.getElementById(id),clamp=(x,a,b)=>Math.min(b,Math.max(a,x)),D=120;
const T=[
{t:'Neon Static',a:'Vinylla Labs',g:'Synthwave',c:['#9B3DF0','#00F0FF'],bpm:96,root:220,sc:[0,3,7,10,12,7,3],w:'sawtooth'},
{t:'Chrome Rain',a:'Night Circuit',g:'Cyberpunk',c:['#FF2E88','#4B1A8F'],bpm:124,root:174.6,sc:[0,1,5,7,8,7,5,1],w:'square'},
{t:'Paper Lanterns',a:'Low Orbit',g:'Lo-Fi',c:['#FFB35C','#8A4BD6'],bpm:78,root:196,sc:[0,4,7,11,9,7,4],w:'sine'},
{t:'Tidal Glass',a:'Slow Meridian',g:'Ambient',c:['#00F0FF','#3B2FA8'],bpm:60,root:130.8,sc:[0,7,12,14,19,14,12,7],w:'sine'},
{t:'Pulse Engine',a:'Kilo Volt',g:'Electronic',c:['#9B3DF0','#00F0FF'],bpm:128,root:220,sc:[0,0,7,0,10,0,12,7],w:'triangle'},
{t:'Midnight Groove',a:'Obsidian Club',g:'Synthwave',c:['#8A4BD6','#FF4D8D'],bpm:84,root:196,sc:[0,2,3,7,9,7,3,2],w:'sawtooth'}];
let LY=[],LYT=[],lyrLoaded=false;
const AL=['Neon Dreams','Chrome City','Paper Skies','Deep Tide','Overdrive','After Hours'];
const AR=[...new Set(T.map(t=>t.a))].map((n,i)=>({n,c:T.find(t=>t.a===n).c,l:(4.8-i*.6).toFixed(1)+'M listeners'}));
const GEN=[['Synthwave',0],['Cyberpunk',1],['Lo-Fi',2],['Ambient',3],['Electronic',4]];
const grad=c=>`linear-gradient(135deg,${c[0]},${c[1]})`,fmt=s=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
let preview=false,cur=0,playing=false,played=false,time=0,vol=.7,muted=false,shuffle=false,rep=0,lyr=false,query='',gf='',sortBy='popular',view='home',ctx,master,an,timer,S={start:0,next:0,step:0};
const favourites=new Set(),recent=[];

const gv=()=>(muted?0:vol)*(preview?.25:1);
/* ---------- audio ---------- */
function ensure(){if(ctx)return;ctx=new(window.AudioContext||window.webkitAudioContext)();master=ctx.createGain();master.gain.value=gv();an=ctx.createAnalyser();an.fftSize=256;an.smoothingTimeConstant=.8;master.connect(an);an.connect(ctx.destination)}
function note(f,t,len,type,pk){const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.value=f;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(pk,t+.01);g.gain.exponentialRampToValueAtTime(.0001,t+len);o.connect(g);g.connect(master);o.start(t);o.stop(t+len+.05)}
function startSynth(off){const t=T[cur],dur=60/t.bpm/2,pk=t.w==='sine'?.22:.1;clearInterval(timer);S.start=ctx.currentTime-off;S.step=Math.floor(off/dur);S.next=ctx.currentTime+.05;
  timer=setInterval(()=>{while(S.next<ctx.currentTime+.2){const n=t.sc[(S.step*3+(S.step>>2))%t.sc.length];note(t.root*2**(n/12),S.next,dur*.9,t.w,pk);
    if(S.step%4===0)note(t.root/2*2**(t.sc[0]/12),S.next,dur*3,'sine',.45);if(S.step%2===1)note(8000+(S.step%3)*500,S.next,.03,'square',.02);S.next+=dur;S.step++}},50)}
let ytp=null,ytReady=false,ytWant=null,ytCur=null;
const isYT=t=>!!(t&&t.yt);
function trackEnded(){rep===2?pick(cur):(rep===1||shuffle||cur<T.length-1)?next(1):(pause(),time=0)}
window.onYouTubeIframeAPIReady=()=>{ytp=new YT.Player('ytHost',{height:'1',width:'1',playerVars:{playsinline:1,controls:0,rel:0,modestbranding:1},events:{onReady:()=>{ytReady=true;if(ytWant){const w=ytWant;ytWant=null;w()}},onStateChange:e=>{if(e.data===0&&isYT(T[cur]))trackEnded()}}})};
const ytScript=document.createElement('script');ytScript.src='https://www.youtube.com/iframe_api';document.head.appendChild(ytScript);
async function ytPlay(t,off){if(t.yt&&!t.audioResolved){t.audioResolved=true;let vid=null;try{const r=await fetch('/api/yt/audio?'+new URLSearchParams({title:t.t||'',artist:cleanArtist(t.a||'')}));const j=await r.json();vid=j.videoId||null}catch(e){}if(!vid){next();return}t.yt=vid}ytPlayNow(t,off)}
function ytPlayNow(t,off){const go=()=>{if(ytCur===t.yt){ytp.seekTo(off,true);ytp.playVideo()}else{ytCur=t.yt;ytp.loadVideoById({videoId:t.yt,startSeconds:off})}ytp.setVolume(Math.round(gv()*100))};if(ytReady)go();else ytWant=go}
function play(off){if(T[cur]&&T[cur].q&&!T[cur].yt){resolveTrack(T[cur],off);return}if(isYT(T[cur])){ytPlay(T[cur],off);playing=played=true;ui();return}if(ytReady&&ytp)ytp.pauseVideo();ensure();ctx.resume();startSynth(off);playing=played=true;ui()}
function pause(){clearInterval(timer);if(ytReady&&ytp&&isYT(T[cur]))ytp.pauseVideo();playing=false;ui()}
const toggle=()=>playing?pause():play(time);
function pick(i){if(!T[i])return;clearInterval(timer);cur=i;time=0;recent.unshift(i);while(recent.length>8)recent.pop();setTrack();play(0)}
const playSong=i=>{pick(i);location.hash='player'};
function next(d=1){pick(shuffle?(cur+1+Math.floor(Math.random()*(T.length-1)))%T.length:(cur+d+T.length)%T.length)}
let lastYt=0,lastPerf=0;function smoothTime(){if(!playing||!isYT(T[cur])||!ytReady)return time;return lastYt+Math.min((performance.now()-lastPerf)/1000,.5)}
setInterval(()=>{if(!playing)return;if(isYT(T[cur])){if(ytReady&&ytp&&ytp.getCurrentTime){time=ytp.getCurrentTime();lastYt=time;lastPerf=performance.now();if(time>=30&&T[cur]&&!T[cur]._counted){T[cur]._counted=true;countPlay(T[cur])}const d=ytp.getDuration()||0;if(d){$('seek').max=d;$('td').textContent=fmt(d)}if(d&&time>2&&T[cur]&&!T[cur].durChecked){T[cur].durChecked=true;refreshLyricsDuration(T[cur],d)}}}else{time=ctx.currentTime-S.start;if(time>=D)trackEnded()}prog()},200);

/* ---------- ui ---------- */
function prog(){$('seek').value=time;$('tc').textContent=fmt(time)}
function ui(){if(window.renderQueue&&view==='player')renderQueue();$('pp').textContent=playing?'⏸':'▶';$('pp').setAttribute('aria-label',playing?'Pause':'Play');$('mi').textContent=playing?'⏸':'▶';$('mini').classList.toggle('on',playing);prog()}
// Real durations for YouTube tracks: fetched once per track, then the lists redraw.
async function loadDurations(){
  const ids=[...new Set(T.filter(t=>t.yt&&!t.dur).map(t=>t.yt))];
  if(!ids.length)return;
  try{
    const r=await fetch('/api/yt/durations?ids='+ids.join(','));if(!r.ok)return;
    const map=await r.json();let changed=false;
    T.forEach(t=>{if(t.yt&&map[t.yt]&&!t.dur){t.dur=map[t.yt];changed=true}});
    if(changed){if(window.renderQueue)renderQueue();const cur2=T[cur];if(cur2&&cur2.dur){$('td').textContent=fmt(cur2.dur);$('seek').max=cur2.dur}}
  }catch(e){}
}
// Load synced lyrics for the current track from the API (LRC timestamps).
let lyrOff=0;function offKey(){return 'vinylla.lyroff.'+(T[cur]?T[cur].id:'')}function setOff(v){lyrOff=Math.round(v*10)/10;try{localStorage.setItem(offKey(),String(lyrOff))}catch(e){}lastLi=-2}
if($('syncMinus'))$('syncMinus').onclick=()=>setOff(lyrOff-.5);if($('syncPlus'))$('syncPlus').onclick=()=>setOff(lyrOff+.5);
if($('syncStart'))$('syncStart').onclick=()=>{if(LYT.length)setOff(LYT[0]-time)};
// Measured singing start (seconds) per song, for songs whose lyric timing is late or early.
// Key: 'title|artist' in lowercase letters and digits only. Add rows like: 'senorita|shawnmendes': 13.5,
const SING_START={};
function singStartFor(t){const k=(String(t.t||'')+'|'+String(t.a||'').replace(/[·].*$/,'')).toLowerCase().replace(/[^a-z0-9|]/g,'');for(const key in SING_START){if(k.startsWith(key.replace(/[^a-z0-9|]/g,'')))return SING_START[key]}return null}
let lyrReq=0;
// Re-fetch lyrics using the real length of the playing video, so the right lyric version is chosen.
// Keeps the current lyrics if the new lookup finds nothing.
async function refreshLyricsDuration(t,d){
  if(Math.abs(d-(t.dur||0))<=1)return;
  try{
    const r=await fetch('/api/lyrics?'+new URLSearchParams({title:t.t||'',artist:(t.a||'').replace(/\s*·.*$/,''),duration:Math.round(d)}));
    const j=await r.json();
    if(!j.lrc||T[cur]!==t)return;
    const cl=x=>String(x).toLowerCase().replace(/[^a-z0-9]/g,'');
    const an=cl((t.a||'').replace(/[·].*$/,''));
    const L2=[],T2=[];
    j.lrc.split('\n').forEach(line=>{const m=/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/.exec(line.trim());if(!m)return;const txt=m[3].trim();if(!txt)return;if(cl(txt)===an||cl(txt)===cl(t.t||''))return;T2.push(+m[1]*60+ +m[2]);L2.push(txt)});
    if(!L2.length||T[cur]!==t)return;
    LY=L2;LYT=T2;lastLi=-2;t.dur=d;
  }catch(e){}
}

async function loadLyrics(t){const my=++lyrReq;try{lyrOff=+localStorage.getItem(offKey())||0}catch(e){lyrOff=0}
  LY=[];LYT=[];lyrLoaded=false;lastLi=-1;
  if(!t){return}
  try{
    const r=await fetch('/api/lyrics?'+new URLSearchParams({title:t.t||'',artist:(t.a||'').replace(/\s*·.*$/,''),duration:Math.round(t.dur||0)}));
    const j=await r.json();
    if(my!==lyrReq)return;
    const cl=x=>String(x).toLowerCase().replace(/[^a-z0-9]/g,'');
    if(j.lrc){
      j.lrc.split('\n').forEach(line=>{const m=/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/.exec(line.trim());if(!m)return;const txt=m[3].trim();if(!txt)return;if(cl(txt)===cl(t.a||'').replace(/[·].*$/,'')||cl(txt)===cl(t.t||''))return;LYT.push(+m[1]*60+ +m[2]);LY.push(txt)});
    }
  }catch(e){}
  const ss=singStartFor(t);
  if(ss!=null&&LYT.length){const dl=ss-LYT[0];LYT=LYT.map(x=>x+dl)}
  if(my!==lyrReq)return;
  lyrLoaded=true;lastLi=-2;
  ls.forEach(sp=>sp.visible=false);
  setLines(-1);
}
function setTrack(){const t=T[cur];loadDurations();loadLyrics(t);$('seek').max=t.dur||D;$('td').textContent=fmt(t.dur||D);if(window.renderQueue)renderQueue();$('ncov').style.background=grad(t.c);$('ml').style.background=grad(t.c);$('nt').textContent=t.t;$('na').textContent=t.a+' · '+t.g;if(window.setLabel)setLabel();ui()}
$('pp').onclick=toggle;$('mini').onclick=toggle;$('next').onclick=()=>next(1);$('prev').onclick=()=>time>3?(clearInterval(timer),time=0,play(0)):next(-1);
$('sh').onclick=()=>{shuffle=!shuffle;$('sh').classList.toggle('sel',shuffle)};
$('rp').onclick=()=>{rep=(rep+1)%3;$('rp').textContent=rep===2?'↻1':'↻';$('rp').classList.toggle('sel',rep>0)};
$('seek').oninput=e=>{time=+e.target.value;if(playing){clearInterval(timer);play(time)}else prog()};
function setVol(){if(ytReady&&ytp&&ytp.setVolume)ytp.setVolume(Math.round(gv()*100));if(master)master.gain.setTargetAtTime(gv(),ctx.currentTime,.02);$('mute').textContent=muted||vol===0?'🔇':'🔈'}
$('vol').oninput=e=>{vol=+e.target.value;muted=false;setVol()};$('mute').onclick=()=>{muted=!muted;setVol()};
$('m1').onclick=()=>setLyr(false);$('m2').onclick=()=>setLyr(true);
$('cta').onclick=()=>location.hash='explore';
const G={Spotify:['Authorize with OAuth (PKCE), then search and stream with the Web Playback SDK (Premium required). SDK audio is DRM-protected, so the Web Audio analyser cannot read it; drive visuals from /audio-analysis beat data instead.','GET https://api.spotify.com/v1/search?q=daft+punk&type=track\nAuthorization: Bearer <access_token>\n// Keep the client secret server-side (app/api/spotify/route.ts)'],
 YouTube:['Use the YouTube Data API v3 to search and the IFrame Player API to play. The iframe is cross-origin, so frequency analysis is not possible; use beat metadata or the synthetic analyser.','GET https://www.googleapis.com/youtube/v3/search\n  ?part=snippet&type=video&videoCategoryId=10&q=lofi&key=$YT_KEY'],
 'AI search':['Embed each track (an audio model such as CLAP, or lyrics and tags with a text embedding model) and store vectors in pgvector, Pinecone or Qdrant. Embed the query the same way and return nearest neighbours.','const q = await embed("dreamy synthwave for night drives");\nSELECT id, title FROM tracks ORDER BY embedding <=> $1 LIMIT 10;']};
function tab(k){$('ttext').textContent=G[k][0];$('tcode').textContent=G[k][1];[...$('tabs').children].forEach(b=>b.className='pill'+(b.textContent===k?' sel':''))}
Object.keys(G).forEach(k=>{const b=document.createElement('button');b.textContent=k;b.onclick=()=>tab(k);$('tabs').appendChild(b)});tab('Spotify');
if($('guide'))$('guide').onclick=()=>$('modal').classList.add('open');$('x').onclick=()=>$('modal').classList.remove('open');$('modal').onclick=e=>{if(e.target===$('modal'))$('modal').classList.remove('open')};

/* ---------- explore page ---------- */
let sec='Top songs',rawQ='',secQ='',secRaw='',resTab='all';
let secMBA=[],secMBR=[],secT;
let albumView=null;
const SECS=[['💿','Albums','Sleeves, stories, and full records.'],['✦','Artists','Artists shaping your listening orbit.'],['<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.4c2.3.2 4 1.8 4.5 4.6"/></svg>','Discover people','Find listeners and see the playlists they share.'],['↗','Top songs','A daily handpicked rotation from the Vinylla library.'],['◌','Genres','Pick a sound and let it take you somewhere.'],['♫','Your playlists','Little worlds you can return to.'],['◷','Recent','Your latest listens, ready to pick up again.'],['♡','Favourites','The tracks you’ve kept close.']];
const ok=s=>!secQ||String(s).toLowerCase().includes(secQ);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function filteredTracks(){let a=T.map((t,i)=>({t,i})).filter(({t,i})=>ok([t.t,t.a,t.g,AL[i],t.bpm+' bpm'].join(' ')));if(sec==='Favourites')a=a.filter(x=>favourites.has(x.i));if(sec==='Recent')a=a.filter(x=>recent.includes(x.i)).sort((x,y)=>recent.indexOf(x.i)-recent.indexOf(y.i));if(sortBy==='title')a.sort((x,y)=>x.t.t.localeCompare(y.t.t));if(sortBy==='artist')a.sort((x,y)=>x.t.a.localeCompare(y.t.a));if(sortBy==='tempo')a.sort((x,y)=>x.t.bpm-y.t.bpm);if(sortBy==='popular')a.sort((x,y)=>x.i-y.i);return a}
function toolsBar(){return `<div class="explore-tools"><input id="localSearch" type="search" autocomplete="off" placeholder="Filter ${sec.toLowerCase()}…" value="${esc(secRaw)}" aria-label="Search library"><select id="genreFilter" aria-label="Filter by genre"><option value="">All genres</option>${GEN.map(([g,id])=>`<option value="${id}" ${chartGenre===id?'selected':''}>${g}</option>`).join('')}</select><select id="sortFilter" aria-label="Sort results"><option value="popular" ${sortBy==='popular'?'selected':''}>Popular</option><option value="title" ${sortBy==='title'?'selected':''}>Title A–Z</option><option value="artist" ${sortBy==='artist'?'selected':''}>Artist A–Z</option><option value="tempo" ${sortBy==='tempo'?'selected':''}>Tempo</option></select></div>`}
let chartAlb=[],chartArt=[],revealFrom=Infinity,chartGenre=0,albOffset=0,artOffset=0;
const chartBusy={albums:false,artists:false,tracks:false},chartRetry={albums:0,artists:0,tracks:0};
async function loadGenres(){try{const j=await(await fetch('/api/genres')).json();GENRE_INFO=Object.fromEntries((j.items||[]).map(g=>[g.name,g]));GEN.length=0;GEN.push(...(j.items||[]).map((g,i)=>[g.name,i]))}catch(e){}}
function setGenre(id){chartGenre=id;albOffset=0;chartAlb=[];chartArt=[];chartDone.albums=false;chartDone.artists=false;revealFrom=Infinity;loadLive()}
const chartDone={albums:false,artists:false};
// Each kind loads on its own, so a slow album page never blocks the artist list.
async function loadChartPage(kind){if(chartBusy[kind]||chartDone[kind])return;chartBusy[kind]=true;const ac=new AbortController();const to=setTimeout(()=>ac.abort(),10000);try{const list=kind==='albums'?chartAlb:kind==='artists'?chartArt:T;const r=await fetch(kind==='albums'?'/api/music/popular?index='+albOffset+'&seed='+POP_SEED:kind==='artists'?'/api/music/popular-artists?index='+artOffset+'&seed='+POP_SEED:kind==='tracks'?'/api/music/hits?index='+list.length+'&seed='+POP_SEED:'/api/music/charts/'+kind+'?index='+list.length+'&genre='+chartGenre,{signal:ac.signal});clearTimeout(to);const j=await r.json();if(!r.ok)throw new Error(j.error||'chart');const items=j.items||[];
  // The server is still preparing the artist list: ask again shortly.
  if(kind==='artists'&&!items.length&&!j.done){setTimeout(()=>loadChartPage(kind),2000);return}
  if(kind==='albums')albOffset+=8;
  if(kind==='artists')artOffset+=12;
  if(j.done)chartDone[kind]=true;
  // A list can shift while the server is still warming up, so anything already shown is skipped.
  const seen=new Set(list.map(x=>x.id));const fresh=items.filter(x=>!seen.has(x.id));
  const from=list.length;
  if(kind==='tracks')T.push(...fresh.map(chartTrack));else list.push(...fresh);
  revealFrom=from;chartRetry[kind]=0;
  if(kind==='tracks'&&cur===0&&!playing)setTrack();
  if(!appendMore(kind,from))render();
  // An empty page (no albums for those artists) still needs the next one.
  if(!list.length&&!chartDone[kind])setTimeout(()=>loadChartPage(kind),0)}catch(e){chartRetry[kind]++;setTimeout(()=>loadChartPage(kind),chartRetry[kind]<5?2000:20000)}finally{chartBusy[kind]=false}}
const moreIO=typeof IntersectionObserver!=='undefined'?new IntersectionObserver(es=>{es.forEach(en=>{if(en.isIntersecting){if(sec==='Albums')loadChartPage('albums');if(sec==='Artists')loadChartPage('artists');if(sec==='Top songs'&&!query&&!secQ)loadChartPage('tracks')}})},{rootMargin:'1200px'}):null;
function observeMore(){const s=$('moreSentinel');if(s&&moreIO){moreIO.disconnect();moreIO.observe(s)}}
const rv=i=>i>=revealFrom?' reveal':'';
const sentinel='<div id="moreSentinel" class="more-sentinel"></div>';
function albumCard(r,i){return `<div class="al${rv(i)}" data-album="${esc(r.id)}" data-atitle="${esc(r.title)}" data-aartist="${esc(r.artist)}"><div class="wrap"><div class="disc2" style="--lc:${palFor(r.id)[0]}"></div><img class="sleeve" src="${esc(r.cover)}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none'" style="width:100%;height:100%;border-radius:10px;object-fit:cover"></div><b>${esc(r.title)}</b><small>${esc(r.artist)}</small></div>`}
function imgSrc(u){return /^https:\/\/(yt3\.ggpht\.com|yt4\.ggpht\.com|i\.ytimg\.com|coverartarchive\.org|([a-z-]+\.)?dzcdn\.net)\//.test(u||'')?'/api/img?u='+encodeURIComponent(u):(u||'')}
// Home cards: the first six entries are the top songs of the day, with their own pictures.
function countPlay(t){if(!t||!t.yt)return;fetch('/api/plays',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({videoId:t.yt,title:t.t||'',channel:t.a||'',thumb:t.fallbackImg||''})}).catch(()=>{})}
// Finds the black bars around a picture and returns the largest square that is picture only.
function cropInfo(im){const W=im.naturalWidth,H=im.naturalHeight;const sc=200/Math.max(W,H);const w=Math.max(1,Math.round(W*sc)),h=Math.max(1,Math.round(H*sc));const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(im,0,0,w,h);const d=g.getImageData(0,0,w,h).data;const col=new Float32Array(w),row=new Float32Array(h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,v=(d[i]+d[i+1]+d[i+2])/3;col[x]+=v;row[y]+=v}const thr=12;let x0=0,x1=w-1,y0=0,y1=h-1;while(x0<x1&&col[x0]/h<thr)x0++;while(x1>x0&&col[x1]/h<thr)x1--;while(y0<y1&&row[y0]/w<thr)y0++;while(y1>y0&&row[y1]/w<thr)y1--;const k=W/w,kh=H/h;let sx=x0*k,sy=y0*kh,sw=(x1-x0+1)*k,sh=(y1-y0+1)*kh;const sq=Math.min(sw,sh);sx+=(sw-sq)/2;sy+=(sh-sq)/2;return{sx,sy,sq}}
function renderHomeTop(){cfRender()}
function applyTopSongs(){fetch('/api/music/top').then(r=>r.json()).then(j=>{const items=(j&&j.items)||[];cfCount=Math.min(6,items.length,T.length);items.slice(0,cfCount).forEach((it,i)=>{const t=T[i];t.t=cleanTitle(it.title);t.a=cleanArtist(it.channel);t.al=t.a;t.g='Top today';t.yt=it.videoId;t.id='yt'+it.videoId;const paint=()=>{renderHomeTop();if(cards[i]){cards[i].front.material.map=cardTex(t);cards[i].front.material.needsUpdate=true}};paint();const alts=[it.thumb||('https://i.ytimg.com/vi/'+it.videoId+'/hqdefault.jpg'),'https://i.ytimg.com/vi/'+it.videoId+'/mqdefault.jpg','https://i.ytimg.com/vi/'+it.videoId+'/default.jpg'];const th0=alts[0];const load=u=>{const im=new Image();im.crossOrigin='anonymous';im.onload=()=>{try{t._crop=cropInfo(im)}catch(e){t._crop=null}t._imgEl=im;t._sq=null;paint()};im.onerror=()=>{const n=alts.shift();if(n)load(n)};im.src=imgSrc(u)};fetch('/api/cover?'+new URLSearchParams({artist:String(t.a||'').replace(/s*-?s*Topic$/i,''),title:(String(t.t||'').includes(' - ')?String(t.t).split(' - ').slice(1).join(' - '):String(t.t||''))})).then(r=>r.json()).then(j=>load(j&&j.cover?j.cover:th0)).catch(()=>load(th0))})}).catch(()=>{})}
function artistCard(a,i){return `<div class="ar${rv(i)}" data-artist="${esc(a.id)}"><div class="av2" style="background:${grad(palFor(a.id))}"><img src="${esc(imgSrc(a.photo))}" alt="" loading="lazy" decoding="async" style="position:absolute;inset:0;width:100%;height:100%;border-radius:50%;object-fit:cover;display:${a.photo?'block':'none'}"></div><b>${esc(a.name)}</b><small>${artInfo(a)}</small></div>`}
function trackCard(t,i,r){return `<div class="sc glass tilt" data-i="${i}"><span class="rk">#${r+1} · TODAY</span><div class="art" style="background:${artBg(t)}">${t.img?'':t.t[0]}</div><b>${t.t}</b><small>${t.a} · ${t.g}</small><button class="fav" data-fav="${i}" aria-label="${favourites.has(i)?'Remove from':'Add to'} favourites">${favourites.has(i)?'♥':'♡'}</button><button class="addpl" data-addpl="${i}" aria-label="Add to playlist">+</button></div>`}
// Adds only the new cards to the open grid, so the page does not rebuild on every load.
function appendMore(kind,from){
  const grid=document.querySelector('#content .grid');
  const shows=kind==='albums'?sec==='Albums':kind==='artists'?sec==='Artists':sec==='Top songs'&&sortBy==='popular';
  if(!grid||!shows||query||secQ)return false;
  const list=kind==='albums'?chartAlb:kind==='artists'?chartArt:T;
  grid.insertAdjacentHTML('beforeend',list.slice(from).map((x,j)=>kind==='albums'?albumCard(x,from+j):kind==='artists'?artistCard(x,from+j):trackCard(x,from+j,from+j)).join(''));
  document.getElementById('moreSentinel')?.remove();
  if(!chartDone[kind])grid.insertAdjacentHTML('afterend',sentinel);
  observeMore();
  return true;
}
const POP_SEED=Math.floor(Math.random()*1e9);
function shuffleArr(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function chartTrack(x){return{id:x.yt?'yt'+x.yt:'dz'+x.id,t:cleanTitle(x.title),a:cleanArtist(x.artist),al:x.album||x.title,g:'Chart',dur:x.duration,img:x.cover,yt:x.yt||null,q:x.yt?null:x.artist+' '+x.title,c:palFor(x.yt||x.id),bpm:0,root:220,sc:[0,3,7,10,12,7,3],w:'sine'}}
function artBg(t){if(!t.img&&t.fallbackImg)return "url('"+t.fallbackImg+"') center/cover no-repeat";if(!t.img)return grad(t.c);const yt=/ytimg.com/.test(t.img);return "url('"+t.img+"') center/"+(yt?'135% auto':'cover')+' no-repeat'}
function render(){if(signedIn||favItems.length)reconcileFav();
  $('menu').innerHTML=SECS.map(([e,n])=>`<button class="mi${n===sec?' on':''}" data-s="${n}"><span>${e}</span>${n}</button>`).join('');
  if(albumView){$('content').innerHTML=albumView.playlist?albumHTML().replace('<div class="al-list">',playlistBar(albumView.playlist)+'<div class="al-list">'):albumHTML();return}
  if(query&&query.length>=2){$('content').innerHTML=toolsBar()+resultsHTML();bindExploreTools();return}
  let h=`<h2>${sec}</h2><p class="sub">${SECS.find(s=>s[1]===sec)[2]}</p>`,b='',n=0;
  if(sec==='Top songs'){hdCovers();const tracks=filteredTracks();b='<div class="grid">'+tracks.map(({t,i},r)=>(n++,trackCard(t,i,r))).join('')+'</div>'}
  if(sec==='Albums'&&!secQ&&!query){if(!chartAlb.length&&!chartDone.albums)loadChartPage('albums');n=chartAlb.length;b='<div class="grid al-g">'+spreadCovers(chartAlb).map((r,i)=>albumCard(r,i)).join('')+'</div>'+sentinel}
  if(sec==='Artists'&&!secQ&&!query){if(!chartArt.length&&!chartDone.artists)loadChartPage('artists');n=chartArt.length;b='<div class="grid">'+chartArt.map((a,i)=>artistCard(a,i)).join('')+'</div>'+sentinel}
  if(sec==='Albums'&&secQ.length>=2){b='<div class="grid al-g">'+secMBR.map(r=>(n++,`<div class="al" data-album="${esc(r.id)}"><div class="wrap"><div class="disc2" style="--lc:${palFor(r.id)[0]}"></div><img class="sleeve" src="${esc(r.cover)}" alt="" loading="lazy" onerror="this.style.display='none'" style="width:100%;height:100%;border-radius:10px;object-fit:cover"></div><b>${esc(r.title)}</b><small>${esc(r.artist)}${r.year?' · '+esc(r.year):''}</small></div>`)).join('')+'</div>'}
  if(sec==='Artists'&&secQ.length>=2){b='<div class="grid">'+secMBA.map(a=>(n++,`<div class="ar" data-artist="${esc(a.id)}">${artAv(a)}<b>${esc(a.name)}</b><small>${artInfo(a)}</small></div>`)).join('')+'</div>'}
  if(['Songs','Recent','Favourites'].includes(sec)){const tracks=filteredTracks();b='<div>'+tracks.map(({t,i},r)=>(n++,`<div class="row2 saved" data-i="${i}"><span class="n">${i===cur&&playing?'♪':''}</span><div class="cv" style="background:${artBg(t)}"></div><div class="rt"><b>${stripArtist(t.t,t.a)}</b><small>${t.a}</small><small class="rm">${t.g}</small></div><small class="rdur">${fmt(t.dur||D)}</small><button data-fav="${i}" aria-label="Toggle favourite">${favourites.has(i)?'♥':'♡'}</button><button class="addpl rowadd" data-addpl="${i}" aria-label="Add to playlist">+</button></div>`)).join('')+'</div>'}
  if(sec==='Your playlists'&&likedView){$('content').innerHTML=likedPageHTML();bindLikedPage();return}
  if(sec==='Discover people'){$('content').innerHTML=peoplePageHTML();bindPeoplePage();return}
  if(sec==='Genres'){b='<div class="grid genre-g">'+GEN.filter(g=>ok(g[0])).map(([g])=>{const info=GENRE_INFO[g]||{};n++;return `<button class="gcard" data-g="${esc(g)}" style="background-image:${info.image?"url('"+esc(info.image)+"')":'none'};background-color:${palFor(g)[0]}"><span>${esc(g)}</span><i></i></button>`}).join('')+'</div>'}
  if(sec==='Your playlists'){b='<div class="pl-grid">'+plStore.filter(p=>ok(p.name)).map(p=>(n++,plCard(p))).join('')+'<button class="pl-card pl-new" data-newpl="1"><span class="pl-plus">+</span><b>New playlist</b><small>Start a collection</small></button></div>'}
  if(sec==='Top songs'&&!secQ&&!query&&n&&!chartDone.tracks)b+=sentinel;
  const tb=toolsBar();const loadingNow=!secQ&&!query&&((sec==='Top songs'&&!chartDone.tracks)||(sec==='Albums'&&!chartDone.albums)||(sec==='Artists'&&!chartDone.artists));if(!n&&loadingNow)b='<div class="loading-grid">'+'<i></i>'.repeat(10)+'</div>';$('content').innerHTML=h+tb+((n||loadingNow)?b:`<p class="sub">${secQ?'Nothing matches this filter.':'Nothing here yet. Play a few tracks or save a favourite to fill this space.'}</p>`);bindExploreTools()}
const WIKI=new Map();
function artInfo(a){const parts=[];if(a.country){let name=a.country;try{name=new Intl.DisplayNames(['en'],{type:'region'}).of(a.country)||a.country}catch(e){}parts.push(name)}const s=subsText(a);if(s)parts.push(s);return parts.join(' · ')}

function subsText(a){if(a.subs==null)return '';const n=Number(a.subs)||0;const v=n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?Math.round(n/1e3)+'K':String(n);return v+' YouTube subscribers'}

function fansText(n){n=Number(n)||0;return n>=1e6?(n/1e6).toFixed(1)+'M fans':n>=1e3?Math.round(n/1e3)+'K fans':n+' fans'}

function artAv(a){return `<div class="av2" style="background:${grad(palFor(a.id))}"><img src="${esc(imgSrc(a.photo||''))}" alt="" style="position:absolute;inset:0;width:100%;height:100%;border-radius:50%;object-fit:cover;display:${a.photo?'block':'none'}"></div>`}
function loadWikiImages(){document.querySelectorAll('img[data-wiki]').forEach(im=>{const name=im.dataset.wiki;const show=u=>{if(u){im.src=u;im.style.display='block'}};if(WIKI.has(name)){show(WIKI.get(name));return}WIKI.set(name,'');fetch('https://en.wikipedia.org/api/rest_v1/page/summary/'+encodeURIComponent(name.replace(/ /g,'_'))).then(r=>r.ok?r.json():{}).then(d=>{const u=(d.originalimage&&d.originalimage.source)||(d.thumbnail&&d.thumbnail.source)||'';WIKI.set(name,u);document.querySelectorAll('img[data-wiki]').forEach(x=>{if(x.dataset.wiki===name)show(u)})}).catch(()=>{})})}

function bindExploreTools(){loadWikiImages();observeMore();const s=$('localSearch'),g=$('genreFilter'),o=$('sortFilter');if(s)s.oninput=e=>{const caret=e.target.selectionStart;secRaw=e.target.value;secQ=secRaw.trim().toLowerCase();render();secSearch();const next=$('localSearch');next.focus();next.setSelectionRange(caret,caret)};if(g)g.onchange=e=>{setGenre(+e.target.value);render()};if(o)o.onchange=e=>{sortBy=e.target.value;render()}}
$('menu').onclick=e=>{const b=e.target.closest('[data-s]');if(b){sec=b.dataset.s;albumView=null;revealFrom=Infinity;gf='';secQ='';secRaw='';secMBA=[];secMBR=[];if(query){query='';rawQ='';$('q').value='';remoteSearch('')}render()}};
$('content').onclick=e=>{const plc=e.target.closest('[data-pl]');if(plc){openPlaylist(plc.dataset.pl);return}if(e.target.closest('[data-newpl]')){newPlaylist();return}const plx=e.target.closest('[data-plremove]');if(plx&&albumView&&albumView.playlist){removeFromPlaylist(albumView.playlist,+plx.dataset.plremove);return}const pup=e.target.closest('[data-plup]'),pdn=e.target.closest('[data-pldown]');if((pup||pdn)&&albumView&&albumView.playlist){const k=+(pup||pdn).dataset[pup?'plup':'pldown'];movePl(albumView.playlist,k,k+(pup?-1:1));return}const prc=e.target.closest('[data-plrmcover]');if(prc){const pp=plById(prc.dataset.plrmcover);if(pp){delete pp.cover;savePl();openPlaylist(pp.id)}return}const plr=e.target.closest('[data-plrename]');if(plr){renamePlaylist(plr.dataset.plrename);return}const pld=e.target.closest('[data-pldelete]');if(pld){deletePlaylist(pld.dataset.pldelete);return}const plAdd=e.target.closest('[data-addpl]');if(plAdd){openAddTo(+plAdd.dataset.addpl,plAdd);return}const rt=e.target.closest('[data-rt]');if(rt){resTab=rt.dataset.rt;render();return}if(e.target.closest('[data-back]')){albumView=null;render();return}const alb=e.target.closest('[data-album]');if(alb){openAlbum(alb.dataset.album,alb.dataset.atitle,alb.dataset.aartist);return}const art=e.target.closest('[data-artist]');if(art){openArtist(art.dataset.artist);return}if(e.target.closest('[data-play]')&&albumView&&albumView.loaded){playAlbum(0);return}const trk=e.target.closest('[data-trk]');if(trk&&albumView&&albumView.loaded){playAlbum(+trk.dataset.trk);return}const aq=e.target.closest('[data-q]');if(aq){playQuery(aq.dataset.q);return}const el=e.target.closest('[data-i]'),g=e.target.closest('[data-g]'),m=e.target.closest('[data-m]');
  const f=e.target.closest('[data-fav]'),r=e.target.closest('[data-radio]');if(f){e.stopPropagation();const i=+f.dataset.fav;const on=!favourites.has(i);on?favourites.add(i):favourites.delete(i);setFavItem(T[i],on);f.textContent=on?'♥':'♡';f.classList.toggle('on',on);f.setAttribute('aria-label',(on?'Remove from':'Add to')+' favourites');pulse(f);toast(on?'Added to favourites':'Removed from favourites');if(sec==='Favourites')render();return}
  if(r){playRadio(r.dataset.radio);return}
  if(el)playSong(+el.dataset.i);else if(g){openGenre(g.dataset.g)}else if(m)playSong(Math.floor(Math.random()*T.length))};
// Card tilt: each card eases toward the cursor and eases back flat when the cursor leaves, frame by frame.
const tilted=new Map();let tiltRaf=0;
function tiltFrame(){tiltRaf=0;let moving=false;
  for(const[el,s]of tilted){if(!el.isConnected){tilted.delete(el);continue}
    s.x+=(s.tx-s.x)*.28;s.y+=(s.ty-s.y)*.28;
    if(s.tx===0&&s.ty===0&&Math.abs(s.x)<.0005&&Math.abs(s.y)<.0005){el.style.transform='';tilted.delete(el);continue}
    el.style.transform=`perspective(700px) rotateY(${s.x*18}deg) rotateX(${-s.y*18}deg) translateZ(10px)`;moving=true}
  if(moving&&!tiltRaf)tiltRaf=setTimeout(tiltFrame,16)}
function tiltAim(el,x,y){let s=tilted.get(el);if(!s){s={x:0,y:0,tx:0,ty:0};tilted.set(el,s)}s.tx=x;s.ty=y;if(!tiltRaf)tiltRaf=setTimeout(tiltFrame,16)}
$('content').addEventListener('mousemove',e=>{const el=e.target.closest('.tilt');if(!el)return;const r=el.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;el.style.setProperty('--mx',x*100+'%');el.style.setProperty('--my',y*100+'%');tiltAim(el,x-.5,y-.5)});
$('content').addEventListener('mouseout',e=>{const el=e.target.closest('.tilt');if(el&&!el.contains(e.relatedTarget))tiltAim(el,0,0)});
$('q').oninput=e=>{query=e.target.value.trim().toLowerCase();remoteSearch(query);if(view!=='explore')location.hash='explore';else render()};

/* ---------- routing ---------- */
function route(){const h=location.hash.slice(1),v=h==='explore'||h==='player'?h:'home';view=v;document.body.className='v-'+v;$('cta').classList.remove('show');$('mini').classList.toggle('show',v!=='player');
  document.querySelectorAll('.links a').forEach(a=>a.classList.toggle('on',a.dataset.v===v));if(v==='explore')render();if(v==='player'){renderQueue();pResize()}else setLyr(false);if(v!=='home')scrollTo(0,0)}
addEventListener('hashchange',route);

/* ---------- three.js helpers ---------- */
const mk=c=>{const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;t.anisotropy=4;return t};
const cnv=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return[c,c.getContext('2d')]};
const rr=(g,x,y,w,h,r)=>{g.beginPath();g.roundRect?g.roundRect(x,y,w,h,r):g.rect(x,y,w,h)};
const mkR=cv=>{const r=new THREE.WebGLRenderer({canvas:cv,antialias:true,alpha:true});r.setPixelRatio(Math.min(devicePixelRatio,2));r.outputEncoding=THREE.sRGBEncoding;r.toneMapping=THREE.ACESFilmicToneMapping;r.toneMappingExposure=.85;return r};
const M=(g,m,x=0,y=0,z=0)=>{const o=new THREE.Mesh(g,m);o.position.set(x,y,z);return o};
const dark=new THREE.MeshStandardMaterial({color:0x0a0a0e,roughness:.5}),metal=new THREE.MeshStandardMaterial({color:0xcfd2de,metalness:1,roughness:.35});
const grooveTex=(()=>{const[c,g]=cnv(1024,1024),base=g.createRadialGradient(512,512,140,512,512,512);base.addColorStop(0,'#3a1d57');base.addColorStop(.5,'#22103a');base.addColorStop(1,'#120820');g.fillStyle=base;g.fillRect(0,0,1024,1024);
  for(let r=145;r<506;r+=2.35){g.beginPath();g.arc(512,512,r,0,Math.PI*2);g.strokeStyle=`rgba(${r%4<2?'255,150,230':'0,0,0'},${.035+((r*7)%5)*.014})`;g.lineWidth=r%3<1?.8:1.2;g.stroke()}
  for(let i=0;i<4000;i++){const a=Math.random()*Math.PI*2,r=145+Math.random()*360,x=512+Math.cos(a)*r,y=512+Math.sin(a)*r;g.fillStyle=i%2?'rgba(255,170,240,.05)':'rgba(0,0,0,.4)';g.fillRect(x,y,1.2,1.2)}
  g.save();g.translate(512,512);g.rotate(-.48);const shine=g.createLinearGradient(-55,0,55,0);shine.addColorStop(0,'rgba(255,255,255,0)');shine.addColorStop(.45,'rgba(255,190,245,.22)');shine.addColorStop(.58,'rgba(255,255,255,.06)');shine.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=shine;g.fillRect(-55,-550,110,1100);g.restore();return new THREE.CanvasTexture(c)})();
const cover=(t,blank=false)=>{const[c,g]=cnv(512,512);if(blank){const x=g.createRadialGradient(230,210,12,256,256,360);x.addColorStop(0,'#ad5266');x.addColorStop(1,'#7d344d');g.fillStyle=x;g.fillRect(0,0,512,512);g.strokeStyle='rgba(255,230,232,.18)';g.lineWidth=5;g.beginPath();g.arc(256,256,220,0,Math.PI*2);g.stroke()}else{const gr=g.createLinearGradient(0,0,512,512),pc=(t&&t.c)||["#9B3DF0","#00F0FF"];gr.addColorStop(0,pc[0]);gr.addColorStop(1,pc[1]);g.fillStyle=gr;g.fillRect(0,0,512,512);g.fillStyle='rgba(255,255,255,.85)';g.font='bold 260px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(t.t[0],256,270)}return mk(c)};
function makeRecord(R,hole,t,real=false){const g=new THREE.Group(),side=THREE.DoubleSide,discMat=new THREE.MeshPhysicalMaterial({map:grooveTex,color:0xffffff,roughness:.3,metalness:0,clearcoat:1,clearcoatRoughness:.06,side}),labelMat=new THREE.MeshPhysicalMaterial({map:cover(t,real),roughness:.52,metalness:.04,clearcoat:.25,side}),edgeMat=new THREE.MeshPhysicalMaterial({color:0x2a1446,roughness:.35,metalness:.1,clearcoat:.6});
  g.add(M(new THREE.RingGeometry(R*.38,R,160),discMat),M(new THREE.RingGeometry(hole,R*.38,96),labelMat));
  const w=M(new THREE.CylinderGeometry(R,R,.065,160,1,true),edgeMat),n=M(new THREE.CylinderGeometry(hole,hole,.065,32,1,true),edgeMat);w.rotation.x=n.rotation.x=Math.PI/2;g.add(w,n);return g}

/* ---------- home: dive through a record ---------- */
const hcv=$('gl'),hr=mkR(hcv),hs=new THREE.Scene(),hc=new THREE.PerspectiveCamera(50,1,.1,200);hs.fog=new THREE.Fog(0x0a0712,10,70);
hs.add(new THREE.HemisphereLight(0x9a8cff,0x1a1030,.6));
const key=new THREE.DirectionalLight(0xfff1e6,.8);key.position.set(4,5,6);hs.add(key);
const rl=new THREE.PointLight(0x9b3df0,1,30);rl.position.set(-5,3,-2);hs.add(rl);const cl=new THREE.PointLight(0x22d3ee,.7,30);cl.position.set(6,-2,2);hs.add(cl);
const heroRec=makeRecord(2.6,.62,T[0],true),hero=new THREE.Group();hero.add(heroRec);hero.scale.setScalar(1.15);hs.add(hero);
const rings=[];for(let i=0;i<5;i++){const r=M(new THREE.TorusGeometry(3.6+(i*7%5)*.45,.05,8,120),new THREE.MeshBasicMaterial({color:[0x7c4ddb,0x1fa3b8,0xc2528f][i%3],transparent:true,opacity:0}),0,0,-8-i*3.1);r.visible=false;hs.add(r);rings.push(r)}
const filaments=[];for(let j=0;j<1;j++){const pts=[];for(let k=0;k<=260;k++){const z=12-k*.35,a=k*.105+j*Math.PI*2/3,r=3.9+.38*Math.sin(k*.035+j);pts.push(new THREE.Vector3(Math.cos(a)*r,Math.sin(a)*r*.68,z))}const curve=new THREE.CatmullRomCurve3(pts),mat=new THREE.MeshBasicMaterial({color:[0xb889ff,0x9a80e8,0xe77bb5][j],transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}),mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,600,.014,5,false),mat);mesh.visible=false;hs.add(mesh);filaments.push(mesh)}
function fitText(g,txt,max,px,weight){let sz=px;g.font=weight+' '+sz+'px system-ui,sans-serif';while(sz>26&&g.measureText(txt).width>max){sz-=2;g.font=weight+' '+sz+'px system-ui,sans-serif'}let out=String(txt);while(out.length>1&&g.measureText(out).width>max){out=out.slice(0,-1)}return out===String(txt)?out:out.replace(/\s+$/,'')+'…'}
function cardTex(t){const[c,g]=cnv(1024,1440);g.scale(2,2);g.imageSmoothingQuality='high';
const body=g.createLinearGradient(0,0,512,720);body.addColorStop(0,'rgba(128,96,210,.46)');body.addColorStop(.55,'rgba(42,26,96,.52)');body.addColorStop(1,'rgba(20,12,52,.66)');g.fillStyle=body;rr(g,0,0,512,720,44);g.fill();
const sh=g.createLinearGradient(0,0,0,300);sh.addColorStop(0,'rgba(255,255,255,.24)');sh.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=sh;rr(g,0,0,512,300,44);g.fill();
g.lineWidth=3;const ed=g.createLinearGradient(0,0,512,720);ed.addColorStop(0,'rgba(255,255,255,.9)');ed.addColorStop(.5,'rgba(255,255,255,.16)');ed.addColorStop(1,'rgba(255,255,255,.5)');g.strokeStyle=ed;rr(g,1.5,1.5,509,717,43);g.stroke();
g.save();rr(g,36,36,440,440,30);g.clip();
if(t._imgEl){const cc=t._crop||(()=>{const iw=t._imgEl.naturalWidth||1280,ih=t._imgEl.naturalHeight||720,sq=Math.min(iw,ih)*.8;return{sx:(iw-sq)/2,sy:(ih-sq)/2,sq}})();g.drawImage(t._imgEl,cc.sx,cc.sy,cc.sq,cc.sq,36,36,440,440)}
else{const gr=g.createLinearGradient(36,36,476,476);gr.addColorStop(0,t.c[0]);gr.addColorStop(1,t.c[1]);g.fillStyle=gr;g.fillRect(36,36,440,440);g.fillStyle='rgba(255,255,255,.9)';g.font='900 250px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(t.t[0],256,262)}
g.restore();
g.lineWidth=2;g.strokeStyle='rgba(255,255,255,.35)';rr(g,36,36,440,440,30);g.stroke();
g.fillStyle='rgba(12,8,28,.72)';g.beginPath();g.arc(420,96,34,0,Math.PI*2);g.fill();g.fillStyle='#fff';g.font='400 34px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('♡',420,98);
g.textAlign='left';g.textBaseline='alphabetic';g.fillStyle='#fff';g.fillText(fitText(g,t.t,370,44,'700'),40,548);
g.fillStyle='rgba(235,225,255,.7)';g.fillText(fitText(g,t.a,370,30,'400'),40,596);
g.fillStyle='rgba(12,8,28,.8)';g.beginPath();g.arc(440,650,34,0,Math.PI*2);g.fill();g.strokeStyle='#fff';g.lineWidth=4;g.lineCap='round';g.beginPath();g.moveTo(427,650);g.lineTo(453,650);g.moveTo(440,637);g.lineTo(440,663);g.stroke();
return mk(c)}
const cardsG=new THREE.Group();cardsG.position.set(0,-1.5,-66);cardsG.scale.setScalar(1);hs.add(cardsG);
const cards=T.map((t,i)=>{const grp=new THREE.Group(),front=M(new THREE.PlaneGeometry(2.4,3.37),new THREE.MeshBasicMaterial({map:cardTex(t),transparent:true}));front.userData.i=i;
  grp.add(front);grp.position.set((i-2.5)*2.45,0,0);const base=.78;grp.scale.setScalar(base);grp.rotation.y=0;cardsG.add(grp);return{grp,front,y:grp.position.y,z:grp.position.z,rot:grp.rotation.y,base}});

/* ---------- now playing: turntable + 3D lyrics ---------- */
const pcv=$('pc'),qr=mkR(pcv),qs=new THREE.Scene(),qc=new THREE.PerspectiveCamera(42,1,.1,100);qc.position.set(5.4,7.2,10);
const ctl=new THREE.OrbitControls(qc,pcv);ctl.enableDamping=true;ctl.minDistance=4;ctl.maxDistance=14;ctl.maxPolarAngle=Math.PI*.49;
qs.add(new THREE.HemisphereLight(0xb6a8ff,0x1a1030,.7));const kl=new THREE.DirectionalLight(0xffffff,.6);kl.position.set(4,8,5);qs.add(kl);
const pl1=new THREE.PointLight(0x9b3df0,0,22);pl1.position.set(-4,3,2);qs.add(pl1);const pl2=new THREE.PointLight(0x00f0ff,0,22);pl2.position.set(4,2,-3);qs.add(pl2);
const tt=new THREE.Group();qs.add(tt);
qr.shadowMap.enabled=true;qr.shadowMap.type=THREE.PCFSoftShadowMap;
// The record and the tonearm are pivots: the record turns about its spindle, the tonearm about its base.
const rec=new THREE.Group();tt.add(rec);
const labelMat=new THREE.MeshPhysicalMaterial({color:0xffffff,roughness:.22,metalness:0,clearcoat:1,clearcoatRoughness:.06,envMapIntensity:1.2});
// The song's own picture is drawn on the record, so each track shows its cover as it turns.
window.setLabel=()=>{const t=T[cur];if(!t)return;const apply=tex=>{if(labelMat.map)labelMat.map.dispose();labelMat.map=tex;labelMat.color.set(0xffffff);labelMat.needsUpdate=true};if(t&&t.img){const im=new Image();im.crossOrigin='anonymous';im.onload=()=>{const c=document.createElement('canvas');c.width=c.height=2048;const g=c.getContext('2d');
g.fillStyle='#5b1d6e';g.fillRect(0,0,2048,2048);const ir=g.createLinearGradient(0,0,2048,2048);ir.addColorStop(0,'rgba(255,120,200,.25)');ir.addColorStop(.5,'rgba(120,200,255,.12)');ir.addColorStop(1,'rgba(255,190,90,.22)');g.fillStyle=ir;g.fillRect(0,0,2048,2048);for(let i=0;i<90;i++){const x=Math.random()*2048,y=Math.random()*2048,rr=80+Math.random()*260;const mg=g.createRadialGradient(x,y,0,x,y,rr);mg.addColorStop(0,Math.random()<.5?'rgba(255,120,180,.10)':'rgba(60,0,40,.10)');mg.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=mg;g.fillRect(0,0,2048,2048)}const sg=g.createRadialGradient(1024,1024,300,1024,1024,1024);sg.addColorStop(0,'rgba(255,170,210,.14)');sg.addColorStop(.6,'rgba(255,255,255,0)');sg.addColorStop(1,'rgba(90,20,60,.2)');g.fillStyle=sg;g.fillRect(0,0,2048,2048);
for(let r=200;r<1024;r+=2.5){g.strokeStyle=r%30<3?'rgba(60,0,30,.3)':'rgba(255,190,220,.14)';g.lineWidth=2;g.beginPath();g.arc(1024,1024,r,0,Math.PI*2);g.stroke()}
g.strokeStyle='rgba(0,0,0,.45)';g.lineWidth=14;g.beginPath();g.arc(1024,1024,1014,0,Math.PI*2);g.stroke();
g.save();g.beginPath();g.arc(1024,1024,430,0,Math.PI*2);g.clip();g.filter='contrast(1.3) saturate(1.15) brightness(1.04)';
g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';const k=Math.max(860/im.naturalWidth,860/im.naturalHeight);const w=im.naturalWidth*k,h=im.naturalHeight*k;g.drawImage(im,1024-w/2,1024-h/2,w,h);g.restore();
g.strokeStyle='rgba(245,235,210,.9)';g.lineWidth=18;g.beginPath();g.arc(1024,1024,430,0,Math.PI*2);g.stroke();g.strokeStyle='#bfc4cc';g.lineWidth=10;g.beginPath();g.arc(1024,1024,46,0,Math.PI*2);g.stroke();g.fillStyle='#050505';g.beginPath();g.arc(1024,1024,38,0,Math.PI*2);g.fill();
const tx=new THREE.CanvasTexture(c);tx.encoding=THREE.sRGBEncoding;tx.anisotropy=16;tx.center.set(.5,.5);tx.rotation=Math.PI/2;apply(tx)};im.onerror=()=>apply(cover(t));im.src=t.img}else apply(cover(t))};
const arm=new THREE.Group();tt.add(arm);
const sun=new THREE.DirectionalLight(0xfff4ea,1.05);sun.position.set(5,9,6);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.radius=6;sun.shadow.camera.left=-7;sun.shadow.camera.right=7;sun.shadow.camera.top=7;sun.shadow.camera.bottom=-7;sun.shadow.bias=-.0006;qs.add(sun);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(40,40),new THREE.ShadowMaterial({opacity:.35}));floor.rotation.x=-Math.PI/2;floor.position.y=-1.3;floor.receiveShadow=true;qs.add(floor);
new THREE.GLTFLoader().load("models/vinyl_player.glb",g=>{
  const K=3.4;const box=new THREE.Box3().setFromObject(g.scene);const c=box.getCenter(new THREE.Vector3());
  g.scene.scale.setScalar(K);g.scene.position.set(-c.x*K,-c.y*K,-c.z*K);
  g.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});
  tt.add(g.scene);g.scene.updateMatrixWorld(true);
  // Luxury finish: dark purple lacquer, real gold metal, pink accents, and purple and gold reflections.
  const pmrem=new THREE.PMREMGenerator(qr);const envScene=new THREE.Scene();envScene.background=new THREE.Color(0x030008);
  const panel=(c,w,h,p)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:c,side:THREE.DoubleSide}));m.position.set(p[0],p[1],p[2]);m.lookAt(0,0,0);envScene.add(m)};
  panel(0x1a1a24,30,12,[0,16,0]);panel(0xfff1dc,16,10,[14,9,10]);panel(0x6a5a8a,12,6,[-12,6,-6]);panel(0x3a2a1a,22,3,[0,3,-16]);panel(0xfff6e8,8,4,[-14,5,8]);
  qs.environment=pmrem.fromScene(envScene,.03).texture;
  const bc=document.createElement('canvas');bc.width=8;bc.height=512;const bx=bc.getContext('2d');for(let y=0;y<512;y++){const v=200+Math.random()*55|0;bx.fillStyle=`rgb(${v},${v},${v})`;bx.fillRect(0,y,8,1)}const brushT=new THREE.CanvasTexture(bc);brushT.wrapS=brushT.wrapT=THREE.RepeatWrapping;brushT.repeat.set(6,6);
  const goldM=new THREE.MeshPhysicalMaterial({color:0xe2b45c,metalness:1,roughness:.12,roughnessMap:brushT,clearcoat:.9,clearcoatRoughness:.04,envMapIntensity:1.9});
  const grainC=document.createElement('canvas');grainC.width=grainC.height=512;const gx=grainC.getContext('2d');gx.fillStyle='#808080';gx.fillRect(0,0,512,512);for(let i=0;i<7000;i++){const v=80+Math.random()*120|0;gx.fillStyle=`rgb(${v},${v},${v})`;gx.fillRect(Math.random()*512,Math.random()*512,2+Math.random()*3,1+Math.random()*2)}const grainT=new THREE.CanvasTexture(grainC);grainT.wrapS=grainT.wrapT=THREE.RepeatWrapping;grainT.repeat.set(2,2);
  const lacquerM=new THREE.MeshPhysicalMaterial({color:0x1a0030,metalness:.6,roughness:.18,roughnessMap:grainT,bumpMap:grainT,bumpScale:.09,clearcoat:1,clearcoatRoughness:.03,envMapIntensity:.9});
  const blackGoldM=new THREE.MeshPhysicalMaterial({color:0x140818,metalness:.4,roughness:.35,clearcoat:.6});
  const pinkM=new THREE.MeshStandardMaterial({color:0xff2e8a,emissive:0xff2e8a,emissiveIntensity:2,roughness:.25});
  const glassM=new THREE.MeshPhysicalMaterial({color:0xe6d8ff,transparent:true,opacity:.25,roughness:.04,clearcoat:1,envMapIntensity:1.4});
  const byName={pCube17_vinil_0:lacquerM,pCylinder16_ditals_0:goldM,pCylinder21_ditals_0:goldM,pCylinder25_ditals_0:goldM,pCylinder20_ditals_0:goldM,pCylinder3_dit3_0:goldM,pCube6_dit2_0:goldM,pCylinder8_dit2_0:goldM,pCylinder15_dit2_0:goldM,pCylinder22_lambert1_0:goldM,pCylinder23_dit2_0:blackGoldM,pCylinder30_naconez_0:pinkM,pCube10_ditals_0:blackGoldM,pCube11_ditals_0:blackGoldM,pCube12_ditals_0:blackGoldM,pCube13_noska_0:blackGoldM,pCylinder13_ditals_0:goldM,pCube20_ditals_0:goldM,pCylinder31_noska_0:blackGoldM,pCylinder32_noska_0:blackGoldM,pCylinder33_noska_0:blackGoldM,pCylinder34_noska_0:blackGoldM,pCylinder2_dit2_0:new THREE.MeshPhysicalMaterial({color:0x0b0a0e,roughness:.18,clearcoat:1,clearcoatRoughness:.04})};
  g.scene.traverse(o=>{if(o.isMesh&&byName[o.name]){o.material=byName[o.name]}});
  const chromeM=new THREE.MeshStandardMaterial({color:0xf2f4f8,metalness:1,roughness:.12,envMapIntensity:2});const feetM=new THREE.MeshPhysicalMaterial({color:0xffc857,metalness:1,roughness:.1,clearcoat:1,envMapIntensity:2});
  g.scene.traverse(o=>{if(!o.isMesh)return;const gldM=new THREE.MeshPhysicalMaterial({color:0xffc857,metalness:1,roughness:.1,clearcoat:1,envMapIntensity:2});
  g.scene.traverse(o=>{if(!o.isMesh)return;if(["pCylinder25_ditals_0","pCylinder20_ditals_0","pCylinder21_ditals_0","pCylinder22_lambert1_0","pCylinder13_ditals_0","pCube20_ditals_0","pCylinder23_dit2_0","pCylinder30_naconez_0","pCube6_dit2_0","pCube10_ditals_0","pCube11_ditals_0","pCube12_ditals_0","pCube13_noska_0"].includes(o.name))o.material=gldM;});g.scene.traverse(o=>{if(o.isMesh&&["pCube6_dit2_0","pCube10_ditals_0","pCube11_ditals_0","pCube12_ditals_0","pCube13_noska_0"].includes(o.name))o.material=gldM;});
  const frameGoldM=new THREE.MeshStandardMaterial({color:0xffe08a,emissive:0xffc040,emissiveIntensity:1.4,metalness:1,roughness:.15});g.scene.traverse(o=>{if(o.isMesh&&["pCube11_ditals_0","pCube12_ditals_0","pCube13_noska_0","pCube10_ditals_0"].includes(o.name))o.material=frameGoldM;});
  if(["pCylinder25_ditals_0","pCylinder20_ditals_0","pCylinder21_ditals_0","pCylinder22_lambert1_0","pCylinder13_ditals_0","pCube20_ditals_0"].includes(o.name))o.material=chromeM;if(["pCylinder31_noska_0","pCylinder32_noska_0","pCylinder33_noska_0","pCylinder34_noska_0"].includes(o.name))o.material=feetM;});
  // Warm and pink light for a premium look.
  const fillLight=new THREE.DirectionalLight(0xfff1e0,.45);fillLight.position.set(-6,5,4);qs.add(fillLight);
  const rimLight=new THREE.DirectionalLight(0x9fb4ff,.7);rimLight.position.set(-3,6,-8);qs.add(rimLight);
  // Lid: a glass-like pane in a black frame, with silver hinges on the left edge, open.
  const db=new THREE.Box3().setFromObject(g.scene.getObjectByName('pCube17_vinil_0'));const dw=(db.max.x-db.min.x)*.96,dd=(db.max.z-db.min.z)*.96;
  const lidG=new THREE.Group();lidG.position.set(db.min.x+(db.max.x-db.min.x)*.02,db.max.y,(db.max.z+db.min.z)/2);lidG.rotation.z=1.9;tt.add(lidG);window.__lidG=lidG;
  const lidPanel=new THREE.Group();lidPanel.position.set(dw/2,1.26,0);lidG.add(lidPanel);
  const glass=new THREE.MeshPhysicalMaterial({color:0x8a9099,transmission:.6,thickness:.2,roughness:.05,ior:1.49,clearcoat:1,clearcoatRoughness:.02,transparent:true,opacity:.42,envMapIntensity:1.2,specularIntensity:1,depthWrite:false});
  const glassSide=glass.clone();glassSide.side=THREE.FrontSide;const pR=.12,pS=new THREE.Shape();const px0=-dw/2,px1=dw/2,py0=-dd/2,py1=dd/2;pS.moveTo(px0+pR,py0);pS.lineTo(px1-pR,py0);pS.quadraticCurveTo(px1,py0,px1,py0+pR);pS.lineTo(px1,py1-pR);pS.quadraticCurveTo(px1,py1,px1-pR,py1);pS.lineTo(px0+pR,py1);pS.quadraticCurveTo(px0,py1,px0,py1-pR);pS.lineTo(px0,py0+pR);pS.quadraticCurveTo(px0,py0,px0+pR,py0);const pG=new THREE.ExtrudeGeometry(pS,{depth:.18,bevelEnabled:true,bevelThickness:.04,bevelSize:.04,bevelSegments:4,curveSegments:10});pG.translate(0,0,-.09);pG.rotateX(-Math.PI/2);const pane=new THREE.Mesh(pG,glass);pane.castShadow=true;lidPanel.add(pane);
  // VINYLLA name in the middle of the lid glass.
  const lcv=document.createElement('canvas');lcv.width=1024;lcv.height=256;const lgx=lcv.getContext('2d');lgx.clearRect(0,0,1024,256);lgx.font='600 150px sans-serif';lgx.textAlign='center';lgx.textBaseline='middle';lgx.fillStyle='rgba(255,240,250,.92)';lgx.fillText('VINYLLA',512,128);const lidTex=new THREE.CanvasTexture(lcv);lidTex.encoding=THREE.sRGBEncoding;const lidName=new THREE.Mesh(new THREE.PlaneGeometry(dw*.85,dw*.85*.25),new THREE.MeshBasicMaterial({map:lidTex,transparent:true,depthWrite:false,side:THREE.DoubleSide}));lidName.rotation.set(-Math.PI/2,0,-Math.PI/2); lidName.scale.x=-1;lidName.position.set(0,.06,0);lidPanel.add(lidName);
  const frameM=new THREE.MeshStandardMaterial({color:0x0c0b10,roughness:.35,metalness:.3});
  const fT=.14;
  const edgeM=new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xd8c8ff,emissiveIntensity:.8,roughness:.1,metalness:.2});[dw/2,-dw/2].forEach(x=>{const e=new THREE.Mesh(new THREE.BoxGeometry(.05,.05,dd),edgeM);e.position.set(x,.09,0);lidPanel.add(e)});
    // Side walls: thick acrylic with rounded edges, spanning the full lid width; the hinge edge stays flat and open.
  const sH=1.35,sT=.08,sW=dw,cr3=.06;const sp=new THREE.Shape();sp.moveTo(-sW/2+cr3,-sH/2);sp.lineTo(sW/2-cr3,-sH/2);sp.quadraticCurveTo(sW/2,-sH/2,sW/2,-sH/2+cr3);sp.lineTo(sW/2,sH/2-cr3);sp.quadraticCurveTo(sW/2,sH/2,sW/2-cr3,sH/2);sp.lineTo(-sW/2+cr3,sH/2);sp.quadraticCurveTo(-sW/2,sH/2,-sW/2,sH/2-cr3);sp.lineTo(-sW/2,-sH/2+cr3);sp.quadraticCurveTo(-sW/2,-sH/2,-sW/2+cr3,-sH/2);
  const swG=new THREE.ExtrudeGeometry(sp,{depth:sT,bevelEnabled:true,bevelThickness:.02,bevelSize:.02,bevelSegments:3,curveSegments:10});swG.translate(0,0,-sT/2);
  [dd/2,-dd/2].forEach(z=>{const sideWall=new THREE.Mesh(swG,glassSide);sideWall.position.set(0,.09-sH/2,z);sideWall.castShadow=true;lidPanel.add(sideWall)});
  const fwG=new THREE.ExtrudeGeometry((()=>{const f=new THREE.Shape();f.moveTo(-dd/2+cr3,-sH/2);f.lineTo(dd/2-cr3,-sH/2);f.quadraticCurveTo(dd/2,-sH/2,dd/2,-sH/2+cr3);f.lineTo(dd/2,sH/2-cr3);f.quadraticCurveTo(dd/2,sH/2,dd/2-cr3,sH/2);f.lineTo(-dd/2+cr3,sH/2);f.quadraticCurveTo(-dd/2,sH/2,-dd/2,sH/2-cr3);f.lineTo(-dd/2,-sH/2+cr3);f.quadraticCurveTo(-dd/2,-sH/2,-dd/2+cr3,-sH/2);return f})(),{depth:sT,bevelEnabled:true,bevelThickness:.03,bevelSize:.03,bevelSegments:3,curveSegments:10});fwG.translate(0,0,-sT/2);fwG.rotateY(Math.PI/2);const frontWall2=new THREE.Mesh(fwG,glassSide);frontWall2.position.set(dw/2,.09-sH/2,0);const backWall2=new THREE.Mesh(fwG,glassSide);backWall2.position.set(-dw/2,.09-sH/2,0);backWall2.castShadow=true;lidPanel.add(backWall2);frontWall2.castShadow=true;lidPanel.add(frontWall2);
  const hingeM=new THREE.MeshStandardMaterial({color:0xdde1e8,metalness:1,roughness:.2});
  const plateM=new THREE.MeshStandardMaterial({color:0x000000,roughness:.9});[dd/3,-dd/3].forEach(z=>{const pl=new THREE.Mesh(new THREE.BoxGeometry(.5,.04,.4),plateM);pl.position.set(0,-.02,z);lidG.add(pl);const h=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,.5,24),hingeM);h.rotation.x=Math.PI/2;h.position.set(0,0,z);h.castShadow=true;lidG.add(h)});
  
  const N=n=>tt.getObjectByName(n);
  const wc=m=>{m.updateMatrixWorld(true);return new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3())};
  // Record: pivot at the spindle.
  const spindleM=N("pCylinder3_dit3_0");const sc=wc(spindleM);
  rec.position.copy(sc);rec.updateMatrixWorld(true);
  rec.attach(N("pCylinder2_dit2_0"));rec.attach(spindleM);
  // Tonearm: pivot at its base.
  const baseM=N("pCylinder25_ditals_0");const pv=wc(baseM);
  arm.position.copy(pv);arm.updateMatrixWorld(true);
  ["pCylinder23_dit2_0","pCylinder30_naconez_0","pCylinder25_ditals_0"].forEach(n=>arm.attach(N(n)));
  arm.updateMatrixWorld(true);
  const head=wc(N("pCylinder30_naconez_0"));
  ARM_PLAY_Y=pv.y;ARM_LIFT_Y=pv.y;
  // Angles from the real geometry: rest is where the arm is furthest from the record; play puts the needle on the groove.
  const rr=rec.position;const nd=(th)=>{arm.rotation.y=th;arm.updateMatrixWorld(true);return new THREE.Box3().setFromObject(arm).getCenter(new THREE.Vector3())};
  let bestRest=0,bestD=-1,bestPlay=0,bestPD=1e9;
  const clear=th=>{arm.rotation.y=th;arm.updateMatrixWorld(true);let mn=1e9;arm.traverse(o=>{if(o.isMesh){const p=o.geometry.attributes.position,v=new THREE.Vector3();for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);mn=Math.min(mn,Math.hypot(v.x-rr.x,v.z-rr.z))}}});return mn};
  const target=2.0;
  for(let t=-Math.PI;t<=Math.PI;t+=.01){const d=clear(t);if(d>bestD){bestD=d;bestRest=t}}
  for(let t=-Math.PI;t<=Math.PI;t+=.01){arm.rotation.y=t;arm.updateMatrixWorld(true);const h=wc(N("pCylinder30_naconez_0"));const dd=Math.abs(Math.hypot(h.x-rr.x,h.z-rr.z)-target);if(dd<bestPD){bestPD=dd;bestPlay=t}}
  REST=bestRest;PLAY=bestPlay;arm.rotation.y=REST;
  const recTop=new THREE.Box3().setFromObject(N("pCylinder2_dit2_0")).max.y-rec.position.y;
  const label=new THREE.Mesh(new THREE.CircleGeometry(2.4,128),labelMat);label.rotation.x=-Math.PI/2;label.position.y=recTop+.01;rec.add(label);
  // Rounded deck: the same footprint and height as the deck body, with soft corners.
  const deckOld=g.scene.getObjectByName("pCube17_vinil_0");deckOld.updateMatrixWorld(true);const dbx=new THREE.Box3().setFromObject(deckOld);
  const dW=dbx.max.x-dbx.min.x,dD=dbx.max.z-dbx.min.z,dH=dbx.max.y-dbx.min.y,cr=.45,bv=.06;
  const sh=new THREE.Shape();const x0=-dW/2+bv,x1=dW/2-bv,y0=-dD/2+bv,y1=dD/2-bv;sh.moveTo(x0+cr,y0);sh.lineTo(x1-cr,y0);sh.quadraticCurveTo(x1,y0,x1,y0+cr);sh.lineTo(x1,y1-cr);sh.quadraticCurveTo(x1,y1,x1-cr,y1);sh.lineTo(x0+cr,y1);sh.quadraticCurveTo(x0,y1,x0,y1-cr);sh.lineTo(x0,y0+cr);sh.quadraticCurveTo(x0,y0,x0+cr,y0);
  const rg=new THREE.ExtrudeGeometry(sh,{depth:Math.max(dH-2*bv,.05),bevelEnabled:true,bevelThickness:bv,bevelSize:bv,bevelSegments:6,curveSegments:18});
  const sideC=document.createElement('canvas');sideC.width=sideC.height=256;const sgx=sideC.getContext('2d');sgx.fillStyle='#808080';sgx.fillRect(0,0,256,256);for(let y=0;y<256;y+=1){const v=110+Math.random()*40|0;sgx.fillStyle=`rgb(${v},${v},${v})`;sgx.fillRect(0,y,256,1)}const sideT=new THREE.CanvasTexture(sideC);sideT.wrapS=sideT.wrapT=THREE.RepeatWrapping;sideT.repeat.set(4,1);const sideM=new THREE.MeshPhysicalMaterial({color:0x1a0030,metalness:.6,roughness:.18,roughnessMap:grainT,bumpMap:grainT,bumpScale:.16,clearcoat:1,clearcoatRoughness:.03,envMapIntensity:.9});
  const roundDeck=new THREE.Mesh(rg,[lacquerM,sideM]);roundDeck.rotation.x=-Math.PI/2;roundDeck.position.set((dbx.max.x+dbx.min.x)/2,dbx.min.y+bv,(dbx.max.z+dbx.min.z)/2);roundDeck.castShadow=true;roundDeck.receiveShadow=true;tt.add(roundDeck);deckOld.visible=false;
  // Light sparkles scattered over the top and sides of the deck.
  const ins=.7,spN=420,spP=new Float32Array(spN*3);for(let i=0;i<spN;i++){const side=Math.random()<.3;let x,y,z;const x0=dbx.min.x+ins,x1=dbx.max.x-ins,z0=dbx.min.z+ins,z1=dbx.max.z-ins;if(side){const e=Math.random()<.5;x=e?dbx.min.x+bv:dbx.max.x-bv;z=z0+Math.random()*(z1-z0);y=dbx.min.y+.3+Math.random()*(dbx.max.y-dbx.min.y-.6)}else{x=x0+Math.random()*(x1-x0);z=z0+Math.random()*(z1-z0);y=dbx.max.y+.005}spP[i*3]=x;spP[i*3+1]=y;spP[i*3+2]=z}const spG=new THREE.BufferGeometry();spG.setAttribute('position',new THREE.BufferAttribute(spP,3));tt.add(new THREE.Points(spG,new THREE.PointsMaterial({color:0xffe9fb,size:.035,transparent:true,opacity:.85,depthWrite:false})));
  window.setLabel();
  // Volume button: drag up to raise the volume, down to lower it. It moves along the deck.
  const knob=N("pCube6_dit2_0");tt.attach(knob);
  const knobBaseX=knob.position.x;const KR=.7;
  const fTop=new THREE.Box3().setFromObject(tt.getObjectByName('pCube17_vinil_0')).max.y;const fL=2*KR+.45,fW=.26,fHt=.09,frM=new THREE.MeshStandardMaterial({color:0x1a0530,roughness:.45,metalness:.3});const frFloor=new THREE.Mesh(new THREE.BoxGeometry(fL,.01,fW),new THREE.MeshStandardMaterial({color:0x05000a,roughness:.7}));frFloor.position.set(knobBaseX,fTop+.002,knob.position.z);tt.add(frFloor);[[fL,.03,0,fW/2],[fL,.03,0,-fW/2]].forEach(([L,T,dx,dz])=>{const r=new THREE.Mesh(new THREE.BoxGeometry(L,fHt,T),frM);r.position.set(knobBaseX+dx,fTop+fHt/2,knob.position.z+dz);r.castShadow=true;tt.add(r)});[[.03,fW,fL/2],[.03,fW,-fL/2]].forEach(([T,W,dx])=>{const r=new THREE.Mesh(new THREE.BoxGeometry(T,fHt,W),frM);r.position.set(knobBaseX+dx,fTop+fHt/2,knob.position.z);r.castShadow=true;tt.add(r)});
  // Very thin gold line on the lower edge of the slot, under the button's path.
  const lineTop=new THREE.Box3().setFromObject(tt.getObjectByName('pCube17_vinil_0')).max.y;const lowLine=new THREE.Mesh(new THREE.BoxGeometry(2*KR+.4,.008,.04),new THREE.MeshStandardMaterial({color:0xd4a950,metalness:.9,roughness:.25}));lowLine.position.set(knobBaseX,lineTop+.03,knob.position.z);tt.add(lowLine);
  // Gold lightning bolt just below the button, lying flat on the deck.
  const bc2=document.createElement('canvas');bc2.width=bc2.height=256;const bg2=bc2.getContext('2d');bg2.clearRect(0,0,256,256);bg2.fillStyle='#e8c060';bg2.beginPath();bg2.moveTo(150,20);bg2.lineTo(70,140);bg2.lineTo(125,140);bg2.lineTo(100,236);bg2.lineTo(190,108);bg2.lineTo(135,108);bg2.lineTo(165,20);bg2.closePath();bg2.fill();const boltTex=new THREE.CanvasTexture(bc2);boltTex.encoding=THREE.sRGBEncoding;const volIcon=new THREE.Mesh(new THREE.PlaneGeometry(.32,.32),new THREE.MeshBasicMaterial({map:boltTex,transparent:true,depthWrite:false}));volIcon.rotation.x=-Math.PI/2;volIcon.position.set(knobBaseX+KR+.35,lineTop+.006,knob.position.z);tt.add(volIcon);
  const knobWalls=new THREE.Group();tt.add(knobWalls);let kSign=1;const setKnob=v=>{knob.position.x=knobBaseX+kSign*(v-.5)*2*KR;knobWalls.position.x=knob.position.x+(knobWalls.userData.off||0)};
  setKnob(+$('vol').value);
  {const kb3=new THREE.Box3().setFromObject(knob);const kc3=kb3.getCenter(new THREE.Vector3()),ks3=kb3.getSize(new THREE.Vector3());const bs=new THREE.Shape();const bev=.03;const bw=ks3.x/2-bev,bh=fW/2-bev,br=.03;bs.moveTo(-bw+br,-bh);bs.lineTo(bw-br,-bh);bs.quadraticCurveTo(bw,-bh,bw,-bh+br);bs.lineTo(bw,bh-br);bs.quadraticCurveTo(bw,bh,bw-br,bh);bs.lineTo(-bw+br,bh);bs.quadraticCurveTo(-bw,bh,-bw,bh-br);bs.lineTo(-bw,-bh+br);bs.quadraticCurveTo(-bw,-bh,-bw+br,-bh);const bG=new THREE.ExtrudeGeometry(bs,{depth:.04,bevelEnabled:true,bevelThickness:.07,bevelSize:bev,bevelSegments:4,curveSegments:8});bG.translate(0,0,-.02);bG.rotateX(-Math.PI/2);const bevelBottom=new THREE.Mesh(bG,knob.material);bevelBottom.position.set(kc3.x,kb3.min.y+.02,kc3.z);knob.attach(bevelBottom);bevelBottom.updateMatrixWorld(true);const ubb=new THREE.Box3().setFromObject(bevelBottom);const deckTopNow=new THREE.Box3().setFromObject(tt.getObjectByName('pCube17_vinil_0')).max.y;lowLine.position.y=Math.max(ubb.min.y-.006,deckTopNow+.004);}

{const kbx=new THREE.Box3().setFromObject(knob);const dTop=new THREE.Box3().setFromObject(tt.getObjectByName('pCube17_vinil_0')).max.y;const kc=kbx.getCenter(new THREE.Vector3()),ks=kbx.getSize(new THREE.Vector3());const sinkH=Math.max(.02,dTop-kbx.min.y);const wm=new THREE.MeshStandardMaterial({color:0x140020,roughness:.35,metalness:.4});const wt=.03;const yc=kbx.min.y+sinkH/2;knob.material=goldM;const cream=knob.material;knobWalls.position.set(kc.x,yc,kc.z);knobWalls.userData.off=kc.x-knob.position.x;knobWalls.position.y=yc;}
  $('vol').addEventListener('input',()=>setKnob(+$('vol').value));
    // Drag: the button follows the cursor along the slot, measured on screen.
  let kDrag=false,kX0=0,kY0=0,kV0=0,kDir=[1,0],kS=1;
  const toPx=wp=>{const v=wp.clone().project(qc);const r=pcv.getBoundingClientRect();return [r.left+(v.x+1)/2*r.width,r.top+(1-v.y)/2*r.height]};
  pcv.addEventListener('pointerdown',e=>{aim(e,pcv,qc);if(ray.intersectObject(knob,true).length){kDrag=true;kX0=e.clientX;kY0=e.clientY;kV0=+$('vol').value;ctl.enabled=false;const w0=knob.getWorldPosition(new THREE.Vector3());const w1=w0.clone().add(new THREE.Vector3(KR,0,0));const [x0,y0]=toPx(w0),[x1,y1]=toPx(w1);const dx=x1-x0,dy=y1-y0,L=Math.hypot(dx,dy)||1;kSign=dy>0?-1:1;kDir=[kSign*dx/L,kSign*dy/L];kS=L}});
  pcv.addEventListener('pointermove',e=>{if(!kDrag)return;const dot=(e.clientX-kX0)*kDir[0]+(e.clientY-kY0)*kDir[1];const v=Math.min(1,Math.max(0,kV0+.5*dot/kS));$('vol').value=v;vol=v;muted=false;setVol();setKnob(v)});
  addEventListener('pointerup',()=>{if(kDrag){kDrag=false;ctl.enabled=!lyr}});
  // Widen the deck: spread the static parts apart along the width. The record and tonearm stay as they are.
  const WF=1;const keep=new Set(["pCylinder2_dit2_0","pCylinder3_dit3_0","pCylinder23_dit2_0","pCylinder30_naconez_0","pCylinder25_ditals_0"]);
  g.scene.traverse(o=>{if(o.isMesh&&!keep.has(o.name)){o.position.z*=WF;if(o.name==='pCube17_vinil_0')o.scale.z*=WF}});
  rec.position.z*=WF;arm.position.z*=WF;
  lidG.position.z*=WF;
  window.__vinyl={rec:rec.position.toArray(),pivot:pv.toArray(),REST,PLAY,clearRest:bestD,playErr:bestPD};
  floor.position.y=new THREE.Box3().setFromObject(g.scene).min.y-.02;
},undefined,e=>{window.__deckErr=String(e)});
let ARM_PLAY_Y=.49,ARM_LIFT_Y=.95;
let REST=0,PLAY=0;const RPS=33.3/60*Math.PI*2;
const lyrG=new THREE.Group();lyrG.visible=false;qs.add(lyrG);
const knot=M(new THREE.TorusKnotGeometry(2.2,.3,140,14),new THREE.MeshBasicMaterial({color:0xc58bff,wireframe:true,transparent:true,opacity:.3}),0,0,-3);lyrG.add(knot);
const ls=[[5,1.1,1.5,.35],[7.2,1.6,0,1],[5,1.1,-1.5,.45]].map(([w,h,y,o])=>{const s=new THREE.Sprite(new THREE.SpriteMaterial({transparent:true,depthWrite:false,opacity:o}));s.scale.set(w,h,1);s.position.y=y;lyrG.add(s);return s});
function lyrTex(txt,col){const[c,g]=cnv(1400,310);let fs=92;g.textAlign='center';g.textBaseline='middle';g.font=`800 ${fs}px system-ui,sans-serif`;while(g.measureText(txt).width>1300&&fs>30){fs-=4;g.font=`800 ${fs}px system-ui,sans-serif`}g.shadowColor=col;g.shadowBlur=40;g.fillStyle='#fff';g.fillText(txt,700,155);return mk(c)}
// Genres (pictures and MusicBrainz tags come from the server) and playlists (saved on this computer).
function sylCount(w){const m=String(w).toLowerCase().match(/[aeiouy]+/g);return Math.max(1,m?m.length:1)}
function buildWords(txt){const el=$('lyricCurrent');const words=String(txt).split(' ').filter(Boolean);el.innerHTML=words.map(w=>'<span class="wm">'+esc(w)+'</span>').join(' ');const ws=[...el.querySelectorAll('.wm')];const rows=[];let lastTop=null;ws.forEach(w=>{const top=w.offsetTop;if(lastTop===null||Math.abs(top-lastTop)>4){rows.push([]);lastTop=top}rows[rows.length-1].push(w.textContent)});el.innerHTML=rows.map(r=>{const t=esc(r.join(' '));return '<div class="krow"><span class="kb">'+t+'</span><span class="kf">'+t+'</span></div>'}).join('');el._rowLens=rows.map(r=>r.reduce((a,w)=>a+sylCount(w),0)||1);window._wtDirty=true}
function paintWords(time){const li=lastLi;if(li<0||LYT[li]===undefined)return;const st=LYT[li];const en=LYT[li+1]!==undefined?LYT[li+1]:st+4;const f=Math.min(1,Math.max(0,(time+lyrOff+.4-st)/Math.max(.3,en-st)*1.15));const el=$('lyricCurrent');const kfs=el.querySelectorAll('.kf');const lens=(el._rowLens&&el._rowLens.length===kfs.length)?el._rowLens:[...kfs].map(()=>1);const total=lens.reduce((a,c)=>a+c,0)||1;const x=f*total;let run=0;kfs.forEach((kf,i)=>{const L=lens[i];const rf=Math.min(1,Math.max(0,(x-run)/L));run+=L;kf.style.setProperty('--f',(rf*100).toFixed(2)+'%')})}
let lastLi=-1;function setLines(li){if(li===-3){$('lyricCurrent').textContent='';$('lyricNext').textContent='';return}ls.forEach(sp=>sp.visible=false);const n=LY.length;if(!n){if(!lyrLoaded){const tr=T[cur]||{};$('lyricCurrent').textContent=tr.t||'';$('lyricNext').textContent=(tr.a||'').replace(/s*·.*$/,'');return}$('lyricCurrent').textContent='Lyrics not available for this song';$('lyricNext').textContent='';return}if(li<0){const tr=T[cur]||{};$('lyricCurrent').textContent=tr.t||'';$('lyricNext').textContent=(tr.a||'').replace(/s*·.*$/,'');return}[[li-1,'#9B3DF0'],[li,'#00F0FF'],[li+1,'#FF4D8D']].forEach(([k,col],j)=>{const m=ls[j].material;if(m.map)m.map.dispose();m.map=lyrTex(LY[clamp(k,0,n-1)],col);m.needsUpdate=true});const curr=LY[clamp(li,0,n-1)],next=LY[clamp(li+1,0,n-1)];buildWords(curr);$('lyricNext').textContent=li<n-1?next:'';$('lyricCurrent').style.animation='none';void $('lyricCurrent').offsetWidth;$('lyricCurrent').style.animation='';$('lyricNext').style.animation='none';void $('lyricNext').offsetWidth;$('lyricNext').style.animation=''}
const sv={p:new THREE.Vector3(0,6,7.5),t:new THREE.Vector3()};
/* Sliding pill for the Turntable / Live lyrics switch (same motion as the people-page tabs). */
function slideSeg(){const seg=document.querySelector('.seg');const b=seg&&seg.querySelector('.sel');if(!b)return;let ind=seg.querySelector('.seg-ind');if(!ind){ind=document.createElement('i');ind.className='seg-ind';seg.prepend(ind)}const x=b.offsetLeft,w=b.offsetWidth;const px=ind.dataset.x?+ind.dataset.x:x,pw=ind.dataset.w?+ind.dataset.w:w;ind.dataset.x=x;ind.dataset.w=w;ind.style.transform=`translateX(${x}px)`;ind.style.width=w+'px';if(px!==x||pw!==w)ind.animate([{transform:`translateX(${px}px) scaleX(1)`,width:pw+'px'},{transform:`translateX(${(px+x)/2}px) scaleX(1.14)`,width:((pw+w)/2)+'px',offset:.5},{transform:`translateX(${x}px) scaleX(1)`,width:w+'px'}],{duration:520,easing:'cubic-bezier(.22,.9,.25,1)'})}
function setLyr(on){if(on===lyr)return;lyr=on;lastLi=-2;pcv.style.visibility=on?'hidden':'visible';$('m1').classList.toggle('sel',!on);$('m2').classList.toggle('sel',on);slideSeg();$('lyricsHud').classList.toggle('show',on);lyrG.visible=false;tt.visible=!on;knot.visible=false;ls.forEach(sp=>sp.visible=false);
  if(on){sv.p.copy(qc.position);sv.t.copy(ctl.target);ctl.enabled=false;qc.position.set(0,0,9);ctl.target.set(0,0,0);tt.visible=false;lyrG.visible=true;lastLi=-1}
  else{ctl.enabled=true;qc.position.copy(sv.p);ctl.target.copy(sv.t);tt.visible=true;lyrG.visible=false}}
function renderQueue(){T.forEach(fillSongCover);$('ql').innerHTML=T.map((t,i)=>`<div class="row2${i===cur?' cur':''}" data-q="${i}"><span class="n">${i===cur&&playing?'♪':i+1}</span><div class="cv" style="background:${artBg(t)}"></div><div><b>${cleanTitle(stripArtist(t.t,t.a))}</b><small>${t.a}</small></div><small>${fmt(t.dur||D)}</small></div>`).join('');
  $('ptitle').innerHTML=`<b>${T[cur].t}</b><span>${T[cur].a} · ${T[cur].g}</span>`}
$('ql').onclick=e=>{const r=e.target.closest('[data-q]');if(r)pick(+r.dataset.q)};

/* ---------- interaction ---------- */
const ray=new THREE.Raycaster(),mv=new THREE.Vector2();let d0=[0,0],mx=0,my=0,hovI=-1,p=0,sp=0;
const aim=(e,cv,cam)=>{const r=cv.getBoundingClientRect();mv.set((e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height)*2+1);ray.setFromCamera(mv,cam)};
const hitCard=e=>{if(view!=='home'||sp<.75)return -1;aim(e,hcv,hc);const h=ray.intersectObjects(cards.map(c=>c.front));return h.length?h[0].object.userData.i:-1};
addEventListener('pointermove',e=>{mx=e.clientX/innerWidth*2-1;my=-(e.clientY/innerHeight*2-1)});
hcv.addEventListener('pointermove',e=>{hovI=hitCard(e);hcv.style.cursor=hovI>=0?'pointer':'default'});
hcv.addEventListener('pointerdown',e=>d0=[e.clientX,e.clientY]);
hcv.addEventListener('pointerup',e=>{const i=hitCard(e);if(i>=0&&Math.hypot(e.clientX-d0[0],e.clientY-d0[1])<=5)playSong(i)});
pcv.addEventListener('pointerdown',e=>d0=[e.clientX,e.clientY]);
pcv.addEventListener('pointerup',e=>{if(lyr||Math.hypot(e.clientX-d0[0],e.clientY-d0[1])>5)return;aim(e,pcv,qc);if(ray.intersectObject(rec,true).length)toggle()});
 $('go').onclick=()=>{const max=document.documentElement.scrollHeight-innerHeight,from=scrollY,dist=max-from,dur=1800,t0=performance.now();const ease=x=>x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;(function step(now){const k=Math.min(1,(now-t0)/dur);window.scrollTo(0,from+dist*ease(k));if(k<1)requestAnimationFrame(step)})(t0)};
function resize(){hr.setSize(innerWidth,innerHeight,false);hc.aspect=innerWidth/innerHeight;hc.fov=innerWidth<700?65:50;hc.updateProjectionMatrix()}
function pResize(){const e=$('pstage'),w=e.clientWidth,h=e.clientHeight;if(!w||!h)return;qr.setSize(w,h,false);qc.aspect=w/h;qc.updateProjectionMatrix()}
addEventListener('resize',()=>{resize();pResize()});resize();

/* ---------- mini disc: hover previews quietly, click keeps it playing ---------- */
const mini=$('mini');
mini.addEventListener('pointerenter',e=>{if(e.pointerType!=='mouse'||playing)return;preview=true;setVol();play(time)});
mini.addEventListener('pointerleave',()=>{if(preview){preview=false;pause();setVol()}});
mini.onclick=()=>{if(preview){preview=false;setVol();ui()}else toggle()};
function spawnNote(){const r=mini.getBoundingClientRect();const n=document.createElement('span');n.className='mnote';n.textContent='♪♫♩♬'[Math.floor(Math.random()*4)];n.style.setProperty('--dx',((Math.random()*2-1)*95).toFixed(0)+'px');n.style.color=['#00F0FF','#FF4D8D','#C58BFF'][Math.floor(Math.random()*3)];n.style.left=(r.left+r.width*(.4+Math.random()*.2))+'px';n.style.top=(r.top+r.height*.25)+'px';document.body.appendChild(n);setTimeout(()=>n.remove(),3700)}

/* ---------- neon background ---------- */
const bgc=$('bg'),bx=bgc.getContext('2d'),NEON=['#9B3DF0','#00F0FF','#FF4D8D','#C58BFF'],reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
let bw=0,bh=0;
const NL=Array.from({length:5},(_,i)=>({top:i<3,y:i<3?.08+Math.random()*.12:.87+Math.random()*.06,amp:.03+Math.random()*.025,f:.5+Math.random()*.7,ph:Math.random()*6.28,sp:.02+Math.random()*.03,w:.6+Math.random()*.9,off:Math.random()*12,L:12+Math.random()*6,c:[NEON[i%4],NEON[(i+2)%4]]}));
function bgSize(){const d=Math.min(devicePixelRatio,1.5);bw=innerWidth;bh=innerHeight;bgc.width=bw*d;bgc.height=bh*d;bx.setTransform(d,0,0,d,0,0)}
const lineY=(l,u,t)=>l.y*bh+Math.sin(u*l.f*6.28+t*l.sp*4+l.ph)*l.amp*bh;
function drawNote(x,y,s,k,c){bx.fillStyle=c;bx.strokeStyle=c;bx.lineCap='round';
  const head=(hx,hy)=>{bx.beginPath();bx.ellipse(hx,hy,5*s,3.8*s,-.35,0,6.283);bx.fill()};
  if(!k){head(x,y);bx.lineWidth=1.6*s;bx.beginPath();bx.moveTo(x+4.6*s,y);bx.lineTo(x+4.6*s,y-22*s);bx.stroke();bx.lineWidth=2.2*s;bx.beginPath();bx.moveTo(x+4.6*s,y-22*s);bx.quadraticCurveTo(x+16*s,y-16*s,x+9*s,y-4*s);bx.stroke()}
  else{const x2=x+15*s,y2=y+4*s;head(x,y);head(x2,y2);bx.lineWidth=1.6*s;bx.beginPath();bx.moveTo(x+4.6*s,y);bx.lineTo(x+4.6*s,y-22*s);bx.moveTo(x2+4.6*s,y2);bx.lineTo(x2+4.6*s,y2-22*s);bx.stroke();bx.lineWidth=3.2*s;bx.beginPath();bx.moveTo(x+4.6*s,y-22*s);bx.lineTo(x2+4.6*s,y2-22*s);bx.stroke()}}
const NM=Array.from({length:8},(_,i)=>({l:i%5,off:Math.random()*14,L:16+Math.random()*6,s:.9+Math.random()*.5,k:i%2,c:NEON[(i+1)%4]}));
function drawBg(t){bx.clearRect(0,0,bw,bh);const fade=view==='home'?clamp(1-scrollY/(bh*.25),0,1):0;if(!fade)return;bx.globalCompositeOperation='lighter';
  for(const l of NL){const ph=((t+l.off)/l.L)%1,dr=Math.min(1,ph/.5),ease=dr*dr*(3-2*dr),life=ph<.6?1:Math.max(0,1-(ph-.6)/.4),a=fade*life;if(a<=0)continue;
    const g=bx.createLinearGradient(0,0,bw,0);g.addColorStop(0,l.c[0]);g.addColorStop(1,l.c[1]);let hx=0,hy=0;
    bx.beginPath();for(let k=0;k<=120;k++){const u=k/120;if(u>ease)break;const x=u*bw,y=l.y*bh+Math.sin(u*l.f*6.28+t*l.sp*4+l.ph)*l.amp*bh;hx=x;hy=y;k?bx.lineTo(x,y):bx.moveTo(x,y)}
    bx.strokeStyle=g;bx.globalAlpha=.08*a;bx.lineWidth=l.w*6;bx.stroke();bx.globalAlpha=.45*a;bx.lineWidth=l.w;bx.stroke();
    if(ph<.5){bx.globalAlpha=.25*a;bx.fillStyle=l.c[0];bx.beginPath();bx.arc(hx,hy,7,0,6.283);bx.fill();bx.globalAlpha=.9*a;bx.fillStyle='#fff';bx.beginPath();bx.arc(hx,hy,1.8,0,6.283);bx.fill()}}
  for(const n of NM){const u=((t+n.off)/n.L)%1,a=fade*Math.sin(Math.PI*u)*.85;if(a<=0)continue;bx.globalAlpha=a;drawNote(u*bw,lineY(NL[n.l],u,t),n.s*.6,n.k,n.c)}
  bx.globalCompositeOperation='source-over';bx.globalAlpha=1}
function bgLoop(now){drawBg(now/1000);requestAnimationFrame(bgLoop)}
bgSize();addEventListener('resize',bgSize);
if(reduce)drawBg(0);else requestAnimationFrame(bgLoop);
/* ---------- cursor smoke trail ---------- */
const tc=$('trail'),tx=tc.getContext('2d');let TP=[];
const puff=rgb=>{const[c,g]=cnv(64,64),gr=g.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,`rgba(${rgb},.9)`);gr.addColorStop(.4,`rgba(${rgb},.35)`);gr.addColorStop(1,`rgba(${rgb},0)`);g.fillStyle=gr;g.fillRect(0,0,64,64);return c};
const PUFF={a:puff('178,112,255'),b:puff('255,122,224')};
function trailSize(){tc.width=innerWidth;tc.height=innerHeight}
addEventListener('pointermove',e=>{if(e.pointerType!=='mouse'||reduce)return;for(let i=0;i<2;i++)TP.push({x:e.clientX+(Math.random()-.5)*8,y:e.clientY+(Math.random()-.5)*8,vx:(Math.random()-.5)*.7,vy:-.3-Math.random()*.7,r:12+Math.random()*12,life:0,max:40+Math.random()*25,p:Math.random()<.6?'a':'b'});if(TP.length>400)TP.splice(0,TP.length-400)});
function trailDraw(){tx.clearRect(0,0,tc.width,tc.height);tx.globalCompositeOperation='source-over';TP=TP.filter(p=>p.life<p.max);
  for(const p of TP){p.life++;p.x+=p.vx;p.y+=p.vy;p.vy*=.99;p.vx*=.98;p.r+=.4;const k=p.life/p.max;tx.globalAlpha=(1-k)*(1-k)*(k<.12?k/.12:1)*.6;tx.drawImage(PUFF[p.p],p.x-p.r,p.y-p.r,p.r*2,p.r*2)}
  tx.globalCompositeOperation='source-over';tx.globalAlpha=1}
function trailLoop(){trailDraw();requestAnimationFrame(trailLoop)}
trailSize();addEventListener('resize',trailSize);if(!reduce)requestAnimationFrame(trailLoop);
/* ---------- account ---------- */
const acct=$('acct'),acctBox=acct.querySelector('.acct-box');
const savedUser=()=>{try{return localStorage.getItem('vin-user')}catch(e){return null}};
function setMode(m){acctBox.dataset.mode=m;const up=m==='up';$('acctSub').textContent=up?'Already with Vinylla? Sign in to continue your listening.':'New here? Create an account to save favourites.';$('acctSwitch').textContent=up?'Sign in':'Sign up'}
function setAcct(){const u=savedUser(),p=$('prof');p.classList.toggle('out',!u);p.textContent=u?u[0].toUpperCase():'Sign in';p.title=u?u:'Account';if(typeof paintAvatar==='function')paintAvatar()}
const closeAcct=()=>acct.classList.remove('open');
const finish=n=>{try{localStorage.setItem('vin-user',n)}catch(err){}setAcct();closeAcct()};
$('prof').onclick=e=>{e.stopPropagation();if(signedIn){toggleAccountMenu();return}setMode('in');acct.classList.add('open')};
function toggleAccountMenu(){const m=document.getElementById('acctMenu');if(m){closeAccountMenu();return}buildAccountMenu()}
function closeAccountMenu(){const m=document.getElementById('acctMenu');if(m)m.remove()}
function buildAccountMenu(){const btn=$('prof'),r=btn.getBoundingClientRect(),u=currentUser||{},name=u.name||'Listener',email=u.email||'',ini=(name[0]||'V').toUpperCase(),favN=favItems.length,plN=plStore.length;
  const m=document.createElement('div');m.id='acctMenu';m.className='acct-menu';m.setAttribute('role','menu');
  m.style.top=(r.bottom+10)+'px';m.style.right=Math.max(12,innerWidth-r.right)+'px';
  m.innerHTML='<div class="am-head"><span class="am-av">'+esc(ini)+'</span><div class="am-id"><b>'+esc(name)+'</b><small>'+esc(email)+'</small></div></div>'+
    '<div class="am-stats"><span><b>'+favN+'</b>Favourites</span><span><b>'+plN+'</b>Playlists</span></div>'+
    '<button class="am-item" data-am="fav" role="menuitem"><span><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg></span>Favourites</button>'+
    '<button class="am-item" data-am="pl" role="menuitem"><span><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg></span>Your playlists</button>'+
    '<button class="am-item" data-am="liked" role="menuitem"><span>♥</span>Liked playlists <b class="am-count" id="amLiked"></b></button>'+'<button class="am-item" data-am="friends" role="menuitem"><span><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.4c2.3.2 4 1.8 4.5 4.6"/></svg></span>Friends <b class="am-count" id="amFriends"></b></button>'+'<button class="am-item" data-am="people" role="menuitem" hidden><span>⌕</span>Find people</button>'+'<button class="am-item" data-am="vis" role="menuitem"><span>≡</span>Settings</button>'+'<button class="am-item" data-am="photo" role="menuitem"><span><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.4"/></svg></span>Change photo</button>'+(u.avatar?'<button class="am-item" data-am="rmphoto" role="menuitem"><span><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></span>Remove photo</button>':'')+'<button class="am-item am-out" data-am="out" role="menuitem"><span><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4M6 12h10"/></svg></span>Sign out</button>';
  document.body.appendChild(m);paintAvatarIn(m.querySelector('.am-av'));fetch('/api/me/friends').then(r=>r.json()).then(j=>{const el=m.querySelector('#amFriends');if(el&&j&&j.items)el.textContent=j.items.length}).catch(()=>{});fetch('/api/me/liked').then(r=>r.json()).then(j=>{const el=m.querySelector('#amLiked');if(el&&j&&j.items)el.textContent=j.items.length}).catch(()=>{});requestAnimationFrame(()=>m.classList.add('show'));
  m.addEventListener('click',async ev=>{const b=ev.target.closest('[data-am]');if(!b)return;ev.stopPropagation();const a=b.dataset.am;closeAccountMenu();
    if(a==='fav'){sec='Favourites';location.hash='explore';render()}
    else if(a==='pl'){sec='Your playlists';location.hash='explore';render()}
    else if(a==='out'){await signOutNow()}else if(a==='liked'){likedView=true;sec='Your playlists';location.hash='explore';render()}else if(a==='friends'){peopleTab='friends';sec='Discover people';location.hash='explore';render()}else if(a==='people'){openPeople()}else if(a==='vis'){openVisibility()}else if(a==='photo'){document.getElementById('avatarInput').click()}else if(a==='rmphoto'){await removeAvatar()}});
}
async function signOutNow(){try{await fetch('/api/auth/logout',{method:'POST'})}catch(e){}signedIn=false;currentUser=null;favItems=[];plStore=[];savePlLocalOnly();try{localStorage.removeItem('vin-user')}catch(e){}setAcct();reconcileFav();render();toast('Signed out')}
function paintAvatarIn(el){if(!el)return;const av=currentUser&&currentUser.avatar;if(av){el.style.backgroundImage='url("'+av+'")';el.style.backgroundSize='cover';el.style.backgroundPosition='center';el.textContent=''}}
function paintAvatar(){const p=$('prof');if(!p)return;const av=signedIn&&currentUser&&currentUser.avatar;if(av){p.style.backgroundImage='url("'+av+'")';p.style.backgroundSize='cover';p.style.backgroundPosition='center';p.textContent=''}else{p.style.backgroundImage='';p.style.backgroundSize='';p.style.backgroundPosition=''}}
function squarePhoto(file){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file);const im=new Image();im.onload=()=>{const n=Math.min(im.naturalWidth,im.naturalHeight),sx=(im.naturalWidth-n)/2,sy=(im.naturalHeight-n)/2,c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');g.drawImage(im,sx,sy,n,n,0,0,256,256);URL.revokeObjectURL(url);let q=.9,out=c.toDataURL('image/jpeg',q);while(out.length>380000&&q>.5){q-=.1;out=c.toDataURL('image/jpeg',q)}resolve(out)};im.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('bad image'))};im.src=url})}
async function uploadAvatar(file){if(!file||!/^image\/(jpeg|png|webp)$/.test(file.type)){alert('Choose a JPG, PNG, or WebP image.');return}try{const data=await squarePhoto(file);const r=await fetch('/api/me/avatar',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({avatar:data})});const j=await r.json().catch(()=>({}));if(!r.ok){alert(j.error||'Could not save the photo.');return}currentUser=Object.assign({},currentUser,{avatar:data});paintAvatar();toast('Profile photo updated')}catch(e){alert('Could not read that image.')}}
async function removeAvatar(){try{await fetch('/api/me/avatar',{method:'DELETE'})}catch(e){}currentUser=Object.assign({},currentUser,{avatar:null});paintAvatar();toast('Profile photo removed')}
const avatarInput=document.createElement('input');avatarInput.type='file';avatarInput.accept='image/jpeg,image/png,image/webp';avatarInput.id='avatarInput';avatarInput.hidden=true;document.body.appendChild(avatarInput);avatarInput.onchange=()=>{const f=avatarInput.files[0];avatarInput.value='';if(f)uploadAvatar(f)};
/* ---------- People: find users, view public profiles, follow or block, and choose playlist visibility ---------- */
function peopleShell(title){closePeople();const m=document.createElement('div');m.id='peopleModal';m.className='pp-overlay';m.innerHTML='<div class="pp-panel glass" role="dialog" aria-modal="true"><div class="pp-head"><b>'+esc(title)+'</b><button class="pp-x" aria-label="Close">×</button></div><div class="pp-body" id="ppBody"></div></div>';document.body.appendChild(m);requestAnimationFrame(()=>m.classList.add('show'));m.addEventListener('click',e=>{if(e.target===m||e.target.closest('.pp-x'))closePeople()});addEventListener('keydown',escPeople);return m}
function escPeople(e){if(e.key==='Escape')closePeople()}
function closePeople(){const m=document.getElementById('peopleModal');if(m){m.classList.remove('show');setTimeout(()=>m.remove(),260)}removeEventListener('keydown',escPeople)}
function peoplePageHTML(){if(!signedIn)return '<div class="pp-page"><p class="pp-hint">Sign in to discover people and see your friends.</p></div>';const f=peopleTab==='friends';return '<div class="pp-page"><div class="pp-tabs" role="tablist"><button class="pp-tab'+(f?'':' on')+'" data-pptab="search" role="tab">Search</button><button class="pp-tab'+(f?' on':'')+'" data-pptab="friends" role="tab">Friends</button></div>'+(f?'<div class="pp-list" id="ppList"><p class="pp-hint">Loading…</p></div>':'<input class="pp-search" id="ppQ" type="search" placeholder="Search people by name" autocomplete="off" aria-label="Search people"><div class="pp-list" id="ppList"><p class="pp-hint">Type at least two letters to find people.</p></div>')+'</div>'}
function bindPeoplePage(){const tabsEl=document.querySelector('.pp-tabs');if(tabsEl&&!tabsEl.querySelector('.pp-ind'))tabsEl.insertAdjacentHTML('afterbegin','<i class="pp-ind" aria-hidden="true"></i>');document.querySelectorAll('[data-pptab]').forEach(btn=>btn.onclick=()=>{if(btn.classList.contains('on'))return;const prev=peopleTab;peopleTab=btn.dataset.pptab;$('content').innerHTML=peoplePageHTML();bindPeoplePage();const ind=document.querySelector('.pp-ind');if(ind&&prev!==peopleTab){  const from=prev==='friends'?'100%':'0%',to=peopleTab==='friends'?'100%':'0%';  ind.animate([    {transform:'translateX('+from+') scaleX(1)'},    {transform:'translateX(50%) scaleX(1.16)',offset:.5},    {transform:'translateX('+to+') scaleX(1)'}  ],{duration:620,easing:'cubic-bezier(.22,.9,.25,1)'});}});if(peopleTab==='friends'){loadFriendsInto('ppList');return}const q=document.getElementById('ppQ');if(!q)return;let t=null;q.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(()=>searchPeople(q.value.trim()),320)});q.focus()}
async function loadFriendsInto(id){const list=document.getElementById(id);if(!list)return;try{const r=await fetch('/api/me/friends');const j=await r.json();if(!r.ok){list.innerHTML='<p class="pp-hint">'+esc(j.error||'Could not load friends.')+'</p>';return}if(!j.items.length){list.innerHTML='<p class="pp-hint">No friends yet. Friends are people you follow who follow you back.</p>';return}list.innerHTML=j.items.map(u=>'<button class="pp-row" data-pp="'+u.id+'"><span class="pp-av"'+(u.avatar?' style="background-image:url(&quot;'+u.avatar+'&quot;)"':'')+'>'+esc((u.name||'?')[0].toUpperCase())+'</span><span class="pp-meta"><b>'+esc(u.name)+'</b><small>Friend</small></span><span class="pp-go">›</span></button>').join('');list.querySelectorAll('[data-pp]').forEach(btn=>btn.onclick=()=>openProfile(+btn.dataset.pp))}catch(e){list.innerHTML='<p class="pp-hint">Could not reach the server.</p>'}}
function openPeople(){if(!signedIn){setMode('in');acct.classList.add('open');return}peopleShell('Find people');const b=document.getElementById('ppBody');b.innerHTML='<input class="pp-search" id="ppQ" type="search" placeholder="Search by name" autocomplete="off" aria-label="Search people"><div class="pp-list" id="ppList"><p class="pp-hint">Type at least two letters.</p></div>';const q=document.getElementById('ppQ');q.focus();let t=null;q.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(()=>searchPeople(q.value.trim()),320)})}
async function searchPeople(term){const list=document.getElementById('ppList');if(!list)return;if(term.length<2){list.innerHTML='<p class="pp-hint">Type at least two letters.</p>';return}list.innerHTML='<p class="pp-hint">Searching…</p>';try{const r=await fetch('/api/users/search?q='+encodeURIComponent(term));const j=await r.json();if(!r.ok){list.innerHTML='<p class="pp-hint">'+esc(j.error||'Could not search.')+'</p>';return}if(!j.items.length){list.innerHTML='<p class="pp-hint">No people found.</p>';return}list.innerHTML=j.items.map(u=>'<button class="pp-row" data-pp="'+u.id+'"><span class="pp-av"'+(u.avatar?' style="background-image:url(&quot;'+u.avatar+'&quot;)"':'')+'>'+esc((u.name||'?')[0].toUpperCase())+'</span><span class="pp-meta"><b>'+esc(u.name)+'</b><small>'+u.followers+' followers</small></span><span class="pp-go">›</span></button>').join('');list.querySelectorAll('[data-pp]').forEach(b=>b.onclick=()=>openProfile(+b.dataset.pp))}catch(e){list.innerHTML='<p class="pp-hint">Could not reach the server.</p>'}}
async function openProfile(id){peopleShell('Profile');const b=document.getElementById('ppBody');b.innerHTML='<p class="pp-hint">Loading…</p>';try{const r=await fetch('/api/users/'+id);const j=await r.json();if(!r.ok){b.innerHTML='<p class="pp-hint">'+esc(j.error||'Not available.')+'</p><button class="pp-btn" data-back="1">← Back</button>';b.querySelector('[data-back]').onclick=openPeople;return}const u=j.user;b.innerHTML='<button class="pp-back" data-back="1">← Back</button><div class="pp-hero"><span class="pp-av pp-av-lg"'+(u.avatar?' style="background-image:url(&quot;'+u.avatar+'&quot;)"':'')+'>'+esc((u.name||'?')[0].toUpperCase())+'</span><div><b>'+esc(u.name)+'</b><small><span id="ppFollowers">'+u.followers+'</span> followers · '+u.following+' following</small></div></div>'+(u.isSelf?'':'<div class="pp-actions"><button class="pp-btn pp-follow'+(u.isFollowing?' on':'')+'" id="ppFollow">'+(u.isFollowing?'Following':'Follow')+'</button><button class="pp-btn pp-block" id="ppBlock">Block</button></div>')+'<h4 class="pp-sub">Public playlists</h4><div class="pp-list">'+(j.playlists.length?j.playlists.map(p=>'<div class="pp-pl"><b>'+esc(p.name)+'</b><small>'+p.tracks.length+' songs</small></div>').join(''):'<p class="pp-hint">No public playlists yet.</p>')+'</div>';b.querySelector('[data-back]').onclick=openPeople;const f=document.getElementById('ppFollow');if(f)f.onclick=()=>toggleFollow(id,u.isFollowing);decoratePlaylists(id,j.playlists);const bl=document.getElementById('ppBlock');if(bl)bl.onclick=()=>blockUser(id,u.name)}catch(e){b.innerHTML='<p class="pp-hint">Could not reach the server.</p>'}}
function likedPageHTML(){return '<div class="pp-page"><div class="pp-tabs" role="tablist"><button class="pp-tab" data-lk="mine" role="tab">Mine</button><button class="pp-tab on" data-lk="liked" role="tab">Liked</button></div><div class="pl-grid" id="likedGrid"><p class="pp-hint">Loading…</p></div></div>'}
function bindLikedPage(){document.querySelectorAll('[data-lk]').forEach(btn=>btn.onclick=()=>{if(btn.dataset.lk==='mine'){likedView=false;render()}});loadLikedGrid()}
async function loadLikedGrid(){const grid=document.getElementById('likedGrid');if(!grid)return;try{const r=await fetch('/api/me/liked');const j=await r.json();if(!r.ok){grid.innerHTML='<p class="pp-hint">'+esc(j.error||'Sign in to see liked playlists.')+'</p>';return}if(!j.items.length){grid.innerHTML='<p class="pp-hint">No liked playlists yet. Open someone’s profile and tap the heart on a playlist.</p>';return}grid.innerHTML=j.items.map((p,i)=>'<button class="pl-card" data-lkopen="'+i+'"><span class="pl-name">'+esc(p.name)+'</span><small>by '+esc(p.ownerName)+' · '+p.tracks.length+' songs</small></button>').join('');grid.querySelectorAll('[data-lkopen]').forEach(btn=>btn.onclick=()=>openLikedPlaylist(j.items[+btn.dataset.lkopen]))}catch(e){grid.innerHTML='<p class="pp-hint">Could not reach the server.</p>'}}
function playExternal(tr){const obj={id:'yt'+tr.yt,yt:tr.yt,t:tr.t||'',a:tr.a||'',al:tr.a||'',g:'Music',dur:0,img:tr.img||null,fallbackImg:tr.img||null,lyricOnly:false,coverPending:!tr.img,c:palFor(tr.yt),bpm:0,root:220,sc:[0,3,7,10,12,7,3],w:'sine'};let i=T.findIndex(x=>x.yt===tr.yt);if(i<0){T.push(obj);i=T.length-1}playSong(i)}
function openLikedPlaylist(p){const m=peopleShell(p.name);const b=document.getElementById('ppBody');b.innerHTML='<p class="pp-hint">by '+esc(p.ownerName)+' · '+p.tracks.length+' songs</p><div class="pp-list">'+(p.tracks.length?p.tracks.map((t,i)=>'<div class="pp-pl pp-track"><span class="pp-meta"><b>'+esc(t.t||'')+'</b><small>'+esc(t.a||'')+'</small></span><button class="pp-like" data-lkplay="'+i+'" aria-label="Play">▶</button></div>').join(''):'<p class="pp-hint">This playlist is empty.</p>')+'</div><button class="pp-btn pp-block" id="lkUnlike">Remove from liked</button>';b.querySelectorAll('[data-lkplay]').forEach(btn=>btn.onclick=()=>{const tr=p.tracks[+btn.dataset.lkplay];if(tr&&tr.yt){closePeople();playExternal(tr)}});document.getElementById('lkUnlike').onclick=async()=>{await fetch('/api/users/'+p.ownerId+'/playlists/'+encodeURIComponent(p.id)+'/like',{method:'DELETE'});toast('Removed from liked');closePeople();render()}}
async function likedSet(){try{const r=await fetch('/api/me/liked');const j=await r.json();return new Set((j.items||[]).map(x=>x.ownerId+'|'+x.id))}catch(e){return new Set()}}
async function decoratePlaylists(ownerId,pls){const set=await likedSet();document.querySelectorAll('#ppBody .pp-pl').forEach((row,i)=>{const p=pls[i];if(!p)return;const on=set.has(ownerId+'|'+p.id);const btn=document.createElement('button');btn.className='pp-like'+(on?' on':'');btn.textContent=on?'♥':'♡';btn.setAttribute('aria-label',on?'Unlike playlist':'Like playlist');btn.onclick=async()=>{const was=btn.classList.contains('on');const r=await fetch('/api/users/'+ownerId+'/playlists/'+encodeURIComponent(p.id)+'/like',{method:was?'DELETE':'POST'});const j=await r.json().catch(()=>({}));if(!r.ok){toast(j.error||'Could not update');return}btn.classList.toggle('on',!was);btn.textContent=was?'♡':'♥';toast(was?'Removed from liked':'Playlist liked')};row.appendChild(btn)})}
async function toggleFollow(id,was){const r=await fetch('/api/users/'+id+'/follow',{method:was?'DELETE':'POST'});const j=await r.json().catch(()=>({}));if(!r.ok){toast(j.error||'Could not update');return}openProfile(id)}
async function blockUser(id,name){if(!confirm('Block '+name+'? They will not see your profile and you will not see theirs.'))return;const r=await fetch('/api/users/'+id+'/block',{method:'POST'});if(r.ok){toast('Blocked '+name);openPeople()}else{toast('Could not block')}}
function openVisibility(){if(!signedIn){setMode('in');acct.classList.add('open');return}peopleShell('Settings');const sh='<h4 class="pp-sub">Playlist visibility</h4>';const b=document.getElementById('ppBody');if(!plStore.length){b.innerHTML='<p class="pp-hint">You have no playlists yet.</p>';return}b.innerHTML=sh+'<p class="pp-hint">Private playlists are visible only to you. Public playlists appear on your profile.</p><div class="pp-list">'+plStore.map(p=>'<label class="pp-vis"><span><b>'+esc(p.name)+'</b><small>'+(p.tracks||[]).length+' songs</small></span><input type="checkbox" data-vis="'+esc(p.id)+'"'+(p.public?' checked':'')+' class="pp-switch"></label>').join('')+'</div>';b.querySelectorAll('[data-vis]').forEach(cb=>cb.onchange=()=>{const p=plById(cb.dataset.vis);if(!p)return;p.public=cb.checked;savePl();toast(cb.checked?'Playlist is public':'Playlist is private')})}
function savePlLocalOnly(){try{localStorage.setItem('vinylla.playlists','[]')}catch(e){}}
document.addEventListener('click',e=>{if(!e.target.closest('#acctMenu')&&!e.target.closest('#prof'))closeAccountMenu()});
addEventListener('keydown',e=>{if(e.key==='Escape')closeAccountMenu()});
addEventListener('scroll',closeAccountMenu,{passive:true});
$('acctX').onclick=closeAcct;
$('acctSwitch').onclick=()=>setMode(acctBox.dataset.mode==='in'?'up':'in');
acct.onclick=e=>{if(e.target===acct)closeAcct()};
addEventListener('keydown',e=>{if(e.key==='Escape')closeAcct()});
$('formIn').onsubmit=async e=>{e.preventDefault();const r=await authCall('/api/auth/login',{email:$('si-email').value,password:$('si-pass').value});if(r){e.target.reset();await afterSignIn(r.user);closeAcct()}};
$('formUp').onsubmit=async e=>{e.preventDefault();const r=await authCall('/api/auth/register',{name:$('su-name').value,email:$('su-email').value,password:$('su-pass').value});if(r){e.target.reset();await afterSignIn(r.user);closeAcct()}};
setMode('in');setAcct();applyTopSongs();renderHomeTop();setTimeout(applyTopSongs,6000);setTimeout(applyTopSongs,2500);fetch('/api/auth/me').then(r=>r.json()).then(j=>{if(j.user)afterSignIn(j.user)}).catch(()=>{});
/* ---------- YouTube catalogue ---------- */
let rsT;
const PALS=['#9B3DF0','#00F0FF','#FF4D8D','#C58BFF','#FFB35C','#8A4BD6','#3B2FA8','#FF2E88','#4B1A8F','#69F0ED'];
const palFor=s=>{let h=0;for(const ch of String(s))h=(h*31+ch.charCodeAt(0))>>>0;return[PALS[h%PALS.length],PALS[(h>>>3)%PALS.length]]};
const cleanTitle=s=>String(s).replace(/\s*[(\[][^)\]]*(official|lyrics?|audio|video|music video|hd|4k|visualizer|remaster(ed)?)[^)\]]*[)\]]/ig,'').replace(/\s*-?\s*official\s+(music\s+)?video.*$/i,'').replace(/\s*\|.*$/,'').replace(/\s+/g,' ').trim();
const cleanArtist=s=>String(s||'').replace(/VEVO$/i,'').replace(/s*-s*Topic$/i,'').trim();
function fillSongCover(t){if(!t||t.img||!t.coverPending)return;t.coverPending=false;const done=()=>{if(typeof render==='function')render();if(window.renderQueue)renderQueue()};fetch('/api/cover?'+new URLSearchParams({artist:t.a||'',title:t.t||''})).then(r=>r.json()).then(j=>{t.img=(j&&j.cover)||t.fallbackImg||null;done()}).catch(()=>{t.img=t.fallbackImg||null;done()})}
function stripArtist(title,artist){const t=String(title||'');const parts=t.split(' - ');const a=String(artist||'').replace(/vevo$/i,'').replace(/\s*-\s*topic$/i,'').replace(/\s+/g,'').toLowerCase();if(parts.length>1&&parts[0].replace(/\s+/g,'').toLowerCase()===a)return parts.slice(1).join(' - ');return t}
function ytTrack(x){const o={id:'yt'+x.videoId,yt:x.videoId,t:cleanTitle(x.title),a:cleanArtist(x.channel),al:cleanArtist(x.channel),g:'Music',dur:0,img:null,fallbackImg:x.thumb,lyricOnly:!!x.lyricOnly,coverPending:true,c:palFor(x.videoId),bpm:0,root:220,sc:[0,3,7,10,12,7,3],w:'sine'};if(o.coverPending)fillSongCover(o);return o}
async function ytApi(path,params){const r=await fetch('/api/youtube/'+path+'?'+new URLSearchParams(params));const j=await r.json();if(!r.ok)throw new Error(j.error||'YouTube error');return j.items||[]}
function setTracks(list){T.length=0;T.push(...list.map(ytTrack))}
function refreshLive(){AL.length=0;AL.push(...T.map(t=>t.al));AR.length=0;AR.push(...[...new Set(T.map(t=>t.a))].map(n=>({n,c:T.find(t=>t.a===n).c,l:T.filter(t=>t.a===n).length+' videos'})));}
function loadLive(){T.length=0;chartDone.tracks=false;revealFrom=Infinity;loadChartPage('tracks')}
let searching=false,remoteOn=false;
function secSearch(){clearTimeout(secT);if(secQ.length<2){secMBA=[];secMBR=[];if(songSearchOn){songSearchOn=false;loadLive()}return}secT=setTimeout(()=>{fetch('/api/yt/search?q='+encodeURIComponent(secQ)).then(r=>r.json()).then(j=>{if(sec==='Artists'&&secQ.length>=2){secMBA=j.artists||[];keepFocus(render)}if(sec==='Albums'&&secQ.length>=2){secMBR=j.albums||[];keepFocus(render)}if((sec==='Top songs'||sec==='Songs')&&secQ.length>=2&&(j.songs||[]).length){songSearchOn=true;setTracks(j.songs);keepFocus(render)}}).catch(()=>{})},350)}
function keepFocus(fn){const a=document.activeElement,had=a&&a.id==='localSearch',pos=had?a.selectionStart:0;fn();if(had){const n=$('localSearch');if(n){n.focus();n.setSelectionRange(pos,pos)}}}
function albumHTML(){const A=albumView;if(A.error)return '<button class="pill al-back" data-back="1">← Back</button><p class="sub">Could not load these songs. Try again.</p>';if(!A.loaded)return '<p class="sub">'+'Loading songs…'+'</p>';const al=A.album,mins=Math.round(A.tracks.reduce((s,t)=>s+(t.duration||0),0)/60);return `<button class="pill al-back" data-back="1">← Back</button><section class="al-hero" style="--cov:url('${esc(al.cover)}');--c1:${palFor(al.id)[0]};--c2:${palFor(al.id)[1]}"><div class="al-cover"><img src="${esc(al.cover)}" alt="" onerror="this.style.display='none'"></div><div class="al-meta"><span class="al-kicker">${esc(al.kind||'Album')}</span><h2>${esc(al.title)}</h2><div class="al-chips"><span class="chip">${esc(al.artist)}</span>${al.year?'<span class="chip">'+esc(al.year)+'</span>':''}<span class="chip">${A.tracks.length} songs</span><span class="chip">${mins} min</span></div><button class="big al-play" data-play="1">▶ Play album</button></div></section><div class="al-list">${A.tracks.map((t,i)=>`<div class="al-row" data-trk="${i}"${A.playlist?' draggable="true"':''}><span class="al-n">${i+1}</span><img class="al-thumb" src="${esc(t.cover||'')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><div class="al-t"><b>${esc(t.title)}</b><small>${esc(t.artist)}</small></div><span class="al-d">${t.duration?fmt(t.duration):'—'}</span>${A.playlist?`<span class="al-ctl"><button class="al-x" data-plup="${i}" aria-label="Move up">↑</button><button class="al-x" data-pldown="${i}" aria-label="Move down">↓</button><button class="al-x" data-plremove="${i}" aria-label="Remove from playlist">✕</button></span>`:''}</div>`).join('')}</div>`}

async function openArtist(id){albumView={loaded:false,artist:true};render();try{const url=/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(id)?'/api/mb/artist/':'/api/yt/artist/';const r=await fetch(url+encodeURIComponent(id));const j=await r.json();if(!r.ok)throw new Error(j.error||'error');albumView={loaded:true,album:{id:j.artist.id,title:j.artist.name,artist:'Artist',cover:j.artist.picture,year:'',kind:'Artist'},tracks:j.tracks}}catch(e){albumView={loaded:true,error:true}}render()}
async function openAlbum(id,title,artist){albumView={loaded:false};render();try{let key=id;if(!id.includes('|')&&!/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(id)){const r0=await fetch('/api/mb/resolve-album?title='+encodeURIComponent(title||'')+'&artist='+encodeURIComponent(artist||''));const j0=await r0.json();if(!r0.ok||!j0.id)throw new Error('not found');key=j0.id}const url=key.includes('|')?'/api/yt/album?key=':'/api/mb/album/';const r=await fetch(url+encodeURIComponent(key));const j=await r.json();if(!r.ok)throw new Error(j.error||'error');albumView={loaded:true,album:j.album,tracks:j.tracks}}catch(e){albumView={loaded:true,error:true}}render()}
function playAlbum(i){const A=albumView;T.length=0;T.push(...A.tracks.map((t,k)=>({id:'al'+k,t:t.title,a:t.artist,al:A.album.title,g:'Album',dur:t.duration,yt:t.videoId||null,q:t.videoId?null:1,img:t.cover||null,fallbackImg:t.cover||null,coverPending:!t.cover,c:palFor(A.album.id+k),bpm:0,root:220,sc:[0,3,7,10,12,7,3],w:'sine'})));playSong(i)}
function resolveTrack(t,off){if(t.resolving)return;t.resolving=true;const u='/api/youtube/resolve?'+new URLSearchParams({artist:t.a,title:t.t});fetch(u).then(r=>r.ok?r.json():null).then(j=>{t.resolving=false;if(j&&j.videoId){t.yt=j.videoId;play(off)}else{playing=false;ui()}}).catch(()=>{t.resolving=false;playing=false;ui()})}
function resultsHTML(){
  const tabs=[['all','All'],['songs','Songs'],['artists','Artists'],['albums','Albums']].map(([k,l])=>`<button class="pill${resTab===k?' sel':''}" data-rt="${k}">${l}</button>`).join('');
  const songRows=(list)=>list.map(t=>`<div class="row2" data-i="${T.indexOf(t)}"><span class="n">${T.indexOf(t)+1}</span><div class="cv" style="background:${artBg(t)}"></div><div><b>${esc(t.t)}</b><small>${esc(t.a)}</small></div><small>${esc(t.g)}</small></div>`).join('');
  const artCards=(list)=>list.map(a=>`<div class="ar" data-artist="${esc(a.id)}">${artAv(a)}<b>${esc(a.name)}</b><small>${artInfo(a)}</small></div>`).join('');
  const albCards=(list)=>list.map(r=>`<div class="al" data-album="${esc(r.id)}"><div class="wrap"><div class="disc2" style="--lc:${palFor(r.id)[0]}"></div><img class="sleeve" src="${esc(r.cover)}" alt="" loading="lazy" onerror="this.style.display='none'" style="width:100%;height:100%;border-radius:10px;object-fit:cover"></div><b>${esc(r.title)}</b><small>${esc(r.artist)}${r.year?' · '+esc(r.year):''}</small></div>`).join('');
  const songs=remoteOn?T:[];
  const ph=(t)=>`<p class="sub">${searching?'Searching…':'No '+t+' found'}</p>`;
  let body;
  if(resTab==='songs')body=`<div>${songRows(songs)||ph('songs')}</div>`;
  else if(resTab==='artists')body=`<div class="grid">${artCards(MBA)||ph('artists')}</div>`;
  else if(resTab==='albums')body=`<div class="grid al-g">${albCards(MBR)||ph('albums')}</div>`;
  else body=`<h3 class="rs-h">Songs</h3><div>${songRows(songs.slice(0,6))||ph('songs')}</div><h3 class="rs-h">Artists</h3><div class="grid">${artCards(MBA.slice(0,6))||ph('artists')}</div><h3 class="rs-h">Albums</h3><div class="grid al-g">${albCards(MBR.slice(0,6))||ph('albums')}</div>`;
  return `<h2>Results for “${esc(rawQ.trim())}”</h2><div class="rs-tabs">${tabs}</div>${body}`;
}

let MBA=[],MBR=[];
async function musicApi(kind,q){const r=await fetch('/api/music/'+kind+'?q='+encodeURIComponent(q));const j=await r.json();if(!r.ok)throw new Error(j.error||'error');return j.items||[]}
function playQuery(q){query=q.trim().toLowerCase();rawQ=q;resTab='all';$('q').value=q;remoteSearch(query);render()}

function remoteSearch(q){clearTimeout(rsT);if(!q){searching=false;remoteOn=false;MBA=[];MBR=[];loadLive();return}if(q.length<2)return;searching=true;clearTimeout(rsT);rsT=setTimeout(()=>{fetch('/api/yt/search?q='+encodeURIComponent(q)).then(r=>r.json()).then(j=>{MBA=j.artists||[];MBR=j.albums||[];searching=false;remoteOn=true;if((j.songs||[]).length){setTracks(j.songs);refreshLive()}keepFocus(render)}).catch(()=>{searching=false;keepFocus(render)})},400)}

/* ---------- loop ---------- */
let omega=0,ang=0,last=performance.now(),noteT=0,fd=new Uint8Array(128);const sm={x:0,y:0};
const win=(a,b,c,d)=>clamp((sp-a)/(b-a),0,1)*(1-clamp((sp-c)/(d-c),0,1));
function home(dt,t,k){
  const m=document.documentElement.scrollHeight-innerHeight;p=m>0?clamp(scrollY/m,0,1):0;sp+=(p-sp)*(1-Math.exp(-3.2*dt));
  const wide=innerWidth>760,hx=wide?3:0,hy=wide?0:-1.4,lead=clamp(sp/.12,0,1),ease=lead*lead*(3-2*lead),cx=hx*ease,cy=hy*ease,portalT=clamp((sp-.075)/.09,0,1),portal=portalT*portalT*(3-2*portalT),rvT=clamp((sp-.7)/.16,0,1),rv=rvT*rvT*(3-2*rvT);
  hero.visible=true;hero.scale.setScalar(1.15*(1-portal*.7));hero.position.set(hx+sm.x*.15,hy+sm.y*.1,0);hero.rotation.set(-sm.y*.3,sm.x*.35,0);heroRec.rotation.z-=omega*.5*dt;
  rings.forEach((r,i)=>{r.position.set(cx,cy,r.position.z);r.rotation.z=(i%2?1:-1)*(sp*3+sm.x*.35);r.visible=portal>.001;r.material.opacity=.55*portal*(1-rv)});filaments.forEach((f,i)=>{f.position.set(cx,cy,0);f.rotation.z=Math.sin(t*.11+i)*.012;f.visible=portal>.001;f.material.opacity=.3*portal*(1-rv)});
  const cz=9-sp*66;hc.position.set(cx+sm.x*.3,cy+sm.y*.25,cz);hc.lookAt(cx+sm.x*1.2,cy+sm.y*.6,cz-10);cardsG.position.set(cx,cy-1.5,-66);cardsG.scale.setScalar(Math.min(1,innerWidth/1450));
  cards.forEach((c,i)=>{const target=c.base*(hovI===i?1.3:1)*rv,s=c.grp.scale.x+(target-c.grp.scale.x)*k*2;c.grp.scale.setScalar(s);c.grp.visible=rv>.01;c.grp.position.y=c.y+Math.sin(t*.7+i*1.3)*.045-(1-rv)*1.2;c.grp.position.z=c.z;c.grp.rotation.y=sm.x*.04;c.grp.rotation.x=0;c.grp.rotation.z=0});
  [['s0',-1,0,.03,.09],['s1',.15,.2,.3,.35],['s2',.38,.43,.54,.6],['s3',.7,.78,2,3]].forEach(([id,a,b,c,d])=>{const v=win(a,b,c,d),el=$(id);el.style.opacity=v;el.style.visibility=v>.02?'visible':'hidden';el.style.translate=`0 ${(1-v)*26}px`});
  $('rose').style.opacity=1-.8*clamp((sp-.45)/.35,0,1);$('veil').style.opacity=.55*clamp(sp,0,1);$('cta').classList.toggle('show',sp>.8);$('hint').style.opacity=sp<.03?1:0;hr.render(hs,hc)}
function player(dt,t,bass){if(qc&&pcv&&pcv.clientWidth){const W=pcv.clientWidth,H=pcv.clientHeight;qc.setViewOffset(W,H,0,-42,W,H)}if(window.__lidG){lidOpenT=Math.min(1,lidOpenT+dt*.7);const e=1-Math.pow(1-lidOpenT,3);window.__lidG.rotation.z=1.9*e;tt.rotation.y=.22*(1-e);}
  rec.rotation.y-=omega*dt;tt.position.y+=((playing?Math.sin(t*1.6)*.05:0)-tt.position.y)*.15;arm.rotation.z+=((playing?.08:0)-arm.rotation.z)*2*dt;if(playing){arm.rotation.y+=(PLAY-arm.rotation.y)*2*dt;arm.position.y+=((Math.abs(arm.rotation.y-PLAY)<.05?ARM_PLAY_Y:ARM_LIFT_Y)-arm.position.y)*3*dt}
else{arm.position.y+=(ARM_LIFT_Y-arm.position.y)*3*dt;if(arm.position.y>ARM_LIFT_Y-.05)arm.rotation.y+=(REST-arm.rotation.y)*2*dt}pl1.intensity=0;
  if(lyr){let li=-1;for(let k=0;k<LYT.length;k++)if(LYT[k]<=time+lyrOff+1)li=k;if(li>=0&&time<(LYT[0]<=2?.5:1))li=-1;const ho=(li<0&&time>=27&&LY.length)?-3:li;if(ho!==lastLi){lastLi=ho;setLines(ho)}paintWords(smoothTime());$('lyricProgress').style.width=`${Math.min(100,time/Math.max(1,D)*100)}%`;ls[1].scale.set(7.2*(1+bass*.1),1.6*(1+bass*.1),1);ls[1].material.rotation=Math.sin(t/1.4)*.03;knot.rotation.x+=.2*dt;knot.rotation.y+=.3*dt+bass*.05}
  if(!lyr){ctl.update();qr.render(qs,qc)}}
(function loop(now){requestAnimationFrame(loop);const dt=Math.min((now-last)/1000,.05),k=1-Math.exp(-3*dt),t=now/1000;last=now;
  omega+=((playing?RPS:0)-omega)*(playing?2.5:1.2)*dt;ang+=omega*dt*57.3;$('md').style.transform=`translateX(${Math.sin(ang*.02)*4}px) rotate(${ang}deg)`;
  if((playing||preview)&&view!=='player'&&now-noteT>760){noteT=now;spawnNote()}
  sm.x+=(mx-sm.x)*k;sm.y+=(my-sm.y)*k;
  let bass=0;if(an&&playing){an.getByteFrequencyData(fd);bass=(fd[1]+fd[2]+fd[3]+fd[4])/1020}
  if(view==='home')home(dt,t,k);else if(view==='player')player(dt,t,bass);else lidOpenT=0})(performance.now());
setTrack();route();loadLive();loadGenres().then(()=>render());

// A station: the songs YouTube finds for its genre, played as a queue.
function playRadio(genre){const info=GENRE_INFO[genre];if(!info)return;fetch('/api/mb/genre?tag='+encodeURIComponent(info.tag)).then(r=>r.json()).then(j=>{if(j.items&&j.items.length){setMbTracks(j.items);playSong(0)}}).catch(()=>{})}
// Reorders albums so no two neighbours share a cover.
function spreadCovers(list){const left=[...list],out=[];while(left.length){let k=left.findIndex(a=>!out.length||a.cover!==out[out.length-1].cover);if(k<0)k=0;out.push(left.splice(k,1)[0])}return out}

// Songs from MusicBrainz search: played through a YouTube lookup of the same song.
function setMbTracks(list){T.length=0;T.push(...list.map(x=>({id:'mb'+x.id,t:cleanTitle(x.title),a:cleanArtist(x.artist),al:x.album,g:'Music',dur:x.duration,img:x.cover,yt:null,q:x.artist+' '+x.title,c:palFor(x.id),bpm:0,root:220,sc:[0,3,7,10,12,7,3],w:'sine'})))}
// A genre: its songs, shown like an album page (scrollable, with play all).
async function openGenre(name){const info=GENRE_INFO[name];if(!info)return;albumView={loaded:false};render();try{const r=await fetch('/api/mb/genre?tag='+encodeURIComponent(info.tag));const j=await r.json();if(!r.ok)throw new Error(j.error||'error');albumView={loaded:true,album:{id:'genre:'+name,title:name,artist:'Genre',cover:info.image,year:'',kind:'Genre'},tracks:j.items.map(s=>({videoId:null,title:s.title,artist:s.artist,album:s.album,duration:s.duration,cover:s.cover}))}}catch(e){albumView={loaded:true,error:true}}render()}

// A short animation on a button (restarts if clicked again).
function pulse(el){el.classList.remove('pop');void el.offsetWidth;el.classList.add('pop')}

// Album covers for the Top songs cards: each song is looked up once, and its card updates when the cover arrives.
const hdDone=new Set();
function hdCovers(){T.forEach((t,i)=>{if(!t.yt||hdDone.has(t.yt))return;hdDone.add(t.yt);let artist=(t.a||'').replace(/VEVO$|\s*-\s*Topic$|\s*-\s*Chart$/i,'').replace(/([a-z])([A-Z])/g,'$1 $2').trim();let song=t.t;const dash=song.indexOf(' - ');if(dash>0){artist=song.slice(0,dash).trim();song=song.slice(dash+3)}fetch('/api/cover?artist='+encodeURIComponent(artist)+'&title='+encodeURIComponent(song)).then(r=>r.json()).then(j=>{if(!j.cover)return;t.img=j.cover;const el=document.querySelector('.sc[data-i="'+i+'"] .art');if(el)el.style.background="url('"+j.cover+"') center/cover no-repeat"}).catch(()=>{})})}

// Top songs keeps loading as you scroll: a scroll check backs up the sentinel near the bottom of the page.
addEventListener('scroll',()=>{if(sec!=='Top songs'||query||secQ||chartDone.tracks)return;if(innerHeight+scrollY>document.body.scrollHeight-900)loadChartPage('tracks')},{passive:true});

// Playlist cards: the mosaic of song covers, or the playlist's own cover.
function plMosaic(p){const imgs=p.tracks.map(t=>t.img).filter(Boolean).slice(0,4);if(p.cover)return '<img class="pl-cover" src="'+esc(p.cover)+'" alt="" decoding="async">';const cells=[0,1,2,3].map(i=>imgs[i]?'<img src="'+esc(imgs[i])+'" alt="" loading="lazy" decoding="async">':'<i></i>').join('');return '<div class="pl-mosaic'+(imgs.length?'':' empty')+'" style="--c:'+palFor(p.id)[0]+'">'+cells+'</div>'}
function plTotal(p){const s=p.tracks.reduce((n,t)=>n+(t.dur||0),0);return s?fmt(s):''}
function plCard(p){const total=plTotal(p);return '<button class="pl-card" data-pl="'+esc(p.id)+'"><div class="pl-art">'+plMosaic(p)+'<span class="pl-play" aria-hidden="true">▶</span></div><div class="pl-meta"><b>'+esc(p.name)+'</b><small>'+p.tracks.length+(p.tracks.length===1?' song':' songs')+(total?' · '+total:'')+'</small></div></button>'}

// Cover upload: the picture is cropped to a square and saved with the playlist.
function setPlCover(id,file){const p=plById(id);if(!p||!file||!file.type.startsWith('image/'))return;const url=URL.createObjectURL(file);const im=new Image();im.onload=()=>{const S=720,c=document.createElement('canvas');c.width=S;c.height=S;const x=c.getContext('2d');x.imageSmoothingQuality='high';const k=Math.max(S/im.naturalWidth,S/im.naturalHeight);const w=im.naturalWidth*k,h=im.naturalHeight*k;x.drawImage(im,(S-w)/2,(S-h)/2,w,h);p.cover=c.toDataURL('image/jpeg',0.9);URL.revokeObjectURL(url);savePl();openPlaylist(id);toast('Cover updated')};im.onerror=()=>{URL.revokeObjectURL(url);toast('Could not read that image')};im.src=url}
$('content').addEventListener('change',e=>{const f=e.target;if(f.dataset&&f.dataset.plcover)setPlCover(f.dataset.plcover,f.files[0])});

// Playlist order: moving a song to another place in the list, then the page shows the new order.
function movePl(id,from,to){const p=plById(id);if(!p||to<0||to>=p.tracks.length||from===to)return;p.tracks.splice(to,0,p.tracks.splice(from,1)[0]);savePl();openPlaylist(id)}
let plDrag=null;
$('content').addEventListener('dragstart',e=>{const row=e.target.closest('[data-trk]');if(!row||!albumView||!albumView.playlist)return;plDrag=+row.dataset.trk;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(plDrag));row.classList.add('dragging')});
$('content').addEventListener('dragover',e=>{if(plDrag===null)return;const row=e.target.closest('[data-trk]');if(!row)return;e.preventDefault();e.dataTransfer.dropEffect='move';document.querySelectorAll('.al-row.drop-target').forEach(n=>n.classList.remove('drop-target'));row.classList.add('drop-target')});
$('content').addEventListener('drop',e=>{if(plDrag===null||!albumView||!albumView.playlist)return;e.preventDefault();const row=e.target.closest('[data-trk]');const from=plDrag,to=row?+row.dataset.trk:from;plDrag=null;movePl(albumView.playlist,from,to)});
$('content').addEventListener('dragend',()=>{plDrag=null;document.querySelectorAll('.dragging,.drop-target').forEach(n=>n.classList.remove('dragging','drop-target'))});


/* Click ripple for the large buttons. */
document.addEventListener('pointerdown',e=>{const b=e.target.closest('.big');if(!b)return;const r=b.getBoundingClientRect(),d=Math.max(r.width,r.height)*2.2,s=document.createElement('span');s.className='rip';s.style.width=s.style.height=d+'px';s.style.left=(e.clientX-r.left-d/2)+'px';s.style.top=(e.clientY-r.top-d/2)+'px';b.appendChild(s);setTimeout(()=>s.remove(),750)});

/* Click action for the large buttons: bounce, and notes floating out. */
document.addEventListener('pointerdown',e=>{const b=e.target.closest('.big');if(!b)return;b.classList.remove('bounce');void b.offsetWidth;b.classList.add('bounce');
  const r=b.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,glyphs=['♪','♫'];
  const N=6,off=Math.random()*Math.PI*2;
  for(let k=0;k<N;k++){const a=off+(k/N)*Math.PI*2,dist=(r.width*.3)+(34+Math.random()*20);
    const n=document.createElement('span');n.className='note';n.textContent=glyphs[k%glyphs.length];n.style.left=cx+'px';n.style.top=cy+'px';
    n.style.setProperty('--tx',(Math.cos(a)*dist).toFixed(1)+'px');n.style.setProperty('--ty',(Math.sin(a)*dist).toFixed(1)+'px');
    n.style.setProperty('--rot',((Math.random()*2-1)*40).toFixed(0)+'deg');n.style.setProperty('--d',(0.85+Math.random()*0.35).toFixed(2)+'s');
    n.style.animationDelay=(Math.random()*0.06).toFixed(2)+'s';document.body.appendChild(n);setTimeout(()=>n.remove(),1700)}
  for(let k=0;k<14;k++){const a=Math.random()*Math.PI*2,dist=(r.width*.38)+(20+Math.random()*48),ring=Math.random()<.4;
    const d=document.createElement('span');d.className='bubble '+(ring?'ring':'dot');const sz=ring?(9+Math.random()*5):(4+Math.random()*5);
    d.style.width=d.style.height=sz.toFixed(1)+'px';d.style.left=cx+'px';d.style.top=cy+'px';
    d.style.setProperty('--tx',(Math.cos(a)*dist).toFixed(1)+'px');d.style.setProperty('--ty',(Math.sin(a)*dist).toFixed(1)+'px');
    d.style.setProperty('--d',(0.6+Math.random()*0.4).toFixed(2)+'s');d.style.animationDelay=(Math.random()*0.1).toFixed(2)+'s';document.body.appendChild(d);setTimeout(()=>d.remove(),1400)}
});
document.addEventListener('animationend',e=>{if(e.target.classList&&e.target.classList.contains('bounce'))e.target.classList.remove('bounce')});

/* Build the outline light for each search bar: a path fitted to the bar, resized with it. */
let srId=0;
function initSearchRings(){document.querySelectorAll('.search').forEach(el=>{if(el.querySelector('.sring'))return;const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('class','sring');svg.setAttribute('aria-hidden','true');const id='srg'+(++srId);const defs=document.createElementNS(ns,'defs');const lg=document.createElementNS(ns,'linearGradient');lg.setAttribute('id',id);lg.setAttribute('x1','0');lg.setAttribute('y1','0');lg.setAttribute('x2','1');lg.setAttribute('y2','1');[['0','#ff2fd0'],['0.5','#b04dff'],['1','#3b6cff']].forEach(([o,c])=>{const st=document.createElementNS(ns,'stop');st.setAttribute('offset',o);st.setAttribute('stop-color',c);lg.appendChild(st)});defs.appendChild(lg);const glow=document.createElementNS(ns,'rect'),head=document.createElementNS(ns,'rect');glow.setAttribute('class','sr-glow');head.setAttribute('class','sr-head');[glow,head].forEach(r=>{r.setAttribute('pathLength','100');r.setAttribute('stroke','url(#'+id+')')});const base=document.createElementNS(ns,'rect');base.setAttribute('class','sr-base');base.setAttribute('pathLength','100');const mid=document.createElementNS(ns,'rect');mid.setAttribute('class','sr-mid');mid.setAttribute('pathLength','100');svg.append(defs,base,glow,mid,head);el.appendChild(svg);const fit=()=>{const w=el.offsetWidth,h=el.offsetHeight;[base,glow,mid,head].forEach(r=>{r.setAttribute('x','.5');r.setAttribute('y','.5');r.setAttribute('width',Math.max(0,w-1));r.setAttribute('height',Math.max(0,h-1));r.setAttribute('rx',Math.max(0,(h-1)/2))})};fit();if(window.ResizeObserver)new ResizeObserver(fit).observe(el)})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initSearchRings);else initSearchRings();

/* Search frame: colour segments travel along the outline itself, so the speed is even around the curved ends. */
function initFrameRing(){document.querySelectorAll('.search').forEach(el=>{if(el.querySelector('.frame-ring'))return;const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('class','frame-ring');svg.setAttribute('aria-hidden','true');const N=12,P=100/N,pal=['#ff2fd0','#e03ad8','#c046e8','#a04dff','#8a4dff','#6a5cff','#4f7bff','#3b6cff','#4f7bff','#6a5cff','#a04dff','#e03ad8'];const rects=[];for(let i=0;i<N;i++){const r=document.createElementNS(ns,'rect');r.setAttribute('pathLength','100');r.setAttribute('fill','none');r.setAttribute('stroke',pal[i]);r.setAttribute('stroke-width','1.6');r.setAttribute('stroke-dasharray',P.toFixed(3)+' '+(100-P).toFixed(3));r.style.animationDelay='-'+((i*P/100)*3.6).toFixed(3)+'s';svg.appendChild(r);rects.push(r)}el.appendChild(svg);const fit=()=>{const w=el.offsetWidth,h=el.offsetHeight;rects.forEach(r=>{r.setAttribute('x','.8');r.setAttribute('y','.8');r.setAttribute('width',Math.max(0,w-1.6));r.setAttribute('height',Math.max(0,h-1.6));r.setAttribute('rx',Math.max(0,(h-1.6)/2))})};fit();if(window.ResizeObserver)new ResizeObserver(fit).observe(el)})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initFrameRing);else initFrameRing();

/* 3D horizontal carousel for the top songs, with 30-second previews. */

function cfRender(){const el=document.getElementById('homeTop');if(!el)return;if(typeof cardsG!=='undefined')cardsG.visible=false;const n=T.slice(0,Math.min(6,cfCount));if(!n.length){el.innerHTML='';return}cfIdx=Math.max(0,Math.min(cfIdx,n.length-1));el.innerHTML='<div class="cf" id="cf"><button class="cf-nav cf-prev" aria-label="Previous">‹</button><div class="cf-stage">'+n.map((t,i)=>{const src=trimmedSrc(t)||t.fallbackImg||'';return '<article class="cf-card" data-cf="'+i+'"><div class="cf-art">'+(src?'<img src="'+esc(src)+'" alt="">':'<span>'+esc((t.t||'?')[0])+'</span>')+'</div><div class="cf-info"><b>'+esc(t.t||'')+'</b><small>'+esc(t.a||'')+'</small></div><div class="cf-foot"><button class="cf-play" data-cfplay="'+i+'" aria-label="Preview 30 seconds"><span class="ic-play">▶</span><span class="ic-pause">❚❚</span></button><div class="cf-bar"><i></i></div><span class="cf-tag">Preview</span></div></article>'}).join('')+'</div><button class="cf-nav cf-next" aria-label="Next">›</button></div>';const cardsNow=[...el.querySelectorAll('.cf-card')];cardsNow.forEach(c=>c.style.transition='none');cfLayout();cfSync();requestAnimationFrame(()=>requestAnimationFrame(()=>cardsNow.forEach(c=>c.style.transition='')))}
function trimmedSrc(t){if(!t._imgEl)return null;if(t._sq)return t._sq;try{const cc=t._crop||(()=>{const iw=t._imgEl.naturalWidth||1280,ih=t._imgEl.naturalHeight||720,sq=Math.min(iw,ih);return{sx:(iw-sq)/2,sy:(ih-sq)/2,sq}})();const c=document.createElement('canvas');c.width=c.height=440;c.getContext('2d').drawImage(t._imgEl,cc.sx,cc.sy,cc.sq,cc.sq,0,0,440,440);t._sq=c.toDataURL('image/jpeg',.9);return t._sq}catch(e){return null}}
function cfLayout(){const N=document.querySelectorAll('#cf .cf-card').length||1;document.querySelectorAll('#cf .cf-card').forEach(c=>{const i=+c.dataset.cf;let d=i-cfIdx;if(d>N/2)d-=N;if(d<-N/2)d+=N;const a=Math.abs(d),x=d*250,z=-a*110,ry=-d*26,sc=1-.12*a,op=a>2?0:1-.3*a;c.style.transform='translate3d('+x+'px,0,'+z+'px) rotateY('+ry+'deg) scale('+sc+')';c.style.opacity=op;c.style.zIndex=String(10-a);c.style.filter=a?'blur('+(a*1.2).toFixed(1)+'px)':'none';c.classList.toggle('is-center',a===0);c.style.pointerEvents=a>1?'none':'auto'})}
function cfGo(i){const n=Math.min(cfCount,6);if(!n)return;cfIdx=((i%n)+n)%n;cfLayout()}
function cfPreview(i){const t=T[i];if(!t)return;if(cur===i&&playing){pause();clearTimeout(cfTimer);cfSync();return}pick(i);clearTimeout(cfTimer);cfTimer=setTimeout(()=>{if(cur===i&&playing){pause();cfSync()}},30000);cfSync()}
function cfSync(){document.querySelectorAll('#cf .cf-card').forEach(c=>{const i=+c.dataset.cf;c.classList.toggle('previewing',cur===i&&playing)})}
document.addEventListener('click',e=>{const pb=e.target.closest('[data-cfplay]');if(pb){e.stopPropagation();const i=+pb.dataset.cfplay;if(i!==cfIdx){cfGo(i)}else{cfPreview(i)}return}const cd=e.target.closest('[data-cf]');if(cd){const i=+cd.dataset.cf;if(i!==cfIdx){cfGo(i)}else{cfPreview(i)}return}if(e.target.closest('.cf-prev')){cfGo(cfIdx-1);return}if(e.target.closest('.cf-next')){cfGo(cfIdx+1);return}});
document.addEventListener('wheel',e=>{const cf=e.target.closest&&e.target.closest('#cf');if(!cf)return;const d=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY;if(Math.abs(d)<8)return;e.preventDefault();const now=performance.now();if(now-cfWheelT<420)return;cfWheelT=now;cfGo(cfIdx+(d>0?1:-1))},{passive:false});
document.addEventListener('pointerdown',e=>{const cf=e.target.closest&&e.target.closest('#cf');cfDragX=cf?e.clientX:null});
document.addEventListener('pointerup',e=>{if(cfDragX===null)return;const dx=e.clientX-cfDragX;cfDragX=null;if(Math.abs(dx)>50)cfGo(cfIdx+(dx<0?1:-1))});
addEventListener('keydown',e=>{if(view!=='home')return;if(e.key==='ArrowRight')cfGo(cfIdx+1);if(e.key==='ArrowLeft')cfGo(cfIdx-1)});
setInterval(()=>{if(document.getElementById('cf'))cfSync()},400);


/* Entrance: first load and page changes. */
(function(){document.body.classList.add('intro');setTimeout(()=>document.body.classList.remove('intro'),5000);const playPage=()=>{const c=document.getElementById('content');if(!c)return;c.classList.remove('page-in');void c.offsetWidth;c.classList.add('page-in');setTimeout(()=>c.classList.remove('page-in'),700)};addEventListener('hashchange',playPage)})();

/* Scroll reveal for the home heading, subtitle, and carousel. */
(function(){const els=[document.getElementById('homeTop')].concat([...document.querySelectorAll('#s3 h2,#s3 p')]).filter(Boolean);els.forEach(e=>e.classList.add('reveal'));if(!('IntersectionObserver' in window)){els.forEach(e=>e.classList.add('in'));return}const io=new IntersectionObserver(entries=>{entries.forEach(en=>{if(en.isIntersecting){en.target.classList.add('in');io.unobserve(en.target)}})},{threshold:.15});els.forEach(e=>io.observe(e))})();

/* Section slide-in: when a section opens, its sidebar, filter bar, and cards slide in one after another. */
(function(){const c=document.getElementById('content');if(!c)return;let last=null;const play=()=>{c.classList.remove('stagger');void c.offsetWidth;c.classList.add('stagger');c.querySelectorAll('.grid>*,.pl-grid>*,.genre-g>*,.row2').forEach((el,i)=>el.style.setProperty('--k',i));clearTimeout(c._st);c._st=setTimeout(()=>c.classList.remove('stagger'),1400)};const mo=new MutationObserver(()=>{if(typeof sec!=='undefined'&&sec!==last){last=sec;play()}});mo.observe(c,{childList:true});addEventListener('hashchange',()=>{last=null});const menu=document.getElementById('menu');if(menu)menu.addEventListener('animationend',()=>menu.classList.remove('stagger'))})();
/* Music assistant: chat about moods and genres, and play the songs it suggests. */
(function(){
  const history=[];
  const fab=document.createElement('button');fab.id='chatFab';fab.type='button';fab.setAttribute('aria-label','Open the music assistant');fab.innerHTML='<span class="cf-ic">✶</span><span class="cf-lbl">Ask</span>';document.body.appendChild(fab);
  const panel=document.createElement('section');panel.id='chatPanel';panel.setAttribute('aria-label','Music assistant');panel.innerHTML='<div class="ch-head"><div><b>Music assistant</b><small>Moods, genres, or any question</small></div><button class="ch-x" type="button" aria-label="Close">×</button></div><div class="ch-msgs" id="chatMsgs"></div><form class="ch-form" id="chatForm"><input id="chatIn" type="text" maxlength="600" placeholder="Ask for a mood, a genre, or anything…" autocomplete="off" aria-label="Message"><button type="submit" class="ch-send" aria-label="Send">↑</button></form>';document.body.appendChild(panel);
  const msgs=panel.querySelector('#chatMsgs'),form=panel.querySelector('#chatForm'),input=panel.querySelector('#chatIn');
  function addMsg(role,text){const d=document.createElement('div');d.className='ch-msg '+(role==='user'?'me':'bot');d.textContent=text;msgs.appendChild(d);msgs.scrollTop=msgs.scrollHeight;return d}
  function typeOut(el,text){const words=String(text||'').split(' ');let i=0;return new Promise(res=>{const t=setInterval(()=>{el.textContent+=(i?' ':'')+words[i];msgs.scrollTop=msgs.scrollHeight;i++;if(i>=words.length){clearInterval(t);res()}},45)})}
  function addSongs(list){if(!list||!list.length)return;const wrap=document.createElement('div');wrap.className='ch-songs';list.forEach(sg=>{const b=document.createElement('button');b.type='button';b.className='ch-song';b.innerHTML='<span class="ch-play">▶</span><span class="ch-st"><b></b><small></small></span>';b.querySelector('b').textContent=sg.title;b.querySelector('small').textContent=sg.artist||'';b.style.animationDelay=(list.indexOf(sg)*0.12)+'s';b.onclick=()=>playSuggestion(sg,b);wrap.appendChild(b)});msgs.appendChild(wrap);msgs.scrollTop=msgs.scrollHeight}
  async function playSuggestion(sg,btn){btn.classList.add('busy');try{const r=await fetch('/api/yt/audio?'+new URLSearchParams({title:sg.title,artist:sg.artist||''}));const j=await r.json();if(!j.videoId){toast('Could not find an official version of this song');return}playExternal({yt:j.videoId,t:sg.title,a:sg.artist||'',img:null});toast('Playing '+sg.title)}catch(e){toast('Could not play this song')}finally{btn.classList.remove('busy')}}
  function openChat(){panel.classList.add('open');fab.classList.add('hide');if(!msgs.childElementCount){addMsg('bot','Hi! Tell me your mood, a genre you like, or ask me anything. I can suggest songs you can play right here.')}setTimeout(()=>input.focus(),260)}
  function closeChat(){panel.classList.remove('open');fab.classList.remove('hide')}
  fab.onclick=openChat;panel.querySelector('.ch-x').onclick=closeChat;addEventListener('keydown',e=>{if(e.key==='Escape')closeChat()});
  form.addEventListener('submit',async e=>{e.preventDefault();const text=input.value.trim();if(!text)return;input.value='';addMsg('user',text);history.push({role:'user',content:text});const wait=addMsg('bot','');wait.classList.add('typing');wait.innerHTML='<span class="dots"><i></i><i></i><i></i></span>';
    try{const r=await fetch('/api/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:history.slice(-12)})});const j=await r.json().catch(()=>({}));wait.remove();if(!r.ok){addMsg('bot',j.error||'The assistant is unavailable right now.');history.pop();return}typeOut(addMsg('bot',''),j.reply||'Here are some songs for you.').then(()=>addSongs(j.songs));history.push({role:'assistant',content:j.reply||''})}
    catch(err){wait.remove();addMsg('bot','Could not reach the assistant. Please try again.');history.pop()}});
})();

/* Make sure the carousel area shows even if the scroll reveal has not seen it yet. */
setTimeout(()=>{const h=document.getElementById('homeTop');if(h)h.classList.add('in')},1500);

addEventListener('load',()=>slideSeg());slideSeg();
