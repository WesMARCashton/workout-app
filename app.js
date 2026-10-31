'use strict';

// ---- Default routine (used once to seed; editable in app) ----
const DEFAULT_EX = [
  { id: 'bicep_curl', name: 'Bicep curl', note: 'Dumbbell', w: true, g: 'Curls' },
  { id: 'squat_bw', name: 'Squat', note: 'Bodyweight', g: 'Squats' },
  { id: 'calf_db', name: 'Standing calf raise', note: 'Dumbbell', w: true, g: 'Calf raises' },
  { id: 'shrug', name: 'Shoulder shrug', note: 'Dumbbell', w: true },
  { id: 'band_pull', name: 'Band pull aparts', note: 'Band' },
  { id: 'row', name: 'Bent over row', w: true },
  { id: 'bicycle', name: 'Bicycle crunch', g: 'Abs' },
  { id: 'sumo', name: 'Sumo squat', note: 'Dumbbell', w: true, g: 'Squats' },
  { id: 'pushup_knee', name: 'Kneeling pushup' },
  { id: 'russian', name: 'Russian twist', note: 'Dumbbell', w: true, g: 'Abs' },
  { id: 'plank', name: 'Plank', timed: true },
  { id: 'hammer', name: 'Hammer curl', note: 'Dumbbell', w: true, g: 'Curls' },
  { id: 'squat_db', name: 'Squat', note: 'Dumbbell', w: true, g: 'Squats' },
  { id: 'calf_bw', name: 'Standing calf raise', note: 'Bodyweight', g: 'Calf raises' },
  { id: 'tricep', name: 'Tricep extension', note: 'Dumbbell', w: true },
  { id: 'heel_taps', name: 'Heel taps', g: 'Abs' },
  { id: 'band_walk', name: 'Lateral band walks', note: 'Band' },
  { id: 'situp', name: 'Sit up', g: 'Abs' },
  { id: 'legover', name: 'Dumbbell leg-overs', note: 'Legs together, side to side', g: 'Abs' },
  { id: 'straddle', name: 'Dumbbell straddle-ins', note: 'Legs wide, meet over dumbbell', g: 'Abs' },
];

// ---- Storage + migration ----
const KEY = 'workout_v1';
let db = null;
try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) { db = null; }
if (!db || !Array.isArray(db.sessions)) db = { sessions: [], active: null, unit: 'lb' };
if (!Array.isArray(db.exercises)) db.exercises = DEFAULT_EX.map(e => ({ ...e }));
if (db.rest == null) db.rest = 60;
if (db.active) {
  if (!db.active.entries || typeof db.active.entries !== 'object') db.active.entries = {};
  if (!db.active.pbs) db.active.pbs = {};
  if (db.active.plankStart) { db.active.timer = { id: 'plank', start: db.active.plankStart }; }
  delete db.active.plankStart;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (e) { toast('Could not save. Storage blocked.'); }
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

// ---- Exercise list (rebuilt whenever it changes) ----
let EX = [], EXM = {}, DUP = new Set();
function refreshEx() {
  EXM = Object.fromEntries(db.exercises.map(e => [e.id, e]));
  EX = db.exercises.filter(e => !e.hidden);
  DUP = new Set(EX.map(e => e.name).filter((n, i, a) => a.indexOf(n) !== i));
}
refreshEx();
const label = ex => ex ? (DUP.has(ex.name) && ex.note ? `${ex.name} (${ex.note.toLowerCase()})` : ex.name) : 'Removed exercise';
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---- State ----
const $ = s => document.querySelector(s);
let view = db.active ? 'workout' : 'home';
let range = 'today';
let tick = null;
let summary = null;
let exView = null;   // exercise id for chart view
let editId = null;   // exercise id being edited ('new' for add)

// ---- Helpers ----
function fmtT(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
}
const dayKey = ms => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
const val = (e, ex) => ex && ex.timed ? (e.secs || 0) : (e.reps || 0);
const show = (ex, v) => ex && ex.timed ? fmtT(v) : v;
const vibe = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };
const shortDate = ms => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function bests(id) {
  const ex = EXM[id]; let r = 0, w = 0;
  for (const s of db.sessions) {
    const e = s.entries[id]; if (!e) continue;
    r = Math.max(r, val(e, ex)); w = Math.max(w, +e.weight || 0);
  }
  return { r, w };
}
function lastEntry(id) {
  for (let i = db.sessions.length - 1; i >= 0; i--) {
    const e = db.sessions[i].entries[id]; if (e) return e;
  }
  return null;
}
function history(id) {
  return db.sessions.filter(s => s.entries[id]).map(s => ({ t: s.start, e: s.entries[id] }));
}
function fastest() {
  let f = 0;
  for (const s of db.sessions) {
    if (EX.length && EX.every(ex => s.entries[ex.id])) {
      const d = s.end - s.start; if (!f || d < f) f = d;
    }
  }
  return f;
}
function rangeStart(r) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  if (r === 'today') return d.getTime();
  if (r === 'week') { d.setDate(d.getDate() - 6); return d.getTime(); }
  return 0;
}
const gkey = ex => ex.timed ? ex.id : (ex.g || ex.id);
function totals(r) {
  const from = rangeStart(r), t = {};
  const add = entries => {
    for (const id in entries) {
      const ex = EXM[id]; if (!ex) continue;
      const k = gkey(ex); t[k] = (t[k] || 0) + val(entries[id], ex);
    }
  };
  for (const s of db.sessions) if (s.start >= from) add(s.entries);
  if (db.active && db.active.start >= from) add(db.active.entries);
  return t;
}
function groupKeys() {
  const seen = new Set(), out = [];
  for (const ex of EX) {
    const k = gkey(ex);
    if (seen.has(k)) continue; seen.add(k);
    out.push([k, ex.g && !ex.timed ? ex.g : label(ex), !!ex.timed]);
  }
  return out;
}
function streak() {
  const days = new Set(db.sessions.map(s => dayKey(s.start)));
  const d = new Date(); let n = 0;
  if (!days.has(dayKey(d.getTime()))) d.setDate(d.getDate() - 1);
  while (days.has(dayKey(d.getTime()))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

// ---- Feedback ----
let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2200);
}
let pbT;
function celebrate(name, msg) {
  $('#pbName').textContent = name; $('#pbMsg').innerHTML = msg;
  const o = $('#pb'); o.hidden = false; vibe([80, 60, 80, 60, 160]);
  clearTimeout(pbT); pbT = setTimeout(() => { o.hidden = true; }, 2600);
}
$('#pb').addEventListener('click', () => { $('#pb').hidden = true; });

