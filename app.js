'use strict';
// 間歇計時 — 規格見 docs/02-規格.md

// ── 設定欄位與內建設定（規格 §3、§4）──
const FIELDS = [
  { k: 'prep',    name: '準備',     dot: '#fbbf24', min: 0, max: 60,  step: 5,  time: true },
  { k: 'work',    name: '運動',     dot: '#fb7185', min: 5, max: 600, step: 5,  time: true },
  { k: 'rest',    name: '休息',     dot: '#34d399', min: 0, max: 600, step: 5,  time: true },
  { k: 'rounds',  name: '回合',     dot: '#52525b', min: 1, max: 50,  step: 1 },
  { k: 'sets',    name: '組數',     dot: '#52525b', min: 1, max: 20,  step: 1 },
  { k: 'setRest', name: '組間休息', dot: '#818cf8', min: 0, max: 600, step: 15, time: true },
];
const BUILTIN = [
  { name: 'Tabata', c: { prep: 10, work: 20, rest: 10, rounds: 8, sets: 1, setRest: 60 } },
  { name: 'HIIT',   c: { prep: 10, work: 40, rest: 20, rounds: 8, sets: 3, setRest: 60 } },
];
const LABEL = { prep: '準備', work: '運動', rest: '休息', setRest: '組間休息' };
const VOICE = { prep: '準備', work: '開始運動', rest: '休息', setRest: '組間休息' };
const COLOR = { prep: '#fbbf24', work: '#fb7185', rest: '#34d399', setRest: '#818cf8' };
const $ = id => document.getElementById(id);
const root = document.documentElement, body = document.body;

// ── 小工具 ──
const pad = n => String(n).padStart(2, '0');
const clock = s => s >= 3600 ? `${Math.floor(s / 3600)}:${pad(Math.floor(s % 3600 / 60))}:${pad(s % 60)}` : `${Math.floor(s / 60)}:${pad(s % 60)}`;
const plain = s => s < 60 ? `${s} 秒` : `${Math.floor(s / 60)} 分${s % 60 ? ` ${s % 60} 秒` : ''}`;
const total = c => c.prep + c.sets * (c.rounds * c.work + (c.rounds - 1) * c.rest) + (c.sets - 1) * c.setRest;
const summary = c => `${c.work}/${c.rest} 秒 × ${c.rounds} 回 × ${c.sets} 組 · ${plain(total(c))}`;
const restart = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

// ── 儲存（規格 §8）：讀不到或壞掉都退回預設，不讓 App 打不開 ──
const store = {
  get(k, fallback) { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 私密瀏覽等：不記得就算了 */ } },
};
function clean(c) {
  const out = {};
  for (const f of FIELDS) {
    const n = Math.round(Number(c?.[f.k]));
    out[f.k] = Number.isFinite(n) ? Math.min(f.max, Math.max(f.min, n)) : BUILTIN[0].c[f.k];
  }
  return out;
}
const cleanName = n => typeof n === 'string' ? n.trim().slice(0, 12) : '';
const isBuiltIn = name => BUILTIN.some(b => b.name === name);

const saved = store.get('it.presets', []);
let presets = (Array.isArray(saved) ? saved : [])
  .map(p => ({ name: cleanName(p?.name), c: clean(p?.c) }))
  .filter(p => p.name && !isBuiltIn(p.name));
const last = store.get('it.last', null);
let cfg = clean(last?.c ?? BUILTIN[0].c);
let cfgName = cleanName(last?.name) || (last ? '自訂' : BUILTIN[0].name);
let soundOn = store.get('it.sound', true) !== false;

// ══════════ 設定頁 ══════════
$('rows').innerHTML = FIELDS.map(f => `
  <li class="row" id="row-${f.k}">
    <span class="name"><i class="dot" style="background:${f.dot}"></i>${f.name}</span>
    <button class="step" data-k="${f.k}" data-d="-1" aria-label="${f.name}減少">−</button>
    <span class="val" id="v-${f.k}" aria-live="polite"></span>
    <button class="step" data-k="${f.k}" data-d="1" aria-label="${f.name}增加">+</button>
  </li>`).join('');

function render(bumpKey) {
  for (const f of FIELDS) {
    const v = cfg[f.k], el = $('v-' + f.k);
    el.innerHTML = f.time && v < 60 ? `${v}<small> 秒</small>` : f.time ? clock(v) : v;
    el.setAttribute('aria-label', `${f.name} ${f.time ? plain(v) : v}`);
    document.querySelector(`[data-k="${f.k}"][data-d="-1"]`).disabled = v <= f.min;
    document.querySelector(`[data-k="${f.k}"][data-d="1"]`).disabled = v >= f.max;
  }
  $('row-rest').classList.toggle('off', cfg.rounds === 1);
  $('row-setRest').classList.toggle('off', cfg.sets === 1);
  $('tt').textContent = clock(total(cfg));
  $('pname').textContent = cfgName;
  if (bumpKey) restart($('v-' + bumpKey), 'bump');
}

