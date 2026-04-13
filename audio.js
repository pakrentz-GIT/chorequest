const SFX = (() => {
  let ctx = null;
  function ac() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, dur, vol=0.12, type='square') {
    try {
      const c=ac(), o=c.createOscillator(), g=c.createGain();
      o.connect(g); g.connect(c.destination);
      o.type=type; o.frequency.value=freq;
      g.gain.setValueAtTime(vol, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime+dur);
      o.start(); o.stop(c.currentTime+dur);
    } catch(e){}
  }
  return {
    move()      { tone(220,0.05,0.07); },
    place()     { tone(330,0.08,0.10); setTimeout(()=>tone(440,0.06,0.07),60); },
    lineClear() { [523,659,784,1047].forEach((f,i)=>setTimeout(()=>tone(f,0.09,0.15),i*80)); },
    choreDone() { tone(440,0.06,0.13); setTimeout(()=>tone(554,0.06,0.13),70); setTimeout(()=>tone(659,0.12,0.13),140); },
    gameOver()  { [392,330,262,220].forEach((f,i)=>setTimeout(()=>tone(f,0.18,0.12),i*120)); },
    select()    { tone(660,0.07,0.10); },
    denied()    { tone(110,0.15,0.10); },
  };
})();
