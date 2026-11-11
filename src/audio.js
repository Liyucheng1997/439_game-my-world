// 声音：全部用 WebAudio 现场合成 —— 音效、环境声、随模式变化的背景音乐
const SET_KEY = 'block-wonderland-settings-v1';
export const settings = { music: 0.55, sfx: 0.8, mute: false };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SET_KEY)) || {}); } catch (e) { /* 用默认值 */ }

let ac = null, master, lowpass, sfxBus, musBus, revSend, windGain, noiseBuf;
const R = Math.random;

function applyVolume() {
  if (!ac) return;
  const t = ac.currentTime;
  master.gain.setTargetAtTime(settings.mute ? 0 : 1, t, 0.05);
  sfxBus.gain.setTargetAtTime(settings.sfx, t, 0.05);
  musBus.gain.setTargetAtTime(settings.music * 0.9, t, 0.2);
}
export function setVolume(kind, v) {
  settings[kind] = v;
  try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch (e) { /* 忽略 */ }
  applyVolume();
}

// 必须在用户点击 / 按键之后调用，浏览器才允许出声
export function unlock() {
  try {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain();
      lowpass = ac.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.frequency.value = 20000;
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      master.connect(lowpass).connect(comp).connect(ac.destination);
      sfxBus = ac.createGain(); musBus = ac.createGain();
      sfxBus.connect(master); musBus.connect(master);
      // 混响：一段衰减的噪声当脉冲响应
      const len = Math.floor(ac.sampleRate * 2.6), ir = ac.createBuffer(2, len, ac.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (R() * 2 - 1) * Math.pow(1 - i / len, 2.6);
      }
      const conv = ac.createConvolver(); conv.buffer = ir;
      revSend = ac.createGain(); revSend.gain.value = 0.5;
      revSend.connect(conv).connect(musBus);
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const nd = noiseBuf.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = R() * 2 - 1;
      // 风声：一直循环的低频噪声，音量随高度和速度变化
      const ws = ac.createBufferSource(); ws.buffer = noiseBuf; ws.loop = true;
      const wf = ac.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 420;
      windGain = ac.createGain(); windGain.gain.value = 0;
      ws.connect(wf).connect(windGain).connect(sfxBus); ws.start();
      applyVolume();
      setInterval(tickMusic, 60);
    }
    if (ac.state === 'suspended') ac.resume();
  } catch (e) { ac = null; }
}

// ---------- 基础发声 ----------
function tone(freq, to, dur, vol, type = 'sine', delay = 0, bus = sfxBus, pan = 0) {
  const t = ac.currentTime + delay;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to !== freq) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  let out = o.connect(g);
  if (pan && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = pan; out = g.connect(p); }
  out.connect(bus);
  o.start(t); o.stop(t + dur + 0.03);
}

function nz(dur, vol, type = 'lowpass', f = 1000, q = 0.8, delay = 0, f2 = 0, bus = sfxBus) {
  const t = ac.currentTime + delay;
  const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf;
  fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  s.connect(fl).connect(g).connect(bus);
  s.start(t, R() * 1.5, dur + 0.05);
}