// ---- Screen wake lock during workout ----
let wl = null;
async function keepAwake(on) {
  try {
    if (on && !wl && 'wakeLock' in navigator) {
      wl = await navigator.wakeLock.request('screen');
      wl.addEventListener('release', () => { wl = null; });
    } else if (!on && wl) { await wl.release(); wl = null; }
  } catch (e) {}
}

// ---- Render ----
function render() {
  clearInterval(tick);
  const app = $('#app');
  try {
    let html;
    if (view === 'workout' && db.active) html = workoutHTML();
    else if (view === 'summary' && summary) html = summaryHTML();
    else if (view === 'ex' && exView && EXM[exView]) html = exHTML(exView);
    else if (view === 'manage') html = manageHTML();
    else if (view === 'edit') html = editHTML();
    else { view = 'home'; html = homeHTML(); }
    app.innerHTML = html;
    keepAwake(view === 'workout');
    if (db.active) startTick();
  } catch (err) {
    app.innerHTML = recoverHTML(err);
  }
}
function go(v) { view = v; render(); window.scrollTo(0, 0); }

function recoverHTML(err) {
  return `<section class="sum">
    <h1>Something broke.</h1>
    <p class="muted">Error: ${esc(err && err.message || err)}</p>
    <p class="muted">Your history is still saved. Try these in order.</p>
    <button class="big" data-act="export">1. Export backup</button>
    <button class="big" data-act="fixActive">2. Close current workout</button>
    <button class="big" data-act="reload">3. Reload app</button>
  </section>`;
}

function startTick() {
  const update = () => {
    const a = db.active; if (!a) return;
    const el = $('#elapsed'); if (el) el.textContent = fmtT((Date.now() - a.start) / 1000);
    // Exercise stopwatch
    const tc = $('#timerClock');
    if (tc && a.timer) {
      const s = (Date.now() - a.timer.start) / 1000;
      tc.textContent = fmtT(s);
      const b = bests(a.timer.id).r;
      if (b && s > b && !tc.classList.contains('beat')) {
        tc.classList.add('beat'); vibe([80, 50, 80]); toast('Past your PB. Keep going.');
      }
    }
    // Rest countdown
    const rb = $('#rest');
    if (a.restEnd) {
      const left = (a.restEnd - Date.now()) / 1000;
      if (left <= 0) {
        a.restEnd = null; save(); vibe([250, 120, 250]); toast('Rest over. Go.');
        if (rb) rb.hidden = true;
      } else if (rb) {
        rb.hidden = false; $('#restClock').textContent = fmtT(Math.ceil(left));
      }
    } else if (rb) rb.hidden = true;
  };
  update();
  tick = setInterval(update, 250);
}

