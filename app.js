'use strict';

// ---- Routine (order matters) ----
const EX = [
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
const EXM = Object.fromEntries(EX.map(e => [e.id, e]));
const DUP = new Set(EX.map(e => e.name).filter((n, i, a) => a.indexOf(n) !== i));
const label = ex => DUP.has(ex.name) ? `${ex.name} (${ex.note.toLowerCase()})` : ex.name;

// ---- Storage ----
const KEY = 'workout_v1';
let db = null;
try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) { db = null; }
if (!db || !Array.isArray(db.sessions)) db = { sessions: [], active: null, unit: 'lb' };
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (e) { toast('Could not save. Storage blocked.'); }
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

// ---- State ----
const $ = s => document.querySelector(s);
let view = db.active ? 'workout' : 'home';
let range = 'today';
let tick = null;
let summary = null;

// ---- Helpers ----
function fmtT(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
}
const dayKey = ms => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
const val = (e, ex) => ex.timed ? (e.secs || 0) : (e.reps || 0);
const show = (ex, v) => ex.timed ? fmtT(v) : v;
const vibe = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };

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
function fastest() {
  let f = 0;
  for (const s of db.sessions) {
    if (EX.every(ex => s.entries[ex.id])) {
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
function totals(r) {
  const from = rangeStart(r), t = {};
  const add = entries => {
    for (const id in entries) {
      const ex = EXM[id]; if (!ex) continue;
      const k = ex.timed ? id : (ex.g || id);
      t[k] = (t[k] || 0) + val(entries[id], ex);
    }
  };
  for (const s of db.sessions) if (s.start >= from) add(s.entries);
  if (db.active && db.active.start >= from) add(db.active.entries);
  return t;
}
function groupKeys() {
  const seen = new Set(), out = [];
  for (const ex of EX) {
    const k = ex.timed ? ex.id : (ex.g || ex.id);
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
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2000);
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
  if (view === 'workout' && db.active) { app.innerHTML = workoutHTML(); keepAwake(true); }
  else if (view === 'summary' && summary) { app.innerHTML = summaryHTML(); keepAwake(false); }
  else { view = 'home'; app.innerHTML = homeHTML(); keepAwake(false); }
  if (db.active) startTick();
}

function startTick() {
  tick = setInterval(() => {
    const a = db.active; if (!a) return;
    const el = $('#elapsed'); if (el) el.textContent = fmtT((Date.now() - a.start) / 1000);
    const pc = $('#plankClock');
    if (pc && a.plankStart) {
      const s = (Date.now() - a.plankStart) / 1000;
      pc.textContent = fmtT(s);
      const b = bests('plank').r;
      if (b && s > b && !pc.classList.contains('beat')) {
        pc.classList.add('beat'); vibe([80, 50, 80]); toast('Past your plank PB. Keep going.');
      }
    }
  }, 250);
}

function homeHTML() {
  const t = totals(range), from = rangeStart(range);
  let reps = 0; for (const k in t) if (k !== 'plank') reps += t[k];
  const sess = db.sessions.filter(s => s.start >= from);
  const secs = sess.reduce((a, s) => a + (s.end - s.start), 0) / 1000;
  const rows = groupKeys().map(([k, l, tm]) => {
    const v = t[k] || 0;
    return `<div class="row${v ? '' : ' zero'}"><span>${l}</span><b>${tm ? fmtT(v) : v.toLocaleString()}</b></div>`;
  }).join('');
  const a = db.active;
  const rl = { today: 'today', week: 'last 7 days', all: 'all time' }[range];
  const st = streak();
  return `
  <header class="top">
    <div><h1>Workout</h1><p class="sub">${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p></div>
    <div class="streak"><b>${st}</b><span>day streak</span></div>
  </header>
  <button class="primary big" data-act="start">${a ? `Resume workout · <span id="elapsed">${fmtT((Date.now() - a.start) / 1000)}</span>` : 'Start workout'}</button>
  <div class="seg">${['today', 'week', 'all'].map(r => `<button data-act="range" data-r="${r}" class="${r === range ? 'on' : ''}">${{ today: 'Today', week: '7 days', all: 'All time' }[r]}</button>`).join('')}</div>
  <section class="hero">
    <div><b>${reps.toLocaleString()}</b><span>reps ${rl}</span></div>
    <div><b>${sess.length}</b><span>workouts</span></div>
    <div><b>${fmtT(secs)}</b><span>time</span></div>
  </section>
  <section class="list">${rows}</section>
  ${pbHTML()}${historyHTML()}${settingsHTML()}`;
}

function pbHTML() {
  const rows = EX.map(ex => {
    const b = bests(ex.id); if (!b.r) return '';
    return `<div class="row"><span>${label(ex)}</span><b>${show(ex, b.r)}${b.w ? ` <i>· ${b.w} ${db.unit}</i>` : ''}</b></div>`;
  }).join('');
  const f = fastest();
  return `<details class="panel"><summary>Personal bests</summary>
    ${f ? `<div class="row"><span>Fastest full workout</span><b>${fmtT(f / 1000)}</b></div>` : ''}
    ${rows || '<p class="muted">Finish a workout to set PBs.</p>'}</details>`;
}

function historyHTML() {
  const list = db.sessions.slice(-40).reverse().map(s => {
    const n = Object.keys(s.entries).length; let r = 0;
    for (const id in s.entries) if (EXM[id] && !EXM[id].timed) r += s.entries[id].reps || 0;
    const d = new Date(s.start);
    return `<div class="row hist"><span>${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}<small>${n}/${EX.length} exercises · ${r} reps</small></span><b>${fmtT((s.end - s.start) / 1000)}</b><button class="x" data-act="del" data-sid="${s.id}" aria-label="Delete">×</button></div>`;
  }).join('');
  return `<details class="panel"><summary>History</summary>${list || '<p class="muted">No workouts yet.</p>'}</details>`;
}

function settingsHTML() {
  return `<details class="panel"><summary>Settings and backup</summary>
    <div class="row"><span>Weight unit</span><b>
      <button class="chip ${db.unit === 'lb' ? 'on' : ''}" data-act="unit" data-u="lb">lb</button><button class="chip ${db.unit === 'kg' ? 'on' : ''}" data-act="unit" data-u="kg">kg</button></b></div>
    <div class="btns"><button data-act="export">Export backup</button><button data-act="import">Import backup</button></div>
    <p class="muted">Data lives on this phone only. Export a backup now and then.</p>
    <input type="file" id="importFile" accept="application/json,.json" hidden>
  </details>`;
}

function workoutHTML() {
  const a = db.active, done = Object.keys(a.entries).length;
  const cur = EX.find(ex => !a.entries[ex.id]);
  return `
  <div class="bar">
    <button class="ghost" data-act="home">Home</button>
    <div class="clock"><span id="elapsed">${fmtT((Date.now() - a.start) / 1000)}</span><small>${done}/${EX.length} done</small></div>
    <button class="primary" data-act="finish">Finish</button>
  </div>
  <div class="prog"><i style="width:${done / EX.length * 100}%"></i></div>
  <div class="cards">${EX.map((ex, i) => cardHTML(ex, i, cur && cur.id === ex.id)).join('')}</div>
  <button class="ghost danger wide" data-act="discard">Discard workout</button>`;
}

function cardHTML(ex, i, cur) {
  const a = db.active, e = a.entries[ex.id], b = bests(ex.id), last = lastEntry(ex.id);
  const meta = [
    ex.note && !DUP.has(ex.name) ? ex.note : null,
    b.r ? `PB ${show(ex, b.r)}` : null,
    last ? `Last ${show(ex, val(last, ex))}${last.weight ? ' @ ' + last.weight + ' ' + db.unit : ''}` : null,
  ].filter(Boolean).join(' · ');
  const head = `<div class="ch" ${e ? 'data-act="toggle"' : ''}><span class="num">${i + 1}</span><div class="nm"><h3>${label(ex)}</h3><small>${meta || 'First time. Sets your baseline.'}</small></div>${a.pbs[ex.id] ? '<span class="tag">PB</span>' : ''}${e ? '<span class="ok">✓</span>' : ''}</div>`;
  let body;
  if (ex.timed) {
    const running = !!a.plankStart;
    const secs = running ? (Date.now() - a.plankStart) / 1000 : (e ? e.secs : 0);
    body = `<div class="timer"><span id="plankClock">${fmtT(secs)}</span><button class="${running ? 'stop' : 'primary'}" data-act="plank">${running ? 'Stop' : (e ? 'Redo' : 'Start')}</button></div>`;
    return `<div class="card${e && !running ? ' done open' : ''}${cur ? ' cur' : ''}" data-id="${ex.id}">${head}${body}</div>`;
  }
  body = `
    <div class="ctl"><button data-act="dec" aria-label="Minus">−</button><input type="number" inputmode="numeric" pattern="[0-9]*" data-f="reps" value="${e ? e.reps : ''}" placeholder="${last ? last.reps : 'reps'}"><button data-act="inc" aria-label="Plus">+</button></div>
    ${ex.w ? `<label class="wt">Weight <input type="number" inputmode="decimal" step="0.5" data-f="weight" value="${e && e.weight ? e.weight : ''}" placeholder="${last && last.weight ? last.weight : 'none'}"> ${db.unit}</label>` : ''}
    <button class="log" data-act="log">${e ? 'Update' : 'Log'}</button>`;
  return `<div class="card${e ? ' done' : ''}${cur ? ' cur' : ''}" data-id="${ex.id}">${head}${body}</div>`;
}

function summaryHTML() {
  const { s, pbs, fastPB, prevFast } = summary;
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
    ${ids.length ? `<div class="list">${ids.map(id => `<div class="row pb"><span>${label(EXM[id])}</span><b>${pbs[id]}</b></div>`).join('')}</div>` : ''}
    <button class="primary big" data-act="home">Home</button>
  </section>`;
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
  const b = bests(ex.id), v = val(e, ex), msgs = [];
  if (b.r && v > b.r) msgs.push(`${ex.timed ? fmtT(v) : v + ' reps'} <i>(was ${show(ex, b.r)})</i>`);
  if (b.w && e.weight > b.w) msgs.push(`${e.weight} ${db.unit} heaviest <i>(was ${b.w})</i>`);
  if (msgs.length) {
    db.active.pbs[ex.id] = msgs.join('<br>');
    celebrate(label(ex), msgs.join('<br>'));
    return true;
  }
  delete db.active.pbs[ex.id];
  toast(b.r ? 'Logged' : 'Logged. Baseline set.');
  return false;
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
  const pb = checkPB(ex, e);
  save(); render();
  if (pb) { const c = document.querySelector(`[data-id="${id}"]`); if (c) c.classList.add('flash'); }
  scrollCur();
}

const H = {
  start() {
    if (!db.active) { db.active = { start: Date.now(), entries: {}, pbs: {}, plankStart: null }; save(); }
    view = 'workout'; render(); scrollCur();
  },
  home() { view = 'home'; summary = null; render(); window.scrollTo(0, 0); },
  range(b) { range = b.dataset.r; render(); },
  inc(b, card) { step(card, 1); },
  dec(b, card) { step(card, -1); },
  log(b, card) { logEntry(card.dataset.id, card); },
  toggle(b, card) {
    card.classList.toggle('open');
    if (card.classList.contains('open')) { const i = card.querySelector('[data-f=reps]'); if (i) i.focus(); }
  },
  plank() {
    const a = db.active;
    if (a.plankStart) {
      const secs = Math.floor((Date.now() - a.plankStart) / 1000);
      a.plankStart = null;
      let pb = false;
      if (secs > 0) { const e = { secs }; a.entries.plank = e; pb = checkPB(EXM.plank, e); }
      save(); render();
      if (pb) { const c = document.querySelector('[data-id="plank"]'); if (c) c.classList.add('flash'); }
      scrollCur();
    } else {
      a.plankStart = Date.now(); save(); render(); vibe(60);
    }
  },
  finish() {
    const a = db.active, n = Object.keys(a.entries).length;
    if (a.plankStart && !confirm('Plank timer still running. Finish anyway?')) return;
    if (!n) {
      if (confirm('Nothing logged. Discard this workout?')) { db.active = null; save(); view = 'home'; render(); }
      return;
    }
    if (n < EX.length && !confirm(`${EX.length - n} not logged. Finish anyway?`)) return;
    const prevFast = fastest();
    const s = { id: a.start.toString(36), start: a.start, end: Date.now(), entries: a.entries };
    const full = n === EX.length, dur = s.end - s.start;
    summary = { s, pbs: a.pbs || {}, fastPB: full && prevFast && dur < prevFast, prevFast };
    db.sessions.push(s); db.active = null; save();
    view = 'summary'; render(); window.scrollTo(0, 0);
    if (summary.fastPB) celebrate('Full workout', `${fmtT(dur / 1000)} <i>(was ${fmtT(prevFast / 1000)})</i>`);
  },
  discard() {
    if (!confirm('Discard this workout? Nothing will be saved.')) return;
    db.active = null; save(); view = 'home'; render();
  },
  del(b) {
    if (!confirm('Delete this workout from history?')) return;
    db.sessions = db.sessions.filter(s => s.id !== b.dataset.sid); save(); render();
  },
  unit(b) { db.unit = b.dataset.u; save(); render(); },
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
};

document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-act]'); if (!b) return;
  const fn = H[b.dataset.act]; if (!fn) return;
  fn(b, b.closest('[data-id]'));
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
    db.sessions.sort((x, y) => x.start - y.start);
    save(); render(); toast(`Imported ${added} workouts`);
  }).catch(() => toast('Not a valid backup file'));
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (view === 'workout') keepAwake(true); else if (view === 'home') render();
});

render();
if (view === 'workout') scrollCur();