// 各种材质的"敲一下"：v 音量，p 音高
const MAT = {
  stone(v, p) { nz(0.09, 0.5 * v, 'bandpass', 1100 * p, 1.2); tone(170 * p, 90 * p, 0.07, 0.22 * v, 'triangle'); },
  wood(v, p) { tone(215 * p, 150 * p, 0.09, 0.32 * v, 'triangle'); tone(430 * p, 310 * p, 0.05, 0.1 * v); nz(0.05, 0.2 * v, 'bandpass', 700 * p, 2); },
  grass(v, p) { nz(0.13, 0.42 * v, 'lowpass', 760 * p); tone(120 * p, 80 * p, 0.06, 0.12 * v); },
  dirt(v, p) { nz(0.11, 0.48 * v, 'lowpass', 520 * p); tone(100 * p, 70 * p, 0.06, 0.12 * v); },
  sand(v, p) { nz(0.15, 0.3 * v, 'bandpass', 2600 * p, 0.7); },
  snow(v, p) { nz(0.14, 0.32 * v, 'bandpass', 1500 * p, 0.6); tone(300 * p, 200 * p, 0.05, 0.05 * v); },
  leaf(v, p) { nz(0.13, 0.26 * v, 'highpass', 2800 * p); nz(0.07, 0.12 * v, 'bandpass', 900 * p, 1, 0.03); },
  glass(v, p) { tone(1900 * p, 1700 * p, 0.13, 0.12 * v); tone(2850 * p, 2600 * p, 0.09, 0.07 * v); nz(0.03, 0.15 * v, 'highpass', 5000); },
  soft(v, p) { tone(300 * p, 180 * p, 0.1, 0.26 * v); tone(600 * p, 420 * p, 0.05, 0.06 * v); },
  water(v, p) { nz(0.16, 0.25 * v, 'bandpass', 900 * p, 1.5, 0, 400); },
};
const mat = (m) => MAT[m] || MAT.stone;
const arp = (notes, step, dur, vol, type = 'triangle', delay = 0) =>
  notes.forEach((f, i) => tone(f, f, dur, vol, type, delay + i * step));

const SFX = {
  place: (m) => mat(m)(0.8, 1.12 + R() * 0.12),
  break: (m) => { mat(m)(1, 0.82 + R() * 0.1); nz(0.14, 0.2, 'lowpass', 1400, 0.8, 0.02); },
  step: (m) => mat(m)(0.2, 0.92 + R() * 0.3),
  jump: () => nz(0.12, 0.08, 'bandpass', 500, 1, 0, 1300),
  land: (m, v = 1) => { mat(m)(0.35 * v, 0.7); tone(90, 50, 0.1, 0.2 * v); },
  splash: () => { nz(0.4, 0.35, 'bandpass', 1400, 0.8, 0, 500); nz(0.2, 0.2, 'highpass', 3500, 0.7, 0.04); },
  bounce: () => { tone(200, 640, 0.2, 0.22, 'triangle'); tone(400, 1100, 0.14, 0.06, 'sine', 0.02); },
  speed: () => nz(0.35, 0.16, 'bandpass', 600, 2, 0, 3200),
  pick: () => tone(520, 780, 0.06, 0.12),
  click: () => { tone(700, 900, 0.05, 0.1); tone(1400, 1400, 0.04, 0.04, 'sine', 0.02); },
  open: () => { tone(420, 640, 0.09, 0.1, 'triangle'); nz(0.1, 0.05, 'highpass', 3000); },
  close: () => tone(620, 400, 0.09, 0.09, 'triangle'),
  error: () => { tone(180, 150, 0.14, 0.16, 'square'); tone(140, 110, 0.16, 0.12, 'square', 0.09); },
  coin: () => { tone(1320, 1320, 0.08, 0.13, 'square'); tone(1760, 1760, 0.3, 0.12, 'triangle', 0.07); },
  craft: () => { MAT.wood(0.7, 1.2); tone(880, 1180, 0.12, 0.1, 'triangle', 0.08); },
  crystal: () => arp([660, 880, 1320, 1760], 0.08, 0.35, 0.16),
  unlock: () => arp([523, 659, 784, 1047], 0.1, 0.4, 0.14, 'sine', 0.4),
  checkpoint: () => arp([587, 880], 0.1, 0.3, 0.16),
  fall: () => { tone(520, 110, 0.5, 0.16, 'triangle'); nz(0.3, 0.1, 'lowpass', 900, 1, 0.1); },
  crumble: () => { nz(0.25, 0.3, 'bandpass', 700, 0.8, 0, 300); MAT.sand(0.6, 0.8); },
  blueprint: () => arp([392, 523, 659], 0.07, 0.25, 0.13),
  order: () => arp([784, 988, 1175], 0.08, 0.3, 0.13),
  built: () => { arp([523, 659, 784, 1047, 1319], 0.11, 0.5, 0.16); arp([262, 330, 392], 0.11, 0.9, 0.1, 'sine', 0.33); },
  levelup: () => { arp([392, 523, 659, 784, 1047, 1319, 1568], 0.1, 0.6, 0.16); arp([196, 262, 330, 392], 0.2, 1.2, 0.1, 'sine'); nz(0.6, 0.06, 'highpass', 6000, 0.7, 0.6); },
  clear: () => { arp([523, 523, 523, 659, 784, 1047], 0.13, 0.45, 0.17); arp([131, 196, 262], 0.26, 1, 0.12, 'sine'); },
  firework: () => { nz(0.5, 0.2, 'bandpass', 2400, 0.6, 0, 600); tone(160, 60, 0.3, 0.2); },
};