// ---- Charts (plain SVG, no library) ----
function lineChart(points, opts) {
  if (!points.length) return '';
  const W = 340, H = 150, P = { l: 34, r: 10, t: 12, b: 22 };
  const ys = points.map(p => p.y);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (lo === hi) { lo = Math.max(0, lo - 1); hi = hi + 1; }
  const pad = (hi - lo) * 0.1; lo = Math.max(0, lo - pad); hi = hi + pad;
  const n = points.length;
  const x = i => P.l + (n === 1 ? (W - P.l - P.r) / 2 : i * (W - P.l - P.r) / (n - 1));
  const y = v => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
  const fmt = opts.fmt || (v => Math.round(v));
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join('');
  const area = n > 1 ? `${path}L${x(n - 1).toFixed(1)},${H - P.b}L${x(0).toFixed(1)},${H - P.b}Z` : '';
  const ticks = [lo, (lo + hi) / 2, hi];
  const maxI = ys.indexOf(Math.max(...ys));
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.title)}">
    ${ticks.map(t => `<line x1="${P.l}" x2="${W - P.r}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${P.l - 6}" y="${y(t) + 4}" text-anchor="end">${fmt(t)}</text>`).join('')}
    ${area ? `<path d="${area}" class="area"/>` : ''}
    <path d="${path}" class="ln"/>
    ${points.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.y)}" r="${i === maxI ? 4.5 : 2.5}" class="${i === maxI ? 'pk' : 'dot'}"/>`).join('')}
    <text x="${P.l}" y="${H - 5}">${shortDate(points[0].t)}</text>
    ${n > 1 ? `<text x="${W - P.r}" y="${H - 5}" text-anchor="end">${shortDate(points[n - 1].t)}</text>` : ''}
  </svg>`;
}
function spark(id) {
  const ex = EXM[id], h = history(id).slice(-12);
  if (h.length < 2) return '';
  const ys = h.map(p => val(p.e, ex)), lo = Math.min(...ys), hi = Math.max(...ys) || 1;
  const W = 60, H = 20;
  const d = ys.map((v, i) => `${i ? 'L' : 'M'}${(i * W / (ys.length - 1)).toFixed(1)},${(H - 2 - (hi === lo ? .5 : (v - lo) / (hi - lo)) * (H - 4)).toFixed(1)}`).join('');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}"><path d="${d}"/></svg>`;
}

// ---- Views ----
function homeHTML() {
  const t = totals(range), from = rangeStart(range);
  let reps = 0; for (const k in t) { const ex = EXM[k]; if (!(ex && ex.timed)) reps += t[k]; }
  const sess = db.sessions.filter(s => s.start >= from);
  const secs = sess.reduce((a, s) => a + (s.end - s.start), 0) / 1000;
  const rows = groupKeys().map(([k, l, tm]) => {
    const v = t[k] || 0;
    return `<div class="row${v ? '' : ' zero'}"><span>${esc(l)}</span><b>${tm ? fmtT(v) : v.toLocaleString()}</b></div>`;
  }).join('');
  const a = db.active;
  const rl = { today: 'today', week: 'last 7 days', all: 'all time' }[range];
  return `
  <header class="top">
    <div><h1>Workout</h1><p class="sub">${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p></div>
    <div class="streak"><b>${streak()}</b><span>day streak</span></div>
  </header>
  <button class="primary big" data-act="start">${a ? `Resume workout · <span id="elapsed">${fmtT((Date.now() - a.start) / 1000)}</span>` : 'Start workout'}</button>
  <div class="seg">${['today', 'week', 'all'].map(r => `<button data-act="range" data-r="${r}" class="${r === range ? 'on' : ''}">${{ today: 'Today', week: '7 days', all: 'All time' }[r]}</button>`).join('')}</div>
  <section class="hero">
    <div><b>${reps.toLocaleString()}</b><span>reps ${rl}</span></div>
    <div><b>${sess.length}</b><span>workouts</span></div>
    <div><b>${fmtT(secs)}</b><span>time</span></div>
  </section>
  <section class="list">${rows}</section>
  ${progressHTML()}${historyHTML()}${settingsHTML()}`;
}

