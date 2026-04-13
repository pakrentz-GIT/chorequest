const Audio = (() => {
  let ctx = null;
  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }
  function beep(freq, dur, type='square', vol=0.12) {
    try {
      const c = getCtx();
      const o = c.createOscillator(), g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      o.start(c.currentTime); o.stop(c.currentTime + dur);
    } catch(e) {}
  }
  return {
    move()    { beep(220, 0.05, 'square', 0.07); },
    place()   { beep(330, 0.08, 'square', 0.10); setTimeout(()=>beep(440,0.06,'square',0.07),60); },
    lineClear() {
      [523,659,784,1047].forEach((f,i) => setTimeout(()=>beep(f,0.09,'square',0.16), i*80));
    },
    choreDone() {
      beep(440, 0.06, 'square', 0.14);
      setTimeout(()=>beep(554,0.06,'square',0.14), 70);
      setTimeout(()=>beep(659,0.12,'square',0.14), 140);
    },
    gameOver()   { [392,330,294,220].forEach((f,i)=>setTimeout(()=>beep(f,0.18,'square',0.13),i*120)); },
    boardClear() { [523,659,784,1047,784,1047,1319].forEach((f,i)=>setTimeout(()=>beep(f,0.11,'square',0.18),i*80)); },
    select()     { beep(660, 0.07, 'square', 0.11); },
    denied()     { beep(110, 0.14, 'square', 0.11); },
    sync()       { beep(880, 0.05, 'square', 0.06); },
  };
})();
