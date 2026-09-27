'use strict';
/* =====================================================================
   UNIVERSO: la app. Sensores, música, controles y el cambio de escenas.
   El teléfono es una ventana: el giroscopio orienta la cámara dentro de
   una esfera mientras la nave avanza. La música son los archivos de
   audio del propio teléfono (no se sube nada a internet).
   ===================================================================== */

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

const DEF = { scene: 'hiper', auto: 0, speed: 1, streak: 1, count: 9000, fov: 62, nebula: 0.6, palette: 'hiper', heading: 'fixed',
              gyro: true, react: true, quality: 'alta', shuffle: false, keepSongs: true };
const cfg = Object.assign({}, DEF, store.get('universo.cfg', {}));
const saveCfg = () => store.set('universo.cfg', cfg);

// c: colores de las estrellas (principal, segundo, acento); mix: cortes del reparto; neb: colores de la nebulosa
const PALETTES = {
  hiper:   { name: 'Hiperespacio', c: [[0.30, 0.62, 1.00], [0.80, 0.90, 1.00], [1.00, 0.56, 0.20]], mix: [0.74, 0.87],
             neb: [[0.06, 0.20, 0.70], [0.30, 0.10, 0.55], [1.00, 0.45, 0.12]] },
  blanco:  { name: 'Clásico', c: [[0.85, 0.91, 1.00], [1.00, 1.00, 1.00], [1.00, 0.84, 0.66]], mix: [0.55, 0.88],
             neb: [[0.14, 0.16, 0.26], [0.12, 0.12, 0.18], [0.35, 0.28, 0.22]] },
  nebula:  { name: 'Nebulosa', c: [[0.66, 0.38, 1.00], [1.00, 0.45, 0.82], [0.35, 0.80, 1.00]], mix: [0.55, 0.80],
             neb: [[0.35, 0.06, 0.60], [0.70, 0.10, 0.45], [0.10, 0.35, 0.85]] },
  aurora:  { name: 'Aurora', c: [[0.25, 1.00, 0.72], [0.30, 0.72, 1.00], [0.80, 0.42, 1.00]], mix: [0.50, 0.80],
             neb: [[0.02, 0.35, 0.28], [0.05, 0.18, 0.55], [0.35, 0.12, 0.55]] },
  fuego:   { name: 'Fuego', c: [[1.00, 0.55, 0.16], [1.00, 0.86, 0.52], [1.00, 0.25, 0.14]], mix: [0.60, 0.85],
             neb: [[0.50, 0.12, 0.02], [0.40, 0.03, 0.06], [0.70, 0.38, 0.05]] },
  arcoiris:{ name: 'Arcoíris', rainbow: true, c: [[1, 1, 1], [1, 1, 1], [1, 1, 1]], mix: [0.5, 0.8],
             neb: [[0.10, 0.18, 0.60], [0.50, 0.08, 0.45], [0.05, 0.45, 0.35]] }
};
if (!PALETTES[cfg.palette]) cfg.palette = DEF.palette;

const SCENES = [Hiper, Solar, Sol, NebFuego, NebRosa, NebAzul, NebVerde, Alien, Galaxia];
if (!SCENES.some(s => s.id === cfg.scene)) cfg.scene = DEF.scene;
let currentScene = null;

/* ------------------------------------------------------------------ orientación */
const ori = { sensorQ: null, events: 0, yawOff: 0, manYaw: 0, manPitch: 0, q: [0, 0, 0, 1], needCenter: true };
const A = { level: 0, slow: 0, kick: 0 };
let started = false, turboOn = false, turbo = 0, scaleMul = 1, curDpr = 1, fovNow = cfg.fov, sceneSince = 0;
const perf = { acc: 0, n: 0 };
const gyroActive = () => started && cfg.gyro && !!ori.sensorQ;

function onOrient(e) {
  if (e.alpha == null && e.beta == null && e.gamma == null) return;
  ori.events++;
  ori.sensorQ = sensorQuat(e.alpha || 0, e.beta || 0, e.gamma || 0, screenAngle());
}