function change(k, d) {
  const f = FIELDS.find(x => x.k === k), next = Math.min(f.max, Math.max(f.min, cfg[k] + d * f.step));
  if (next === cfg[k]) return false;
  cfg[k] = next; cfgName = '自訂'; render(k); return true;
}

// 按住連續加減：0.4 秒後開始，每 0.08 秒一次，到上下限自動停
let holdRep, rep;
const stopRep = () => { clearTimeout(holdRep); clearInterval(rep); };
document.querySelectorAll('.step').forEach(b => {
  b.addEventListener('pointerdown', e => {
    e.preventDefault(); stopRep();
    const { k, d } = b.dataset;
    change(k, +d);
    holdRep = setTimeout(() => { rep = setInterval(() => change(k, +d) || stopRep(), 80); }, 400);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => b.addEventListener(t, stopRep));
  b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); change(b.dataset.k, +b.dataset.d); } });
});

function renderSound() {
  const b = $('sound');
  b.setAttribute('aria-pressed', soundOn); b.textContent = soundOn ? '🔊' : '🔇';
}
$('sound').addEventListener('click', () => {
  soundOn = !soundOn; store.set('it.sound', soundOn); renderSound();
  toast(soundOn ? '聲音開啟' : '聲音關閉');
});
$('go').addEventListener('click', start);

// ── 常用設定抽屜 ──
const sheet = $('sheet');
function list() {
  const all = [...BUILTIN.map(p => ({ ...p, builtIn: true })), ...presets];
  $('plist').innerHTML = all.map(p => `
    <li><button class="pick" data-name=""><b></b><span>${summary(p.c)}</span></button>
    ${p.builtIn ? '' : '<button class="del" aria-label="刪除">✕</button>'}</li>`).join('');
  // 名稱用 textContent／dataset 放入，避免使用者輸入被當成 HTML
  $('plist').querySelectorAll('li').forEach((li, i) => {
    li.querySelector('.pick').dataset.name = all[i].name;
    li.querySelector('b').textContent = all[i].name;
    li.querySelector('.del')?.setAttribute('aria-label', `刪除 ${all[i].name}`);
  });
}
const findPreset = name => BUILTIN.find(p => p.name === name) || presets.find(p => p.name === name);
function openSheet() { list(); sheet.showModal(); requestAnimationFrame(() => sheet.classList.add('show')); }
function closeSheet() { sheet.classList.remove('show'); setTimeout(() => sheet.open && sheet.close(), 400); }
$('openPresets').addEventListener('click', openSheet);
sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });
sheet.addEventListener('cancel', e => { e.preventDefault(); closeSheet(); });
$('plist').addEventListener('click', e => {
  const li = e.target.closest('li'); if (!li) return;
  const name = li.querySelector('.pick').dataset.name, p = findPreset(name);
  if (!p) return;
  if (e.target.closest('.del')) {
    if (!confirm(`刪除「${name}」？`)) return;
    presets = presets.filter(x => x.name !== name); store.set('it.presets', presets);
    li.classList.add('gone'); setTimeout(list, 250);
  } else if (e.target.closest('.pick')) {
    cfg = { ...p.c }; cfgName = p.name; render(); closeSheet();
  }
});
$('saveForm').addEventListener('submit', e => {
  e.preventDefault();
  const name = cleanName($('newName').value);
  if (!name) return;
  if (isBuiltIn(name)) { toast('這是內建名稱，請換一個'); return; }
  const old = presets.find(p => p.name === name);
  if (old) {
    if (!confirm(`要用目前的數字覆蓋「${name}」嗎？`)) return;
    old.c = { ...cfg };
  } else presets.push({ name, c: { ...cfg } });
  store.set('it.presets', presets);
  cfgName = name; $('newName').value = ''; render(); list();
  toast(old ? `已覆蓋「${name}」` : `已儲存「${name}」`);
});

let toastT;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; clearTimeout(toastT);
  try { t.hidePopover?.(); t.showPopover?.(); } catch { /* 不支援 popover 時照樣顯示在頁面上 */ }
  requestAnimationFrame(() => t.classList.add('on'));
  toastT = setTimeout(() => { t.classList.remove('on'); setTimeout(() => { try { t.hidePopover?.(); } catch {} }, 300); }, 1600);
}