function progressHTML() {
  const f = fastest();
  const rows = EX.map(ex => {
    const b = bests(ex.id);
    return `<div class="row tap" data-act="openEx" data-ex="${ex.id}"><span>${esc(label(ex))}<small>${b.r ? `PB ${show(ex, b.r)}${b.w ? ` · ${b.w} ${db.unit}` : ''}` : 'No data yet'}</small></span>${spark(ex.id)}<i class="chev">›</i></div>`;
  }).join('');
  return `<details class="panel" open><summary>Progress and PBs</summary>
    ${f ? `<div class="row"><span>Fastest full workout</span><b>${fmtT(f / 1000)}</b></div>` : ''}
    ${rows}</details>`;
}

function historyHTML() {
  const list = db.sessions.slice(-40).reverse().map(s => {
    const n = Object.keys(s.entries).length; let r = 0;
    for (const id in s.entries) if (EXM[id] && !EXM[id].timed) r += s.entries[id].reps || 0;
    const d = new Date(s.start);
    return `<div class="row hist"><span>${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}<small>${n} exercises · ${r} reps</small>${s.note ? `<em>${esc(s.note)}</em>` : ''}</span><b>${fmtT((s.end - s.start) / 1000)}</b><button class="x" data-act="del" data-sid="${s.id}" aria-label="Delete">×</button></div>`;
  }).join('');
  return `<details class="panel"><summary>History</summary>${list || '<p class="muted">No workouts yet.</p>'}</details>`;
}

function settingsHTML() {
  const chips = (act, key, opts, cur) => opts.map(([v, l]) => `<button class="chip ${cur === v ? 'on' : ''}" data-act="${act}" data-v="${v}">${l}</button>`).join('');
  return `<details class="panel"><summary>Settings and backup</summary>
    <button class="wide" data-act="manage">Edit exercises</button>
    <div class="row"><span>Rest timer</span><b class="chips">${chips('rest', 'rest', [[0, 'Off'], [30, '30s'], [45, '45s'], [60, '60s'], [90, '90s']], db.rest)}</b></div>
    <div class="row"><span>Weight unit</span><b class="chips">${chips('unit', 'unit', [['lb', 'lb'], ['kg', 'kg']], db.unit)}</b></div>
    <div class="btns"><button data-act="export">Export backup</button><button data-act="import">Import backup</button></div>
    <p class="muted">Data lives on this phone only. Export a backup now and then.</p>
    <input type="file" id="importFile" accept="application/json,.json" hidden>
  </details>`;
}

function exHTML(id) {
  const ex = EXM[id], h = history(id), b = bests(id);
  const pts = h.map(p => ({ t: p.t, y: val(p.e, ex) }));
  const wpts = h.filter(p => p.e.weight).map(p => ({ t: p.t, y: +p.e.weight }));
  const total = pts.reduce((a, p) => a + p.y, 0);
  const last5 = pts.slice(-5), avg = last5.length ? last5.reduce((a, p) => a + p.y, 0) / last5.length : 0;
  const prev5 = pts.slice(-10, -5), pavg = prev5.length ? prev5.reduce((a, p) => a + p.y, 0) / prev5.length : 0;
  const trend = pavg ? Math.round((avg - pavg) / pavg * 100) : null;
  const unitL = ex.timed ? 'Time' : 'Reps';
  return `
  <div class="bar"><button class="ghost" data-act="home">‹ Back</button><div></div><div></div></div>
  <h1 class="exh">${esc(label(ex))}</h1>
  ${ex.note && !DUP.has(ex.name) ? `<p class="sub">${esc(ex.note)}</p>` : ''}
  <section class="hero">
    <div><b>${b.r ? show(ex, b.r) : '–'}</b><span>personal best</span></div>
    <div><b>${pts.length}</b><span>sessions</span></div>
    <div><b>${ex.timed ? fmtT(total) : total.toLocaleString()}</b><span>lifetime</span></div>
  </section>
  ${pts.length ? `
    <section class="panel pad"><div class="ph"><span>${unitL}</span>${trend != null ? `<span class="${trend >= 0 ? 'up' : 'down'}">${trend >= 0 ? '▲' : '▼'} ${Math.abs(trend)}% vs prior 5</span>` : ''}</div>
      ${lineChart(pts, { title: unitL, fmt: ex.timed ? fmtT : null })}</section>
    ${wpts.length ? `<section class="panel pad"><div class="ph"><span>Weight (${db.unit})</span><span class="muted">Heaviest ${b.w}</span></div>${lineChart(wpts, { title: 'Weight', fmt: v => Math.round(v * 2) / 2 })}</section>` : ''}
    <section class="list">${h.slice(-15).reverse().map(p => `<div class="row"><span>${new Date(p.t).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span><b>${show(ex, val(p.e, ex))}${p.e.weight ? ` <i>· ${p.e.weight} ${db.unit}</i>` : ''}</b></div>`).join('')}</section>`
    : '<p class="muted">Log this exercise to see a chart.</p>'}`;
}