// girar la vista para que el frente quede hacia adelante de la nave (solo en horizontal)
function recenter() {
  const front = currentScene && currentScene.free ? mot.T : [0, 0, -1];
  const ty = yawOf(front);
  if (gyroActive()) {
    ori.yawOff = ty - yawOf(qrot(ori.sensorQ, [0, 0, -1])); ori.manYaw = 0;
  } else {
    ori.manYaw = ty; ori.manPitch = Math.asin(clamp(front[1], -1, 1));
  }
  ori.needCenter = false;
}
function targetQuat() {
  if (gyroActive()) {
    if (ori.needCenter) recenter();
    return qmul(qaxis([0, 1, 0], ori.yawOff + ori.manYaw), ori.sensorQ);
  }
  if (ori.needCenter) recenter();
  return qmul(qaxis([0, 1, 0], ori.manYaw), qaxis([1, 0, 0], ori.manPitch));
}

function updateAudio(dt) {
  let bass = 0;
  if (player.an && !audio.paused) {
    player.an.getByteFrequencyData(player.fd);
    for (let i = 1; i <= 6; i++) bass += player.fd[i];      // ~40-260 Hz
    bass /= 6 * 255;
  }
  A.level += (bass - A.level) * ease(dt, 10);
  A.slow += (bass - A.slow) * ease(dt, 0.8);
  A.kick = Math.max(Math.max(0, bass - A.slow * 1.05) * 2.8, A.kick * Math.exp(-dt * 5));
}

/* ------------------------------------------------------------------ escenas */
function setScene(id, instant) {
  const next = SCENES.find(s => s.id === id) || SCENES[0];
  if (next === currentScene) return;
  const go = () => {
    if (currentScene && currentScene.exit) currentScene.exit();
    currentScene = next; cfg.scene = next.id; saveCfg();
    if (!next._gpu) { if (next.gpu) next.gpu(); next._gpu = true; }
    if (next.enter) next.enter();
    ori.needCenter = true; sceneSince = performance.now();
    markScenes();
    if (started) caption(next.name, next.sub);
  };
  if (instant) { go(); return; }
  const f = $('#fade'); f.classList.add('on');
  setTimeout(() => { try { go(); } finally { setTimeout(() => f.classList.remove('on'), 60); } }, 450);
}
function nextScene() { const i = SCENES.indexOf(currentScene); setScene(SCENES[(i + 1) % SCENES.length].id); }

/* ------------------------------------------------------------------ cuadro a cuadro */
const S = { cfg, fwd: [0, 0, -1] };
const VOLQ = { alta: 0.34, media: 0.4, baja: 0.45 };   // resolución de los volúmenes respecto al lienzo

function resize() {
  const cap = cfg.quality === 'alta' ? 2 : cfg.quality === 'media' ? 1.5 : 1;
  curDpr = Math.min(window.devicePixelRatio || 1, cap) * scaleMul;
  const w = Math.max(1, Math.round(canvas.clientWidth * curDpr)), h = Math.max(1, Math.round(canvas.clientHeight * curDpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}

let last = performance.now(), glLost = false;
function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000, dt = Math.min(0.05, Math.max(0, raw)); last = now;
  if (glLost || !currentScene) return;
  // si el teléfono no da abasto, baja la resolución poco a poco (nunca la sube sola)
  if (started && raw < 0.2) { perf.acc += raw; perf.n++;
    if (perf.acc > 2.5) { if (perf.acc / perf.n > 1 / 40 && scaleMul > 0.55) scaleMul -= 0.15; perf.acc = 0; perf.n = 0; } }
  if (started && cfg.auto > 0 && now - sceneSince > cfg.auto * 60000) { sceneSince = now; nextScene(); }
  resize();
  updateAudio(dt);
  turbo += ((turboOn ? 1 : 0) - turbo) * ease(dt, turboOn ? 1.4 : 2.2);
  const react = cfg.react ? 1 : 0;
  Object.assign(S, {
    dt, time: now / 1000, W: canvas.width, H: canvas.height, dpr: curDpr, volScale: VOLQ[cfg.quality] || 0.4, started, turbo,
    level: A.level * react, kick: A.kick * react, bright: 1 + react * A.kick * 0.7,
    throttle: cfg.speed * (1 + 4.5 * turbo) * (1 + react * (A.level * 0.35 + A.kick * 1.6))
  });
  const sc = currentScene;
  sc.update(S);
  if (!started && !gyroActive()) ori.manYaw += dt * 0.02;          // en la portada la vista deriva sola
  ori.q = qslerp(ori.q, targetQuat(), ease(dt, gyroActive() ? 28 : 14));
  S.q = sc.ship ? qmul(sc.ship, ori.q) : ori.q;
  S.cam = qmat3(S.q); S.view = transpose3(S.cam); S.fwd = qrot(S.q, [0, 0, -1]);
  fovNow = cfg.fov + turbo * (sc.fovTurbo || 10) + A.kick * react * 4;
  S.P = projection(fovNow, S.W / S.H);
  gl.viewport(0, 0, S.W, S.H);
  sc.render(S);
}

/* ------------------------------------------------------------------ música */
const audio = new Audio();
audio.preload = 'auto';
const player = { list: [], idx: -1, url: null, ctx: null, an: null, fd: null, errors: 0 };

const DB = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      const r = indexedDB.open('universo', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('songs', { keyPath: 'id', autoIncrement: true });
      r.onsuccess = () => { this.db = r.result; res(this.db); };
      r.onerror = () => rej(r.error);
    });
  },
  async run(mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const t = db.transaction('songs', mode), req = fn(t.objectStore('songs'));
      t.oncomplete = () => res(req && req.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  },
  add(rec) { return this.run('readwrite', s => s.add(rec)); },
  all() { return this.run('readonly', s => s.getAll()); },
  del(id) { return this.run('readwrite', s => s.delete(id)); },
  clear() { return this.run('readwrite', s => s.clear()); }
};