export function sfx(name, a, b) {
  if (!ac || ac.state !== 'running') return;
  try { SFX[name]?.(a, b); } catch (e) { /* 没有音频也不影响游戏 */ }
}

// ---------- 环境声：鸟鸣、虫鸣、风、水下闷声 ----------
let nextBird = 0, nextBug = 0;
export function ambient(day, underwater, wind, quiet = false) {
  if (!ac || ac.state !== 'running') return;
  const t = ac.currentTime;
  lowpass.frequency.setTargetAtTime(underwater ? 520 : 20000, t, 0.08);
  windGain.gain.setTargetAtTime(0.012 + 0.11 * Math.min(1, wind), t, 0.4);
  if (underwater || quiet) return;
  if (day > 0.6 && t > nextBird) {
    nextBird = t + 2.5 + R() * 7;
    const f0 = 2300 + R() * 1700, pan = R() * 1.6 - 0.8, n = 2 + Math.floor(R() * 4), v = 0.018 + R() * 0.02;
    for (let i = 0; i < n; i++) {
      const up = R() > 0.4, f = f0 * (0.9 + R() * 0.25);
      tone(f, f * (up ? 1.25 : 0.8), 0.06 + R() * 0.05, v, 'sine', i * (0.09 + R() * 0.05), sfxBus, pan);
    }
  }
  if (day < 0.25 && t > nextBug) {
    nextBug = t + 0.7 + R() * 1.6;
    const pan = R() * 1.6 - 0.8, f = 4100 + R() * 500;
    for (let i = 0; i < 3; i++) tone(f, f, 0.035, 0.012, 'sine', i * 0.065, sfxBus, pan);
  }
}

// ---------- 背景音乐：按和弦进行即兴生成，每种模式一种情绪 ----------
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const PENTA = [57, 60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84];
const CH = {
  C: [36, 60, 64, 67, 71], Am: [33, 57, 60, 64, 67], F: [29, 57, 60, 65, 69], G: [31, 55, 59, 62, 67],
  Dm: [38, 57, 62, 65, 69], Em: [28, 55, 59, 64, 67],
};
const MOODS = {
  // 自由模式：舒缓的钢琴与长音铺底
  calm: { bpm: 66, bars: 2, prog: [['C', 'Am', 'F', 'G'], ['F', 'C', 'Dm', 'G'], ['Am', 'F', 'C', 'Em']] },
  night: { bpm: 58, bars: 2, prog: [['Am', 'F', 'C', 'Em'], ['Dm', 'Am', 'F', 'Em']] },
  // 建造模式：轻快的木琴小调
  cozy: { bpm: 96, bars: 1, prog: [['F', 'C', 'G', 'Am'], ['F', 'C', 'Dm', 'G'], ['C', 'Am', 'F', 'G']] },
  // 闯关模式：有鼓点的琶音
  drive: { bpm: 124, bars: 1, prog: [['Am', 'F', 'C', 'G'], ['Am', 'F', 'C', 'G'], ['Dm', 'F', 'C', 'G'], ['F', 'G', 'Am', 'Am']] },
};

