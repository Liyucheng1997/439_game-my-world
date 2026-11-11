// 用 WebAudio 合成的简单音效
let ac = null;
function ctx() {
  if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
  if (ac.state === 'suspended') ac.resume();
  return ac;
}

function tone(freq, to, dur, vol, type = 'sine', delay = 0) {
  const a = ctx(), t = a.currentTime + delay;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur, vol, cutoff) {
  const a = ctx(), t = a.currentTime;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = buf; f.type = 'lowpass'; f.frequency.value = cutoff; g.gain.value = vol;
  s.connect(f).connect(g).connect(a.destination);
  s.start(t);
}

export function sfx(name) {
  try {
    if (name === 'place') tone(230, 110, 0.09, 0.25);
    else if (name === 'break') { noise(0.13, 0.35, 1100); tone(140, 70, 0.1, 0.15); }
    else if (name === 'bounce') tone(220, 660, 0.18, 0.2, 'triangle');
    else if (name === 'pick') tone(520, 780, 0.06, 0.12);
    else if (name === 'crystal') [660, 880, 1320, 1760].forEach((f, i) => tone(f, f, 0.35, 0.16, 'triangle', i * 0.08));
    else if (name === 'unlock') [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.4, 0.14, 'sine', 0.4 + i * 0.1));
  } catch (e) { /* 没有音频也不影响游戏 */ }
}