const cleanName = n => n.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim() || 'Canción';
const isAudio = f => (f.type && f.type.startsWith('audio/')) || /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|weba)$/i.test(f.name);

function ensureAudioGraph() {
  // iPhone: que suene aunque el interruptor de silencio esté puesto (como un reproductor de música)
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
  if (player.ctx) { if (player.ctx.state === 'suspended') player.ctx.resume().catch(() => {}); return; }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC(), src = ctx.createMediaElementSource(audio), an = ctx.createAnalyser();
    an.fftSize = 1024; an.smoothingTimeConstant = 0.5;
    src.connect(an); an.connect(ctx.destination);
    Object.assign(player, { ctx, an, fd: new Uint8Array(an.frequencyBinCount) });
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  } catch (e) { /* sin análisis: la música suena igual, solo no hace latir las estrellas */ }
}

function playIdx(i) {
  const L = player.list;
  if (!L.length) { setSongUI(); return; }
  player.idx = ((i % L.length) + L.length) % L.length;
  const it = L[player.idx];
  if (player.url) URL.revokeObjectURL(player.url);
  player.url = URL.createObjectURL(it.blob);
  audio.src = player.url;
  const p = audio.play(); if (p && p.catch) p.catch(() => {});
  setSongUI(); setMediaMeta(it);
}
function nextIdx(dir) {
  const n = player.list.length;
  if (cfg.shuffle && n > 2 && dir > 0) { let j; do { j = Math.floor(Math.random() * n); } while (j === player.idx); return j; }
  return player.idx + dir;
}
function togglePlay() {
  ensureAudioGraph();
  if (!player.list.length) { pickFiles(); return; }
  if (player.idx < 0) { playIdx(cfg.shuffle ? Math.floor(Math.random() * player.list.length) : 0); return; }
  if (audio.paused) { const p = audio.play(); if (p && p.catch) p.catch(() => {}); } else audio.pause();
}

audio.addEventListener('ended', () => playIdx(nextIdx(1)));
audio.addEventListener('playing', () => { player.errors = 0; setPlayIcon(); });
audio.addEventListener('pause', setPlayIcon);
audio.addEventListener('timeupdate', updateTime);
audio.addEventListener('error', () => {
  if (!audio.src || !player.list.length) return;
  const it = player.list[player.idx];
  toast('No se pudo reproducir ' + (it ? it.name : 'la canción'));
  if (++player.errors < player.list.length) setTimeout(() => playIdx(nextIdx(1)), 900);
});