function piano(t, m, vol, dur = 1.8) {
  const f = hz(m), g = ac.createGain(), fl = ac.createBiquadFilter();
  fl.type = 'lowpass'; fl.frequency.setValueAtTime(Math.min(6000, f * 6), t); fl.frequency.exponentialRampToValueAtTime(f * 1.5, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(vol * 0.35, t + 0.25); g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
  for (const [mul, type, amp] of [[1, 'triangle', 1], [2, 'sine', 0.35], [3, 'sine', 0.12]]) {
    const o = ac.createOscillator(), og = ac.createGain();
    o.type = type; o.frequency.value = f * mul; og.gain.value = amp;
    o.connect(og).connect(fl); o.start(t); o.stop(t + dur + 0.05);
  }
  fl.connect(g); g.connect(musBus); g.connect(revSend);
}
function pad(t, notes, dur, vol) {
  const g = ac.createGain(), fl = ac.createBiquadFilter();
  fl.type = 'lowpass'; fl.frequency.value = 900;
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.35);
  g.gain.linearRampToValueAtTime(vol * 0.7, t + dur * 0.8); g.gain.linearRampToValueAtTime(0.0001, t + dur + 1.2);
  for (const m of notes) for (const det of [-5, 6]) {
    const o = ac.createOscillator();
    o.type = 'triangle'; o.frequency.value = hz(m); o.detune.value = det;
    o.connect(fl); o.start(t); o.stop(t + dur + 1.3);
  }
  fl.connect(g); g.connect(musBus); g.connect(revSend);
}
function pluck(t, m, vol, dur = 0.4, type = 'sine') {
  const f = hz(m), g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
  const o = ac.createOscillator(); o.type = type; o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + dur + 0.03);
  const o2 = ac.createOscillator(), g2 = ac.createGain();
  o2.frequency.value = f * 4; g2.gain.setValueAtTime(0.3, t); g2.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.3);
  o2.connect(g2).connect(g); o2.start(t); o2.stop(t + dur);
  g.connect(musBus); g.connect(revSend);
}
function bass(t, m, vol, dur) {
  const g = ac.createGain(), fl = ac.createBiquadFilter(), o = ac.createOscillator();
  fl.type = 'lowpass'; fl.frequency.value = 420;
  o.type = 'triangle'; o.frequency.value = hz(m);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(fl).connect(g).connect(musBus); o.start(t); o.stop(t + dur + 0.03);
}
function lead(t, m, vol, dur) {
  const g = ac.createGain(), fl = ac.createBiquadFilter(), o = ac.createOscillator();
  fl.type = 'lowpass'; fl.frequency.value = 2200;
  o.type = 'square'; o.frequency.value = hz(m);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(fl).connect(g); g.connect(musBus); g.connect(revSend); o.start(t); o.stop(t + dur + 0.03);
}
function drum(t, kind, vol) {
  if (kind === 'kick') {
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g).connect(musBus); o.start(t); o.stop(t + 0.22);
    return;
  }
  const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf;
  const dur = kind === 'hat' ? 0.04 : kind === 'shaker' ? 0.07 : 0.14;
  fl.type = kind === 'snare' ? 'bandpass' : 'highpass'; fl.frequency.value = kind === 'snare' ? 1900 : kind === 'shaker' ? 5200 : 7500;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(fl).connect(g).connect(musBus); s.start(t, R() * 1.5, dur + 0.02);
}

const mus = { mood: null, want: 'calm', step: 0, next: 0, cycle: 0, prog: null, motif: null, motifB: null, deg: 5, rest: false };

// 生成一段旋律动机：在五声音阶上小步游走
function makeMotif(len, grid, density) {
  const out = new Array(len).fill(-1);
  let d = 4 + Math.floor(R() * 4);
  for (let i = 0; i < len; i += grid) {
    const strong = i % (grid * 4) === 0;
    if (R() > (strong ? density + 0.3 : density)) continue;
    d += [-2, -1, -1, 0, 1, 1, 2, 3, -3][Math.floor(R() * 9)];
    d = Math.max(1, Math.min(PENTA.length - 2, d));
    out[i] = d;
  }
  return out;
}
// 强拍上的音尽量落在和弦音上
function fit(deg, chord) {
  const ok = (d) => chord.slice(1).some((c) => (c - PENTA[d]) % 12 === 0);
  for (const o of [0, 1, -1, 2, -2]) { const d = deg + o; if (d >= 0 && d < PENTA.length && ok(d)) return PENTA[d]; }
  return PENTA[deg];
}