function workoutHTML() {
  const a = db.active, done = EX.filter(ex => a.entries[ex.id]).length;
  const cur = EX.find(ex => !a.entries[ex.id]);
  return `
  <div class="bar">
    <button class="ghost" data-act="home">Home</button>
    <div class="clock"><span id="elapsed">${fmtT((Date.now() - a.start) / 1000)}</span><small>${done}/${EX.length} done</small></div>
    <button class="primary" data-act="finish">Finish</button>
  </div>
  <div class="prog"><i style="width:${EX.length ? done / EX.length * 100 : 0}%"></i></div>
  <div class="cards">${EX.map((ex, i) => cardHTML(ex, i, cur && cur.id === ex.id)).join('')}</div>
  <label class="notes">Workout notes<textarea data-act-input="note" rows="2" placeholder="How did it feel? Anything sore?">${esc(a.note || '')}</textarea></label>
  <button class="ghost danger wide" data-act="discard">Discard workout</button>
  <div id="rest" class="rest" hidden><span>Rest</span><b id="restClock">0:00</b><button data-act="restAdd">+15s</button><button class="primary" data-act="restSkip">Skip</button></div>`;
}

function cardHTML(ex, i, cur) {
  const a = db.active, e = a.entries[ex.id], b = bests(ex.id), last = lastEntry(ex.id);
  const meta = [
    ex.note && !DUP.has(ex.name) ? esc(ex.note) : null,
    b.r ? `PB ${show(ex, b.r)}` : null,
    last ? `Last ${show(ex, val(last, ex))}${last.weight ? ' @ ' + last.weight + ' ' + db.unit : ''}` : null,
  ].filter(Boolean).join(' · ');
  const target = last ? val(last, ex) + (ex.timed ? 1 : 1) : 0;
  const beat = !e && last ? `<span class="beat">Beat ${show(ex, target)}</span>` : '';
  const head = `<div class="ch" ${e ? 'data-act="toggle"' : ''}><span class="num">${i + 1}</span><div class="nm"><h3>${esc(label(ex))}</h3><small>${meta || 'First time. Sets your baseline.'}</small></div>${beat}${a.pbs[ex.id] ? '<span class="tag">PB</span>' : ''}${e ? '<span class="ok">✓</span>' : ''}</div>`;
  if (ex.timed) {
    const running = a.timer && a.timer.id === ex.id;
    const secs = running ? (Date.now() - a.timer.start) / 1000 : (e ? e.secs : 0);
    const body = `<div class="timer"><span ${running ? 'id="timerClock"' : ''}>${fmtT(secs)}</span><button class="${running ? 'stop' : 'primary'}" data-act="timer">${running ? 'Stop' : (e ? 'Redo' : 'Start')}</button></div>`;
    return `<div class="card${e && !running ? ' done open' : ''}${cur ? ' cur' : ''}" data-id="${ex.id}">${head}${body}</div>`;
  }
  const body = `
    <div class="ctl"><button data-act="dec" aria-label="Minus">−</button><input type="number" inputmode="numeric" pattern="[0-9]*" data-f="reps" value="${e ? e.reps : ''}" placeholder="${last ? last.reps : 'reps'}"><button data-act="inc" aria-label="Plus">+</button></div>
    ${ex.w ? `<label class="wt">Weight <input type="number" inputmode="decimal" step="0.5" data-f="weight" value="${e && e.weight ? e.weight : ''}" placeholder="${last && last.weight ? last.weight : 'none'}"> ${db.unit}</label>` : ''}
    <button class="log" data-act="log">${e ? 'Update' : 'Log'}</button>`;
  return `<div class="card${e ? ' done' : ''}${cur ? ' cur' : ''}" data-id="${ex.id}">${head}${body}</div>`;
}