function setMediaMeta(it) {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title: it.name, artist: 'Universo',
      artwork: [{ src: 'icon-512.png', sizes: '512x512', type: 'image/png' }] });
  } catch (e) {}
}
if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession, h = (a, f) => { try { ms.setActionHandler(a, f); } catch (e) {} };
  h('play', () => audio.play()); h('pause', () => audio.pause());
  h('previoustrack', () => playIdx(player.idx - 1)); h('nexttrack', () => playIdx(nextIdx(1)));
}

async function addFiles(files) {
  const fresh = files.filter(isAudio);
  if (!fresh.length) { if (files.length) toast('Esos archivos no son de audio'); return; }
  const first = player.list.length;
  let saved = cfg.keepSongs;
  for (const f of fresh) {
    const it = { id: null, name: cleanName(f.name), blob: f };
    if (saved) {
      try { it.id = await DB.add({ name: it.name, blob: f, added: Date.now() }); }
      catch (e) { saved = false; toast('No hay espacio para guardarlas: sonarán solo esta vez'); }
    }
    player.list.push(it);
  }
  if (saved && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  renderSongs(); setIntroNote();
  toast(fresh.length === 1 ? 'Añadida: ' + fresh[0].name : fresh.length + ' canciones añadidas');
  if (started && (player.idx < 0 || audio.paused)) { ensureAudioGraph(); playIdx(first); }
}

async function removeSong(i) {
  const it = player.list[i]; if (!it) return;
  if (it.id != null) { try { await DB.del(it.id); } catch (e) {} }
  const wasCurrent = i === player.idx;
  player.list.splice(i, 1);
  if (i < player.idx) player.idx--;
  if (wasCurrent) {
    if (player.list.length && !audio.paused) playIdx(player.idx);
    else { audio.pause(); audio.removeAttribute('src'); audio.load(); player.idx = player.list.length ? Math.min(player.idx, player.list.length - 1) : -1; }
  }
  renderSongs(); setSongUI(); setIntroNote();
}

async function clearSongs() {
  if (!player.list.length) return;
  if (!confirm('¿Quitar todas las canciones de la app? Los archivos de tu teléfono no se tocan.')) return;
  try { await DB.clear(); } catch (e) {}
  audio.pause(); audio.removeAttribute('src'); audio.load();
  player.list = []; player.idx = -1;
  renderSongs(); setSongUI(); setIntroNote();
}

/* ------------------------------------------------------------------ interfaz */
const hud = $('#hud'), sheet = $('#sheet'), dest = $('#dest'), intro = $('#intro'), fileIn = $('#file');
let hudTimer = 0, toastTimer = 0, capTimer = 0;
const sheetOpen = () => !sheet.classList.contains('off') || !dest.classList.contains('off');

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('off');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('off'), 2400);
}
// letrero de documental: nombre del lugar al llegar
function caption(title, sub) {
  const c = $('#cap'); c.querySelector('b').textContent = title; c.querySelector('span').textContent = sub || '';
  c.classList.remove('off'); clearTimeout(capTimer); capTimer = setTimeout(() => c.classList.add('off'), 4800);
}
function showHud() {
  if (!started) return;
  hud.classList.remove('off'); clearTimeout(hudTimer);
  hudTimer = setTimeout(() => { if (!sheetOpen()) hud.classList.add('off'); }, 4500);
}
function hideHud() { clearTimeout(hudTimer); hud.classList.add('off'); }
const hideCaption = () => { clearTimeout(capTimer); $('#cap').classList.add('off'); };
const openSheet = () => { hideCaption(); dest.classList.add('off'); syncSettings(); renderSongs(); sheet.classList.remove('off'); clearTimeout(hudTimer); };
const openDest = () => { hideCaption(); sheet.classList.add('off'); markScenes(); dest.classList.remove('off'); clearTimeout(hudTimer); };
const closeSheets = () => { sheet.classList.add('off'); dest.classList.add('off'); showHud(); };