// ══════════ 聲音（規格 §6）══════════
// 測試用：在主控台設 window.soundLog = [] 即可記錄每一次嗶聲與語音
const logSound = (...a) => window.soundLog?.push([Math.round(performance.now()), ...a]);
let ac, osc, voice = null, voiceT = 0;
function pickVoice() {
  const v = speechSynthesis.getVoices();
  voice = v.find(x => /zh[-_]TW/i.test(x.lang)) || v.find(x => /^zh/i.test(x.lang)) || null;
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.addEventListener?.('voiceschanged', pickVoice); }

function unlockSound() { // 必須在「點擊」當下呼叫，iPhone 才放行聲音
  // 刻意不設 audioSession.type='playback'：那會打斷使用者自己在放的音樂（規格 §6.2）
  try { ac ||= new (window.AudioContext || window.webkitAudioContext)(); ac.resume(); } catch {}
  try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch {}
}
function stopSound() {
  clearTimeout(voiceT);
  try { osc?.stop(); } catch {}
  osc = null;
  try { speechSynthesis.cancel(); } catch {}
}
function say(text) {
  if (!soundOn) return;
  logSound('voice', text);
  try { const u = new SpeechSynthesisUtterance(text); u.lang = 'zh-TW'; if (voice) u.voice = voice; speechSynthesis.speak(u); } catch {}
}
function beep() { // 880 Hz 長嗶 0.5 秒
  if (!soundOn) return;
  logSound('beep');
  if (!ac) return;
  try {
    const t = ac.currentTime, g = ac.createGain();
    osc = ac.createOscillator(); osc.frequency.value = 880;
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.6, t + .02);
    g.gain.setValueAtTime(.6, t + .42); g.gain.exponentialRampToValueAtTime(.0001, t + .5);
    osc.connect(g).connect(ac.destination); osc.start(t); osc.stop(t + .5);
  } catch {}
}
function announce(text) { stopSound(); beep(); voiceT = setTimeout(() => say(text), 550); }

// ══════════ 計時（規格 §5）══════════
function build(c) {
  const p = [{ type: 'prep', s: c.prep, set: 1, round: 0 }];
  for (let s = 1; s <= c.sets; s++)
    for (let r = 1; r <= c.rounds; r++) {
      p.push({ type: 'work', s: c.work, set: s, round: r });
      if (r < c.rounds) p.push({ type: 'rest', s: c.rest, set: s, round: r });
      else if (s < c.sets) p.push({ type: 'setRest', s: c.setRest, set: s, round: r });
    }
  return p.filter(x => x.s > 0).map(x => ({ ...x, ms: x.s * 1000 }));  // 0 秒段落略過
}

let run = null;
function start() {
  unlockSound();
  store.set('it.last', { name: cfgName, c: cfg });
  const phases = build(cfg);
  let acc = 0;
  const starts = phases.map(p => (acc += p.ms) - p.ms);
  run = { c: { ...cfg }, phases, starts, totalMs: acc, t0: performance.now(), pausedMs: 0, pausedAt: 0, idx: -1, sec: -1, quiet: false, lock: null };
  body.classList.remove('paused', 'final', 'holding');
  $('digits').innerHTML = '';
  show('run');
  keepAwake();
  run.raf = requestAnimationFrame(tick);
}

function tick(now) {
  if (!run || run.pausedAt) return;
  const el = Math.max(0, now - run.t0 - run.pausedMs);
  if (el >= run.totalMs) { finish(!run.quiet); return; }
  let i = Math.max(run.idx, 0);
  while (el >= run.starts[i] + run.phases[i].ms) i++;
  if (i !== run.idx) enter(i);
  const ph = run.phases[i], ms = run.starts[i] + ph.ms - el, sec = Math.ceil(ms / 1000);
  if (sec !== run.sec) {
    run.sec = sec; showDigits(sec);
    if (!run.quiet) cue(ph, sec);
  }
  $('arc').style.strokeDashoffset = (-(1 - ms / ph.ms) * 100).toFixed(2);
  $('left').textContent = clock(Math.ceil((run.totalMs - el) / 1000));
  run.quiet = false;
  run.raf = requestAnimationFrame(tick);
}

function enter(i) {
  const ph = run.phases[i], nx = run.phases[i + 1], c = run.c;
  run.idx = i; run.sec = -1;
  root.style.setProperty('--c', COLOR[ph.type]);
  $('label').textContent = LABEL[ph.type];
  $('pos').textContent = ph.type === 'prep' ? `共 ${c.sets} 組 × ${c.rounds} 回`
    : ph.type === 'setRest' ? `第 ${ph.set} 組完成` : `第 ${ph.set} 組 · ${ph.round}/${c.rounds} 回`;
  $('next').textContent = nx ? `下一段：${LABEL[nx.type]} ${plain(nx.s)}` : '最後一段';
  $('sr').textContent = LABEL[ph.type];
  body.classList.remove('final'); restart(body, 'enter');
  if (!run.quiet) announce(VOICE[ph.type]);
}