export function setMood(name) { mus.want = name; }

function tickMusic() {
  if (!ac || ac.state !== 'running') return;
  if (mus.next < ac.currentTime - 0.5) mus.next = ac.currentTime + 0.1;
  while (mus.next < ac.currentTime + 0.3) {
    if (mus.step % 16 === 0 && mus.want !== mus.mood) { mus.mood = mus.want; mus.step = 0; mus.cycle = 0; mus.motif = null; }
    const M = MOODS[mus.mood] || MOODS.calm;
    const sd = 60 / M.bpm / 4, chordLen = 16 * M.bars, cycLen = chordLen * 4;
    const s = mus.step % cycLen;
    if (s === 0) {
      mus.prog = M.prog[mus.cycle % M.prog.length];
      const calm = mus.mood === 'calm' || mus.mood === 'night';
      if (!mus.motif || mus.cycle % 2 === 0) {
        mus.motif = calm ? makeMotif(32, 2, 0.34) : makeMotif(32, 2, mus.mood === 'cozy' ? 0.5 : 0.55);
        mus.motifB = calm ? makeMotif(32, 2, 0.26) : makeMotif(32, 2, 0.6);
      }
      mus.rest = calm && mus.cycle % 4 === 3;
      mus.cycle++;
    }
    const ci = Math.floor(s / chordLen), chord = CH[mus.prog[ci]], cs = s % chordLen, t = mus.next;
    const mot = (ci === 2 ? mus.motifB : mus.motif)[s % 32];
    const note = mot < 0 ? 0 : cs % 8 === 0 ? fit(mot, chord) : PENTA[mot];

    if (mus.mood === 'calm' || mus.mood === 'night') {
      if (cs === 0) { pad(t, chord.slice(1, 4), sd * chordLen, 0.035); bass(t, chord[0] + 12, 0.13, sd * 14); }
      if (cs === 16) bass(t, chord[0] + 19, 0.07, sd * 10);
      if (note && !mus.rest) {
        piano(t + R() * 0.012, note, 0.1 + R() * 0.05, 2.4);
        if (R() < 0.18) piano(t + sd * 2, note + 12, 0.05, 2);
      }
      if (cs === 8 && R() < 0.5) piano(t, chord[1 + Math.floor(R() * 3)] - 12, 0.06, 2.6);
    } else if (mus.mood === 'cozy') {
      if (cs === 0 || cs === 8) { bass(t, chord[0] + 12, 0.2, sd * 5); drum(t, 'kick', 0.16); }
      if (cs === 6 || cs === 14) bass(t, chord[0] + 19, 0.12, sd * 3);
      if (cs === 4 || cs === 12) { pluck(t, chord[2], 0.05, 0.3, 'triangle'); pluck(t, chord[3], 0.05, 0.3, 'triangle'); }
      if (cs % 2 === 0) drum(t, 'shaker', cs % 4 === 2 ? 0.035 : 0.014);
      if (cs === 0 && ci === 0) pad(t, chord.slice(1, 4), sd * 64, 0.014);
      if (note) pluck(t, note + 12, 0.12 + R() * 0.04, 0.55);
    } else {
      if (cs % 4 === 0) drum(t, 'kick', 0.26);
      if (cs % 8 === 4) drum(t, 'snare', 0.1);
      if (cs % 2 === 0) drum(t, 'hat', cs % 4 === 2 ? 0.05 : 0.022);
      if (cs % 2 === 0) bass(t, chord[0] + (cs % 8 === 6 ? 24 : 12), 0.2, sd * 1.8);
      const up = [1, 2, 3, 2, 1, 2, 3, 4][cs % 8];
      pluck(t, chord[up] + (cs % 16 >= 8 ? 12 : 0), 0.035, 0.16, 'triangle');
      if (note && mus.cycle % 4 !== 1) lead(t, note + 12, 0.045, sd * 3);
    }
    mus.next += sd; mus.step++;
  }
}