function fmt(s) { if (!isFinite(s)) return '0:00'; s = Math.floor(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
let seeking = false;
function updateTime() {
  const d = audio.duration;
  $('#time').textContent = player.idx >= 0 && isFinite(d) ? fmt(audio.currentTime) + ' / ' + fmt(d) : '';
  if (!seeking) $('#seek').value = isFinite(d) && d > 0 ? Math.round(audio.currentTime / d * 1000) : 0;
}
function setPlayIcon() {
  $('#playIco').innerHTML = audio.paused ? '<path d="M8 5l12 7-12 7z" fill="currentColor"/>'
    : '<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" stroke="none"/>';
  $('#bPlay').setAttribute('aria-label', audio.paused ? 'Reproducir' : 'Pausar');
}
function setSongUI() {
  const it = player.list[player.idx];
  $('#song').textContent = it ? it.name : (player.list.length ? player.list.length + ' canciones listas' : 'Sin música: toca el botón de la nota');
  $('#bShuf').classList.toggle('on', cfg.shuffle);
  setPlayIcon(); updateTime();
  document.querySelectorAll('#songs li').forEach((li, i) => li.classList.toggle('now', i === player.idx));
}
function setIntroNote() {
  const n = player.list.length;
  $('#introSongs').textContent = n ? (n === 1 ? '1 canción lista: sonará al despegar' : n + ' canciones listas: sonarán al despegar') : 'Sin música por ahora (puedes añadirla luego)';
}
function renderSongs() {
  const ol = $('#songs'); ol.textContent = '';
  player.list.forEach((it, i) => {
    const li = document.createElement('li'); if (i === player.idx) li.className = 'now';
    const sp = document.createElement('span'); sp.textContent = it.name;
    sp.addEventListener('click', () => { ensureAudioGraph(); playIdx(i); });
    const del = document.createElement('button'); del.className = 'ico'; del.setAttribute('aria-label', 'Quitar ' + it.name);
    del.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    del.addEventListener('click', () => removeSong(i));
    li.append(sp, del); ol.append(li);
  });
}

// tarjetas de destino (en la portada y en el panel de destinos)
function buildSceneCards(box, onPick) {
  SCENES.forEach(sc => {
    const b = document.createElement('button'); b.className = 'scard'; b.dataset.id = sc.id;
    b.innerHTML = `<i class="th th-${sc.id}" style="background-image:url(thumbs/${sc.id}.jpg)"></i><b></b><span></span>`;
    b.querySelector('b').textContent = sc.name; b.querySelector('span').textContent = sc.sub;
    b.addEventListener('click', () => onPick(sc.id));
    box.append(b);
  });
}
function markScenes() {
  document.querySelectorAll('.scard').forEach(b => b.classList.toggle('on', currentScene && b.dataset.id === currentScene.id));
}

function pickFiles() { fileIn.click(); }
fileIn.addEventListener('change', () => { const f = Array.from(fileIn.files || []); fileIn.value = ''; addFiles(f); });

// ajustes <-> controles
const FMT = { speed: v => v.toFixed(2) + '×', streak: v => v.toFixed(2) + '×', count: v => v.toLocaleString('es'), fov: v => v + '°',
              nebula: v => v < 0.01 ? 'negro puro' : Math.round(v * 100) + ' %' };
function syncSettings() {
  document.querySelectorAll('[data-k]').forEach(el => {
    const k = el.dataset.k;
    if (el.type === 'range') el.value = cfg[k];
    else if (el.type === 'checkbox') el.checked = !!cfg[k];
    else el.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === String(cfg[k])));
  });
  document.querySelectorAll('[data-o]').forEach(o => { o.textContent = FMT[o.dataset.o](cfg[o.dataset.o]); });
  document.querySelectorAll('#pal .chip').forEach(c => c.classList.toggle('on', c.dataset.v === cfg.palette));
}
let countTimer = 0;
function applySetting(k, v) {
  const prev = cfg[k]; cfg[k] = v; saveCfg(); syncSettings();
  if (k === 'count') { clearTimeout(countTimer); countTimer = setTimeout(() => Stars.build(cfg.count), 150); }
  if (k === 'quality' && prev !== v) scaleMul = 1;
  if (k === 'gyro') { ori.needCenter = true; if (!v) { ori.manYaw = yawOf(qrot(ori.q, [0, 0, -1])); ori.manPitch = 0; } }
  if (k === 'auto') sceneSince = performance.now();
}
document.querySelectorAll('[data-k]').forEach(el => {
  const k = el.dataset.k;
  if (el.type === 'range') el.addEventListener('input', () => applySetting(k, parseFloat(el.value)));
  else if (el.type === 'checkbox') el.addEventListener('change', () => applySetting(k, el.checked));
  else el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    const v = b.dataset.v; applySetting(k, typeof DEF[k] === 'number' ? parseFloat(v) : v);
  }));
});
for (const [key, p] of Object.entries(PALETTES)) {
  const b = document.createElement('button'); b.className = 'chip'; b.dataset.v = key;
  const col = c => `rgb(${c.map(x => Math.round(x * 255)).join(',')})`;
  const grad = p.rainbow ? 'linear-gradient(90deg,#f55,#fd5,#5f8,#5cf,#a6f)' : `linear-gradient(90deg,${col(p.c[0])},${col(p.c[1])},${col(p.c[2])})`;
  b.innerHTML = `<i style="background:${grad}"></i>`; b.append(p.name);
  b.addEventListener('click', () => applySetting('palette', key));
  $('#pal').append(b);
}