function summaryHTML() {
  const { s, pbs, fastPB, prevFast, beats } = summary;
  let reps = 0; for (const id in s.entries) if (EXM[id] && !EXM[id].timed) reps += s.entries[id].reps || 0;
  const ids = Object.keys(pbs);
  return `<section class="sum">
    <h1>Done.</h1>
    <div class="hero">
      <div><b>${fmtT((s.end - s.start) / 1000)}</b><span>total time</span></div>
      <div><b>${reps}</b><span>reps</span></div>
      <div><b>${ids.length + (fastPB ? 1 : 0)}</b><span>PBs</span></div>
    </div>
    ${fastPB ? `<p class="pbline">Fastest full workout. Previous best ${fmtT(prevFast / 1000)}.</p>` : ''}
    ${beats ? `<p class="muted">Beat last time on ${beats} exercise${beats === 1 ? '' : 's'}.</p>` : ''}
    ${ids.length ? `<div class="list">${ids.map(id => `<div class="row pb"><span>${esc(label(EXM[id]))}</span><b>${pbs[id]}</b></div>`).join('')}</div>` : ''}
    <label class="notes">Notes<textarea data-act-input="sumNote" rows="2" placeholder="How did it feel?">${esc(s.note || '')}</textarea></label>
    <button class="primary big" data-act="home">Home</button>
  </section>`;
}

function manageHTML() {
  const rows = db.exercises.map((ex, i) => `
    <div class="row mg${ex.hidden ? ' off' : ''}">
      <span class="mv"><button class="x" data-act="mv" data-i="${i}" data-d="-1" ${i ? '' : 'disabled'} aria-label="Move up">↑</button><button class="x" data-act="mv" data-i="${i}" data-d="1" ${i < db.exercises.length - 1 ? '' : 'disabled'} aria-label="Move down">↓</button></span>
      <span class="tap" data-act="editEx" data-ex="${ex.id}">${esc(ex.name)}<small>${[ex.note, ex.timed ? 'Timed' : 'Reps', ex.w ? 'Weighted' : '', ex.g ? 'Total: ' + ex.g : '', ex.hidden ? 'Hidden' : ''].filter(Boolean).map(esc).join(' · ')}</small></span>
      <i class="chev">›</i>
    </div>`).join('');
  return `
  <div class="bar"><button class="ghost" data-act="home">‹ Done</button><div></div><button class="primary" data-act="editEx" data-ex="new">+ Add</button></div>
  <h1 class="exh">Exercises</h1>
  <p class="sub">Order here is workout order. Hidden ones keep their history.</p>
  <section class="list">${rows}</section>
  <button class="ghost wide" data-act="resetEx">Restore default routine</button>`;
}

function editHTML() {
  const isNew = editId === 'new';
  const ex = isNew ? { name: '', note: '', g: '', w: false, timed: false } : EXM[editId];
  const groups = [...new Set(db.exercises.map(e => e.g).filter(Boolean))];
  const used = !isNew && db.sessions.some(s => s.entries[ex.id]);
  return `
  <div class="bar"><button class="ghost" data-act="manage">‹ Cancel</button><div></div><button class="primary" data-act="saveEx">Save</button></div>
  <h1 class="exh">${isNew ? 'New exercise' : 'Edit exercise'}</h1>
  <form class="form" id="exForm" onsubmit="return false">
    <label>Name<input name="name" value="${esc(ex.name)}" placeholder="e.g. Leg raise" required></label>
    <label>Detail (optional)<input name="note" value="${esc(ex.note || '')}" placeholder="e.g. Dumbbell"></label>
    <div class="row"><span>Type</span><b class="chips"><label class="chip"><input type="radio" name="timed" value="0" ${ex.timed ? '' : 'checked'}> Reps</label><label class="chip"><input type="radio" name="timed" value="1" ${ex.timed ? 'checked' : ''}> Timed</label></b></div>
    <div class="row"><span>Track weight</span><b><input type="checkbox" name="w" ${ex.w ? 'checked' : ''} class="sw"></b></div>
    <label>Home total group (optional)<input name="g" list="groups" value="${esc(ex.g || '')}" placeholder="e.g. Abs, Squats"><datalist id="groups">${groups.map(g => `<option value="${esc(g)}">`).join('')}</datalist></label>
    <p class="muted">Exercises in the same group add together on the home screen.</p>
  </form>
  ${isNew ? '' : `
    <button class="wide" data-act="hideEx">${ex.hidden ? 'Show in workout' : 'Hide from workout'}</button>
    ${used ? '<p class="muted">Has history, so it can only be hidden.</p>' : '<button class="ghost danger wide" data-act="deleteEx">Delete exercise</button>'}`}`;
}