function cue(ph, sec) {
  if (ph.type === 'work' && ph.ms >= 20000 && sec === 10) say('還剩十秒');
  if (ph.ms >= 8000 && sec <= 3) say(['一', '二', '三'][sec - 1]);
}

function showDigits(sec) {
  const box = $('digits'), old = box.lastElementChild, s = document.createElement('span');
  box.classList.toggle('long', sec >= 60);
  body.classList.toggle('final', sec <= 3);
  s.textContent = sec >= 60 ? clock(sec) : sec; s.className = 'in'; box.append(s);
  if (old) { old.className = 'out'; setTimeout(() => old.remove(), 450); }
  requestAnimationFrame(() => requestAnimationFrame(() => { s.className = ''; }));
}

function setPaused(on) {
  if (!run || !!run.pausedAt === on) return;
  if (on) { run.pausedAt = performance.now(); cancelAnimationFrame(run.raf); stopSound(); }
  else { run.pausedMs += performance.now() - run.pausedAt; run.pausedAt = 0; keepAwake(); run.raf = requestAnimationFrame(tick); }
  body.classList.toggle('paused', on);
  $('sr').textContent = on ? '已暫停' : '繼續';
}

function finish(withSound) {
  const c = run.c;
  cancelAnimationFrame(run.raf); releaseLock();
  if (withSound) announce('訓練完成'); else stopSound();
  run = null;
  $('doneInfo').textContent = `${c.sets} 組 × ${c.rounds} 回 · ${plain(total(c))}`;
  doneAt = performance.now();
  root.style.setProperty('--c', '#34d399');
  show('done');
}

function stopRun() { // 長按結束：回設定頁，不顯示完成畫面
  if (!run) return;
  cancelAnimationFrame(run.raf); stopSound(); releaseLock();
  run = null;
  body.classList.remove('paused', 'holding', 'final');
  show('setup');
}

function show(name) { body.dataset.screen = name; if (name === 'setup') { root.style.setProperty('--c', '#fb7185'); render(); } }

// ── 螢幕常亮（規格 §7）──
async function keepAwake() {
  const r = run; if (!r || r.locking) return;   // 同時只發一個請求，避免多拿的常亮釋放不掉
  r.locking = true;
  try {
    if (!r.lock || r.lock.released) r.lock = await navigator.wakeLock.request('screen');
    setWake(true);
  } catch { setWake(false); }
  r.locking = false;
  if (run !== r) r.lock?.release().catch(() => {});  // 等待期間訓練已結束
}
function releaseLock() { run?.lock?.release().catch(() => {}); }
function setWake(ok) { $('wakeWarn').hidden = ok; $('wakeState').textContent = ok ? '已開啟' : '未開啟'; }

// 切 App／鎖定回來：依真實時間跳到正確位置，不補播聲音（規格 §5.4）
document.addEventListener('visibilitychange', () => {
  if (!run) return;
  if (document.visibilityState === 'hidden') { clearTimeout(voiceT); return; }  // 離開時取消排隊語音，回來不補播
  if (!run.pausedAt) run.quiet = true;   // 暫停中時間沒走，回來後照常播
  keepAwake();
  try { ac?.resume(); } catch {}
});

// ── 點一下＝暫停／繼續；按住 1 秒＝結束（規格 §5.5）──
let pressT = 0, endT = 0, pressing = false, holding = false;
const runEl = $('run');
runEl.addEventListener('pointerdown', e => {
  if (!run || !e.isPrimary || performance.now() - run.t0 < 400) return;  // 剛按「開始」時的連點不算暫停
  pressing = true; holding = false;
  clearTimeout(pressT); clearTimeout(endT);
  pressT = setTimeout(() => { holding = true; body.classList.add('holding'); endT = setTimeout(stopRun, 700); }, 300);
});
function release(toggle) {
  if (!pressing) return;
  pressing = false; clearTimeout(pressT); clearTimeout(endT); body.classList.remove('holding');
  if (toggle && !holding && run) setPaused(!run.pausedAt);
  holding = false;
}
runEl.addEventListener('pointerup', () => release(true));
runEl.addEventListener('pointercancel', () => release(false));
runEl.addEventListener('lostpointercapture', () => release(false));  // 被系統手勢打斷時的保險，避免誤結束
document.addEventListener('keydown', e => {   // 鍵盤替代：空白鍵暫停、Esc 結束
  if (body.dataset.screen !== 'run') return;
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setPaused(!run?.pausedAt); }
  if (e.key === 'Escape') stopRun();
});

// ── 完成畫面：前 1 秒不接受點擊 ──
let doneAt = 0;
$('done').addEventListener('click', () => { if (performance.now() - doneAt > 1000) show('setup'); });

// ── 啟動 ──
renderSound();
show('setup');
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