// pantalla completa, pantalla siempre encendida y orientación fija
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
const standalone = () => matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone;
function lockOrientation() {
  try { const o = screen.orientation; if (o && o.lock) o.lock(o.type).catch(() => {}); } catch (e) {}
}
function enterFs() {
  const el = document.documentElement, f = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!f || fsEl()) { lockOrientation(); return; }
  try { const p = f.call(el, { navigationUI: 'hide' }); if (p && p.then) p.then(lockOrientation, () => {}); else lockOrientation(); } catch (e) {}
}
function toggleFs() {
  if (fsEl()) { const x = document.exitFullscreen || document.webkitExitFullscreen; if (x) x.call(document); } else enterFs();
}
let wake = null;
async function keepAwake() {
  try { if ('wakeLock' in navigator && document.visibilityState === 'visible' && !wake) {
    wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch (e) {}
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && started) keepAwake(); });
if (!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen)) $('#bFs').style.display = 'none';

async function askMotion() {
  const DOE = window.DeviceOrientationEvent;
  if (DOE && typeof DOE.requestPermission === 'function') {       // iPhone: hay que pedir permiso con un toque
    try { return (await DOE.requestPermission()) === 'granted'; } catch (e) { return false; }
  }
  return !!DOE;
}

async function launch() {
  // todo lo que exige "un toque del usuario" va primero, antes de esperar nada
  if (!standalone()) enterFs();
  ensureAudioGraph();
  if (player.list.length && player.idx < 0) playIdx(cfg.shuffle ? Math.floor(Math.random() * player.list.length) : 0);
  const motionOk = askMotion();
  started = true; ori.needCenter = true; sceneSince = performance.now();
  intro.classList.add('off');
  keepAwake(); setSongUI(); showHud();
  if (currentScene) caption(currentScene.name, currentScene.sub);
  if (await motionOk) {
    window.addEventListener('deviceorientation', onOrient);
    setTimeout(() => {
      if (!ori.events) toast('No llegó señal del giroscopio: arrastra con el dedo para mirar');
      else if (!cfg.gyro) toast('Giroscopio apagado en ajustes: arrastra para mirar');
    }, 1800);
  } else toast('Sin permiso de movimiento: arrastra con el dedo para mirar');
}

