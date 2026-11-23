// 設計樣品共用的示範計時引擎（縮短秒數，讓所有階段轉換都能快速看到）
// ponytail: 只為樣品服務；正式版引擎會在規格階段另寫，含語音與時間校正
const DEMO = { prep: 3, work: 8, rest: 5, rounds: 2, sets: 2, setRest: 6 };
const LABEL = { prep: '準備', work: '運動', rest: '休息', setRest: '組間休息' };

function buildPhases(c) {
  const p = [{ type: 'prep', dur: c.prep, set: 1, round: 0 }];
  for (let s = 1; s <= c.sets; s++)
    for (let r = 1; r <= c.rounds; r++) {
      p.push({ type: 'work', dur: c.work, set: s, round: r });
      if (r < c.rounds) p.push({ type: 'rest', dur: c.rest, set: s, round: r });
      else if (s < c.sets) p.push({ type: 'setRest', dur: c.setRest, set: s, round: r });
    }
  return p;
}

function runDemo({ onPhase, onFrame, onSecond, onPause, onDone }) {
  const phases = buildPhases(DEMO);
  let i = -1, start = 0, pausedAt = 0, lastSec = -1, raf = 0, lock = null;

  const info = ph => ({
    ...ph, label: LABEL[ph.type],
    meta: ph.type === 'prep' ? `共 ${DEMO.sets} 組 × ${DEMO.rounds} 回` : `第 ${ph.set} 組 · ${ph.round}/${DEMO.rounds} 回`,
    next: phases[i + 1] ? `下一段：${LABEL[phases[i + 1].type]} ${phases[i + 1].dur} 秒` : '最後一段',
  });

  function enter(n) {
    i = n; start = performance.now(); lastSec = -1;
    if (i >= phases.length) { cancelAnimationFrame(raf); lock?.release(); onDone(); return; }
    onPhase(info(phases[i]));
  }

  function frame(now) {
    const ph = phases[i], ms = ph.dur * 1000 - (now - start);
    if (ms <= 0) { enter(i + 1); if (i >= phases.length) return; raf = requestAnimationFrame(frame); return; }
    const sec = Math.ceil(ms / 1000);
    if (sec !== lastSec) { lastSec = sec; onSecond?.(sec, ph); }
    onFrame?.({ ms, sec, progress: 1 - ms / (ph.dur * 1000), phase: ph });
    raf = requestAnimationFrame(frame);
  }

  async function keepAwake() {
    try { lock = await navigator.wakeLock?.request('screen'); } catch { /* 樣品不強求常亮 */ }
  }

  document.addEventListener('click', e => {
    if (e.target.closest('a,button') || i < 0 || i >= phases.length) return;
    if (pausedAt) { start += performance.now() - pausedAt; pausedAt = 0; onPause?.(false); raf = requestAnimationFrame(frame); keepAwake(); }
    else { pausedAt = performance.now(); cancelAnimationFrame(raf); onPause?.(true); }
  });

  return function begin() { keepAwake(); enter(0); raf = requestAnimationFrame(frame); };
}

// 共用：開始遮罩與完成畫面的按鈕
function wireStart(begin) {
  const s = document.getElementById('start');
  s.addEventListener('click', () => { s.remove(); begin(); }, { once: true });
  document.getElementById('again')?.addEventListener('click', () => location.reload());
}
