// Synthetische Klänge (WebAudio) — kein Dateidownload nötig.
let ctx = null, master = null, enabled = true;

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, dur, { type = 'sine', vol = 0.3, slide = 0, delay = 0, attack = 0.005 } = {}) {
  const c = ac(); if (!c || !enabled) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur, { freq = 1800, q = 1.2, vol = 0.25, delay = 0 } = {}) {
  const c = ac(); if (!c || !enabled) return;
  const t = c.currentTime + delay;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain(); g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t);
}

export const Sound = {
  unlock() { ac(); },
  setEnabled(v) { enabled = v; },
  get enabled() { return enabled; },
  pick() { noise(0.06, { freq: 2600, vol: 0.18 }); tone(420, 0.12, { type: 'triangle', vol: 0.12, slide: 1.6 }); },
  drop() { noise(0.05, { freq: 3200, q: 3, vol: 0.35 }); tone(140, 0.14, { vol: 0.35, slide: 0.6 }); },
  back() { noise(0.05, { freq: 1500, vol: 0.15 }); tone(300, 0.1, { type: 'triangle', vol: 0.1, slide: 0.7 }); },
  deny() { tone(150, 0.16, { type: 'square', vol: 0.06 }); tone(110, 0.2, { type: 'square', vol: 0.06, delay: 0.08 }); },
  free() { tone(880, 0.25, { vol: 0.09 }); tone(1320, 0.3, { vol: 0.07, delay: 0.07 }); },
  win() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.5, { type: 'triangle', vol: 0.13, delay: i * 0.09 }));
    tone(262, 0.9, { vol: 0.12, delay: 0.1 });
  },
  hint() { tone(660, 0.18, { vol: 0.08 }); tone(990, 0.22, { vol: 0.06, delay: 0.1 }); },
};