// ---- Actions ----
function scrollCur() {
  requestAnimationFrame(() => {
    const c = document.querySelector('.card.cur');
    if (c) c.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}
function step(card, d) {
  const i = card.querySelector('[data-f=reps]');
  let v = i.value !== '' ? +i.value : (+i.placeholder || 0);
  i.value = Math.max(0, v + d);
}
function checkPB(ex, e) {
  const b = bests(ex.id), last = lastEntry(ex.id), v = val(e, ex), msgs = [];
  if (b.r && v > b.r) msgs.push(`${ex.timed ? fmtT(v) : v + ' reps'} <i>(was ${show(ex, b.r)})</i>`);
  if (b.w && e.weight > b.w) msgs.push(`${e.weight} ${db.unit} heaviest <i>(was ${b.w})</i>`);
  e.beat = !!(last && v > val(last, ex));
  if (msgs.length) {
    db.active.pbs[ex.id] = msgs.join('<br>');
    celebrate(label(ex), msgs.join('<br>'));
    return true;
  }
  delete db.active.pbs[ex.id];
  if (!b.r) toast('Logged. Baseline set.');
  else if (e.beat) toast(`Beat last time (+${ex.timed ? fmtT(v - val(last, ex)) : v - val(last, ex)})`);
  else toast('Logged');
  return false;
}
function startRest() {
  if (db.rest > 0) db.active.restEnd = Date.now() + db.rest * 1000;
}
function afterLog(id, pb) {
  const remaining = EX.some(ex => !db.active.entries[ex.id]);
  if (remaining) startRest();
  save(); render();
  if (pb) { const c = document.querySelector(`[data-id="${id}"]`); if (c) c.classList.add('flash'); }
  scrollCur();
}
function logEntry(id, card) {
  const ex = EXM[id];
  const ri = card.querySelector('[data-f=reps]'), wi = card.querySelector('[data-f=weight]');
  const reps = Math.round(ri.value !== '' ? +ri.value : (+ri.placeholder || 0));
  if (!(reps > 0)) {
    delete db.active.entries[id]; delete db.active.pbs[id];
    save(); render(); toast('Cleared'); return;
  }
  const e = { reps };
  if (wi) { const w = wi.value !== '' ? +wi.value : (+wi.placeholder || 0); if (w > 0) e.weight = w; }
  db.active.entries[id] = e;
  afterLog(id, checkPB(ex, e));
}
const newId = () => 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

const H = {
  start() {
    if (!db.active) { db.active = { start: Date.now(), entries: {}, pbs: {}, timer: null, restEnd: null, note: '' }; save(); }
    go('workout'); scrollCur();
  },
  home() { summary = null; go('home'); },
  range(b) { range = b.dataset.r; render(); },
  inc(b, card) { step(card, 1); },
  dec(b, card) { step(card, -1); },
  log(b, card) { logEntry(card.dataset.id, card); },
  toggle(b, card) {
    card.classList.toggle('open');
    if (card.classList.contains('open')) { const i = card.querySelector('[data-f=reps]'); if (i) i.focus(); }
  },
  timer(b, card) {
    const a = db.active, id = card.dataset.id;
    if (a.timer && a.timer.id === id) {
      const secs = Math.floor((Date.now() - a.timer.start) / 1000);
      a.timer = null;
      if (secs > 0) { const e = { secs }; a.entries[id] = e; afterLog(id, checkPB(EXM[id], e)); }
      else { save(); render(); }
    } else {
      a.timer = { id, start: Date.now() }; a.restEnd = null; save(); render(); vibe(60);
    }
  },
  restAdd() { const a = db.active; if (a && a.restEnd) { a.restEnd += 15000; save(); } },
  restSkip() { const a = db.active; if (a) { a.restEnd = null; save(); $('#rest').hidden = true; } },
  finish() {
    const a = db.active, n = Object.keys(a.entries).length;
    if (a.timer && !confirm('A timer is still running. Finish anyway?')) return;
    if (!n) {
      if (confirm('Nothing logged. Discard this workout?')) { db.active = null; save(); go('home'); }
      return;
    }
    const missing = EX.filter(ex => !a.entries[ex.id]).length;
    if (missing && !confirm(`${missing} not logged. Finish anyway?`)) return;
    const prevFast = fastest();
    const s = { id: a.start.toString(36), start: a.start, end: Date.now(), entries: a.entries, note: (a.note || '').trim() };
    const full = !missing, dur = s.end - s.start;
    const beats = Object.values(a.entries).filter(e => e.beat).length;
    summary = { s, pbs: a.pbs || {}, fastPB: full && prevFast && dur < prevFast, prevFast, beats };
    db.sessions.push(s); db.active = null; save();
    go('summary');
    if (summary.fastPB) celebrate('Full workout', `${fmtT(dur / 1000)} <i>(was ${fmtT(prevFast / 1000)})</i>`);
  },
  discard() {
    if (!confirm('Discard this workout? Nothing will be saved.')) return;
    db.active = null; save(); go('home');
  },
  del(b) {
    if (!confirm('Delete this workout from history?')) return;
    db.sessions = db.sessions.filter(s => s.id !== b.dataset.sid); save(); render();
  },
  unit(b) { db.unit = b.dataset.v; save(); render(); },
  rest(b) { db.rest = +b.dataset.v; save(); render(); },
  openEx(b) { exView = b.dataset.ex; go('ex'); },
  manage() { go('manage'); },
  editEx(b) { editId = b.dataset.ex; go('edit'); },
  mv(b) {
    const i = +b.dataset.i, j = i + +b.dataset.d, L = db.exercises;
    if (j < 0 || j >= L.length) return;
    [L[i], L[j]] = [L[j], L[i]]; save(); refreshEx(); render();
  },
  saveEx() {
    const f = $('#exForm'), fd = new FormData(f);
    const name = (fd.get('name') || '').trim();
    if (!name) { toast('Name required'); f.name.focus(); return; }
    const data = { name, note: (fd.get('note') || '').trim(), g: (fd.get('g') || '').trim(), timed: fd.get('timed') === '1', w: !!fd.get('w') };
    if (editId === 'new') db.exercises.push({ id: newId(), ...data });
    else Object.assign(EXM[editId], data);
    for (const k of ['note', 'g']) for (const e of db.exercises) if (!e[k]) delete e[k];
    save(); refreshEx(); toast('Saved'); go('manage');
  },
  hideEx() { const e = EXM[editId]; e.hidden = !e.hidden; if (!e.hidden) delete e.hidden; save(); refreshEx(); go('manage'); },
  deleteEx() {
    if (!confirm('Delete this exercise?')) return;
    db.exercises = db.exercises.filter(e => e.id !== editId); save(); refreshEx(); go('manage');
  },
  resetEx() {
    if (!confirm('Restore the default 20 exercises? Custom ones are kept but hidden.')) return;
    const custom = db.exercises.filter(e => !DEFAULT_EX.some(d => d.id === e.id)).map(e => ({ ...e, hidden: true }));
    db.exercises = DEFAULT_EX.map(e => ({ ...e })).concat(custom); save(); refreshEx(); render();
  },
  async export() {
    const json = JSON.stringify(db);
    const name = `workout-backup-${new Date().toISOString().slice(0, 10)}.json`;
    try {
      const f = new File([json], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f] }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const u = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const l = document.createElement('a'); l.href = u; l.download = name;
    document.body.appendChild(l); l.click(); l.remove();
    setTimeout(() => URL.revokeObjectURL(u), 2000);
  },
  import() { $('#importFile').click(); },
  fixActive() { db.active = null; save(); go('home'); toast('Workout closed'); },
  async reload() {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
      const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k)));
    } catch (e) {}
    location.reload();
  },
};