$('#go').addEventListener('click', launch);
$('#pickIntro').addEventListener('click', pickFiles);
$('#bAdd').addEventListener('click', () => { pickFiles(); showHud(); });
$('#bAdd2').addEventListener('click', pickFiles);
$('#bClear').addEventListener('click', clearSongs);
$('#bPlay').addEventListener('click', () => { togglePlay(); showHud(); });
$('#bPrev').addEventListener('click', () => { ensureAudioGraph(); if (audio.currentTime > 4) audio.currentTime = 0; else playIdx(player.idx - 1); showHud(); });
$('#bNext').addEventListener('click', () => { ensureAudioGraph(); playIdx(nextIdx(1)); showHud(); });
$('#bShuf').addEventListener('click', () => { cfg.shuffle = !cfg.shuffle; saveCfg(); setSongUI(); toast(cfg.shuffle ? 'Orden aleatorio' : 'En orden'); showHud(); });
$('#bCfg').addEventListener('click', openSheet);
$('#bDest').addEventListener('click', openDest);
document.querySelectorAll('.bClose').forEach(b => b.addEventListener('click', closeSheets));
$('#bFs').addEventListener('click', () => { toggleFs(); showHud(); });
$('#bCenter').addEventListener('click', () => { recenter(); toast('Mirando al frente'); showHud(); });
$('#bReset').addEventListener('click', () => {
  const keep = { shuffle: cfg.shuffle, keepSongs: cfg.keepSongs, scene: cfg.scene };
  Object.assign(cfg, DEF, keep); saveCfg(); syncSettings(); Stars.build(cfg.count); scaleMul = 1; toast('Ajustes restablecidos');
});
const seekEl = $('#seek');
seekEl.addEventListener('input', () => { seeking = true; const d = audio.duration; if (isFinite(d)) audio.currentTime = seekEl.value / 1000 * d; showHud(); });
seekEl.addEventListener('change', () => { seeking = false; });
hud.addEventListener('pointerdown', () => showHud());
buildSceneCards($('#introScenes'), id => setScene(id));
buildSceneCards($('#destList'), id => { setScene(id); closeSheets(); });

// gestos sobre el espacio: toque = controles, doble toque = al frente, mantener = velocidad luz, arrastrar = mirar
let g = null, lastTap = 0, tapTimer = 0;
canvas.addEventListener('pointerdown', e => {
  if (!started || g) return;
  if (sheetOpen()) { closeSheets(); return; }
  try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
  g = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, t: performance.now(), moved: false, turbo: false };
  g.timer = setTimeout(() => { if (g && !g.moved) { g.turbo = true; turboOn = true; hideHud(); } }, 320);
});
canvas.addEventListener('pointermove', e => {
  if (!g || e.pointerId !== g.id) return;
  const dx = e.clientX - g.lx, dy = e.clientY - g.ly; g.lx = e.clientX; g.ly = e.clientY;
  if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) > 10) g.moved = true;
  if (!g.moved) return;
  const k = 2 * Math.atan(Math.tan(fovNow * D2R / 2)) / Math.min(canvas.clientWidth, canvas.clientHeight);
  ori.manYaw += dx * k;
  if (!gyroActive()) ori.manPitch = clamp(ori.manPitch + dy * k, -1.45, 1.45);
});
function endPointer(e) {
  if (!g || e.pointerId !== g.id) return;
  clearTimeout(g.timer);
  const tap = !g.moved && !g.turbo && performance.now() - g.t < 320;
  if (g.turbo) turboOn = false;
  g = null;
  if (!tap) return;
  const now = performance.now();
  if (now - lastTap < 300) { clearTimeout(tapTimer); lastTap = 0; recenter(); toast('Mirando al frente'); }
  else { lastTap = now; tapTimer = setTimeout(() => { hud.classList.contains('off') ? showHud() : hideHud(); }, 300); }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('contextmenu', e => e.preventDefault());

/* ------------------------------------------------------------------ arranque */
function gpuAll() {
  gpuCore();
  Stars.build(cfg.count);
  [NEB_PROGS, GAL_PROGS, PLANET_PROGS].forEach(o => { for (const k in o) delete o[k]; });
  delete G.tsky;
  SCENES.forEach(s => { s._gpu = false; });
  if (currentScene) { const sc = currentScene; currentScene = null; setScene(sc.id, true); }
}
if (!gl) { $('#fatal').style.display = 'grid'; intro.classList.add('off'); }
else {
  try { gpuAll(); setScene(cfg.scene, true); }
  catch (e) { $('#fatal').textContent = 'Error de gráficos: ' + e.message; $('#fatal').style.display = 'grid'; }
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); glLost = true; });
  canvas.addEventListener('webglcontextrestored', () => { try { gpuAll(); glLost = false; } catch (e) {} });
  requestAnimationFrame(t => { last = t; frame(t); });
}
syncSettings(); setSongUI(); setIntroNote();
DB.all().then(recs => {
  if (!recs || !recs.length) return;
  player.list = recs.map(r => ({ id: r.id, name: r.name, blob: r.blob })).concat(player.list);
  renderSongs(); setSongUI(); setIntroNote();
}).catch(() => {});

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