document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-act]'); if (!b) return;
  const fn = H[b.dataset.act]; if (!fn) return;
  fn(b, b.closest('[data-id]'));
});
document.addEventListener('input', ev => {
  const k = ev.target.dataset && ev.target.dataset.actInput;
  if (k === 'note' && db.active) { db.active.note = ev.target.value; save(); }
  if (k === 'sumNote' && summary) { summary.s.note = ev.target.value.trim(); save(); }
});
document.addEventListener('keydown', ev => {
  if (ev.key !== 'Enter') return;
  const card = ev.target.closest && ev.target.closest('[data-id]');
  if (card && ev.target.matches('input')) { ev.preventDefault(); logEntry(card.dataset.id, card); }
});
document.addEventListener('change', ev => {
  if (ev.target.id !== 'importFile') return;
  const file = ev.target.files[0]; if (!file) return;
  file.text().then(txt => {
    const d = JSON.parse(txt);
    if (!d || !Array.isArray(d.sessions)) throw new Error('bad');
    const ids = new Set(db.sessions.map(s => s.id)); let added = 0;
    for (const s of d.sessions) {
      if (s && s.id && s.start && s.entries && !ids.has(s.id)) { db.sessions.push(s); added++; }
    }
    // Bring over any exercises the backup knows that this phone doesn't.
    if (Array.isArray(d.exercises)) for (const e of d.exercises) if (e && e.id && !EXM[e.id]) db.exercises.push(e);
    db.sessions.sort((x, y) => x.start - y.start);
    save(); refreshEx(); render(); toast(`Imported ${added} workouts`);
  }).catch(() => toast('Not a valid backup file'));
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (view === 'workout') keepAwake(true); else if (view === 'home') render();
});

save();
render();
if (view === 'workout') scrollCur();
