// 方块奇境 —— 主程序
import * as THREE from 'three';
import { B, DEFS, AT, buildAtlas, blockIcon } from './blocks.js';
import { World, SEA } from './world.js';
import { Player } from './player.js';
import { Sky } from './sky.js';
import { Entities } from './entities.js';
import { UI } from './ui.js';
import { sfx, unlock, ambient, setMood, setVolume, settings } from './audio.js';
import { FreeMode } from './modes.js';
import { BuildMode } from './build.js';
import { StageMode, LEVELS, buildLevel, loadProgress, levelOpen } from './stage.js';

const SAVE = { free: 'block-wonderland-save-v1', build: 'block-wonderland-build-v1' };
const MODE_KEY = 'block-wonderland-mode-v1';
const VIEW = 7;          // 可视距离（区块）
const DAY_SECONDS = 600; // 一昼夜 10 分钟
const FREE_HOTBAR = [B.GRASS, B.DIRT, B.STONE, B.PLANKS, B.LOG, B.BRICK, B.COBBLE, B.ROOF, B.FLOWER_R];
const $ = (id) => document.getElementById(id);

// ---------- 渲染器 ----------
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.autoClear = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.08, 700);

const atlas = buildAtlas();
const tex = new THREE.CanvasTexture(atlas.canvas);
tex.magFilter = THREE.NearestFilter;
tex.minFilter = THREE.NearestMipmapLinearFilter;
tex.colorSpace = THREE.SRGBColorSpace;

const uTime = { value: 0 };
// 花草随风摆动：方块内越高的顶点摆得越多（整块的树叶顶点都在整数高度，不会动）
const plantMat = new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, alphaTest: 0.4 });
plantMat.onBeforeCompile = (s) => {
  s.uniforms.uTime = uTime;
  s.vertexShader = 'uniform float uTime;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    float sw = fract(position.y); sw *= step(0.05, sw);
    vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
    transformed.x += sin(uTime * 1.7 + wp.x * 0.9 + wp.z * 0.6) * 0.07 * sw;
    transformed.z += cos(uTime * 1.3 + wp.x * 0.5 + wp.z * 1.1) * 0.05 * sw;`);
};
// 水面：轻微起伏 + 流动的波光
const waterMat = new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
waterMat.onBeforeCompile = (s) => {
  s.uniforms.uTime = uTime;
  s.vertexShader = 'uniform float uTime;\nvarying vec3 vWp;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    vec3 wp0 = (modelMatrix * vec4(position, 1.0)).xyz;
    float wtop = step(0.5, fract(position.y));
    transformed.y += (sin(uTime * 1.6 + wp0.x * 0.8) + cos(uTime * 1.2 + wp0.z * 0.7)) * 0.035 * wtop;
    vWp = wp0;`);
  s.fragmentShader = 'uniform float uTime;\nvarying vec3 vWp;\n' + s.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
    float wv = sin(vWp.x * 1.3 + uTime * 1.1) * sin(vWp.z * 1.7 - uTime * 0.9) + sin((vWp.x + vWp.z) * 0.6 + uTime * 0.7);
    diffuseColor.rgb += vec3(0.025, 0.045, 0.06) * wv;
    float glint = smoothstep(1.8, 2.15, wv + sin(vWp.x * 5.1 - uTime * 2.0) * sin(vWp.z * 4.3 + uTime * 1.6) * 0.6);
    diffuseColor.rgb += vec3(0.22) * glint;
    diffuseColor.a = min(1.0, diffuseColor.a + glint * 0.25);`);
};
const materials = [
  new THREE.MeshLambertMaterial({ map: tex, vertexColors: true }),
  plantMat,
  new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
  new THREE.MeshBasicMaterial({ map: tex, vertexColors: true }),
  waterMat,
];

// ---------- 游戏对象 ----------
const game = {
  scene, camera, atlas,
  active: false, panel: null, started: false, noSave: false,
  mode: null, modeObj: null, rules: { fly: true, mobs: true, infinite: true, timeFlow: true },
  seed: 0, time: 0.38, crystals: new Set(), hotbar: [...FREE_HOTBAR], slot: 0, stats: { placed: 0, broken: 0 }, inv: {},

  count(id) { return this.rules.infinite ? 1e9 : (this.inv[id] || 0); },
  give(id, n = 1, quiet = false) {
    if (this.rules.infinite || !id) return;
    this.inv[id] = (this.inv[id] || 0) + n;
    if (!this.hotbar.includes(id)) { const e = this.hotbar.indexOf(0); if (e >= 0) this.hotbar[e] = id; }
    if (!quiet) { this.ui.renderHotbar(); updateHand(); }
  },
  take(id, n = 1) {
    if (this.rules.infinite) return;
    this.inv[id] = Math.max(0, (this.inv[id] || 0) - n);
    if (!this.inv[id]) delete this.inv[id];
    this.ui.renderHotbar(); updateHand();
  },

  setSlot(i) { this.slot = i; this.ui.renderHotbar(); updateHand(); },

  collectCrystal(id) {
    this.crystals.add(id);
    sfx('crystal');
    this.modeObj.onCrystal(id);
    this.save();
  },

  openPanel(name) {
    this.panel = name;
    $(name).classList.remove('hidden');
    sfx('open');
    document.exitPointerLock();
  },
  closePanel(relock = true) {
    if (!this.panel) return;
    $(this.panel).classList.add('hidden');
    this.panel = null;
    sfx('close');
    if (relock) lock(); else showMenu();
  },

  showResult(r) {
    $('res-title').textContent = `第 ${r.index + 1} 关 · ${r.name}`;
    $('res-stars').innerHTML = [1, 2, 3].map((i) => `<span class="${i <= r.stars ? 'on' : ''}" style="animation-delay:${i * 0.25}s">★</span>`).join('');
    $('res-info').innerHTML = `用时 <b>${r.time}</b>${r.newBest ? ' <span class="ok">新纪录！</span>' : ''} <span class="dim">（三星 ${r.par} 内）</span><br>星晶 <b>${r.got}/${r.total}</b> · 掉落 ${r.falls} 次`;
    $('res-next').classList.toggle('hidden', !r.hasNext);
    $('res-next').onclick = () => { hidePanels(); enter('stage', { index: r.index + 1 }); };
    $('res-retry').onclick = () => { hidePanels(); enter('stage', { index: r.index }); };
    $('res-list').onclick = () => { this.closePanel(false); showStages(); };
    this.openPanel('result');
  },

  save() {
    if (this.noSave || !this.modeObj || this.mode === 'stage' || !loaded) return;
    const e = {};
    for (const [k, m] of this.world.edits) { const a = []; for (const [i, id] of m) a.push(i, id); e[k] = a; }
    const p = this.player;
    try {
      localStorage.setItem(SAVE[this.mode], JSON.stringify({
        seed: this.seed, edits: e, time: this.time, crystals: [...this.crystals], hotbar: this.hotbar, slot: this.slot, stats: this.stats, inv: this.inv,
        p: [p.pos.x, p.pos.y, p.pos.z, p.yaw, p.pitch, p.fly ? 1 : 0],
        ...this.modeObj.serialize(),
      }));
    } catch (err) { console.warn('存档失败', err); }
  },
};
window.game = game;

let loaded = false;
game.ui = new UI(game);
game.player = new Player(game);
game.sky = new Sky(scene, VIEW);
game.ents = new Entities(game);
const pl = game.player;

function hidePanels() {
  for (const id of ['palette', 'bpanel', 'result']) $(id).classList.add('hidden');
  game.panel = null;
}

// ---------- 切换模式 / 载入世界 ----------
function loadMode(mode, arg = {}) {
  if (game.modeObj) {
    game.save();
    game.modeObj.dispose();
    game.world.dispose();
    game.ents.reset();
    hidePanels();
  }
  loaded = false;
  if (arg.fresh) localStorage.removeItem(SAVE[mode]);
  let save = null;
  if (mode !== 'stage') { try { save = JSON.parse(localStorage.getItem(SAVE[mode])); } catch (e) { save = null; } }
  const edits = new Map();
  if (save?.edits) for (const k in save.edits) {
    const a = save.edits[k], m = new Map();
    for (let i = 0; i < a.length; i += 2) m.set(a[i], a[i + 1]);
    edits.set(Number(k), m);
  }
  Object.assign(game, {
    mode, seed: save?.seed ?? Math.floor(Math.random() * 1e9),
    time: save?.time ?? 0.38, crystals: new Set(save?.crystals ?? []),
    hotbar: save?.hotbar ?? [...FREE_HOTBAR], slot: save?.slot ?? 0,
    stats: save?.stats ?? { placed: 0, broken: 0 }, inv: save?.inv ?? {},
  });
  const level = mode === 'stage' ? buildLevel(arg.index) : null;
  game.world = new World(game.seed, scene, materials, edits, VIEW, level?.custom ?? null);
  game.modeObj = mode === 'build' ? new BuildMode(game, save) : mode === 'stage' ? new StageMode(game, arg.index, level) : new FreeMode(game);
  game.rules = game.modeObj.rules;

  // 出生点
  const sp = game.modeObj.spawn();
  pl.fly = false; pl.pitch = 0;
  if (sp) pl.teleport(sp.x, sp.y, sp.z, sp.yaw);
  else if (save?.p) { pl.teleport(save.p[0], save.p[1], save.p[2]); pl.yaw = save.p[3]; pl.pitch = save.p[4]; pl.fly = !!save.p[5] && game.rules.fly; }
  else {
    pl.teleport(0.5, 60, 0.5, 0);
    for (let i = 0; i < 400; i++) {
      const x = i * 7, z = i * 3, h = game.world.height(x, z);
      if (h > SEA + 2 && h < 44) { pl.teleport(x + 0.5, h + 1.01, z + 0.5, 0); break; }
    }
  }
  if (mode !== 'stage') localStorage.setItem(MODE_KEY, mode);
  $('loading').classList.remove('gone');
  $('hint-b').classList.toggle('hidden', mode !== 'build');
  setMood(game.modeObj.music);
  game.ui.renderHotbar();
  updateHand();
}

// 灯光池：离玩家最近的几盏暖光灯会真的发光，稍远的只画光晕
const lampLights = [];
for (let i = 0; i < 4; i++) {
  const l = new THREE.PointLight(0xffb866, 0, 15, 1.5);
  scene.add(l); lampLights.push(l);
}
function updateLamps() {
  const p = pl.pos, pcx = Math.floor(p.x) >> 4, pcz = Math.floor(p.z) >> 4, all = [];
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
    const c = game.world.getChunk(pcx + dx, pcz + dz);
    if (c) for (const l of c.lamps) all.push([(l[0] - p.x) ** 2 + (l[1] - p.y) ** 2 + (l[2] - p.z) ** 2, l]);
  }
  all.sort((a, b) => a[0] - b[0]);
  lampLights.forEach((l, i) => {
    if (all[i]) { l.position.set(...all[i][1]); l.intensity = 9; } else l.intensity = 0;
  });
  game.ents.setHalos(all.slice(0, 14).map((a) => a[1]), 1 - game.sky.dayF);
}

// ---------- 手持方块 ----------
const handScene = new THREE.Scene();
const handCam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.01, 10);
const handAmb = new THREE.AmbientLight(0xffffff, 1.5), handSun = new THREE.DirectionalLight(0xffffff, 2);
handSun.position.set(-1, 2, 1.5);
handScene.add(handAmb, handSun);
const handMat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide });
const hand = new THREE.Mesh(new THREE.BoxGeometry(), handMat);
handScene.add(hand);

function blockGeometry(id) {
  const def = DEFS[id];
  const g = def.flat ? new THREE.PlaneGeometry(1, 1) : new THREE.BoxGeometry(1, 1, 1);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const f = i >> 2, t = def.flat ? (def.icon ?? def.tiles[1]) : def.tiles[f === 2 ? 0 : f === 3 ? 2 : 1];
    const u = 0.02 + 0.96 * uv.getX(i), v = 0.02 + 0.96 * uv.getY(i);
    uv.setXY(i, ((t % AT) + u) / AT, 1 - (Math.floor(t / AT) + 1 - v) / AT);
  }
  return g;
}
function updateHand() {
  const id = game.hotbar[game.slot];
  hand.visible = !!id && game.count(id) > 0;
  if (!hand.visible) return;
  hand.geometry.dispose();
  hand.geometry = blockGeometry(id);
}

// ---------- 菜单与指针锁定 ----------
function showMenu() {
  $('menu').classList.remove('hidden');
  $('m-main').classList.remove('hidden');
  $('m-stages').classList.add('hidden');
  const r = $('btn-resume');
  r.classList.toggle('hidden', !game.started);
  r.textContent = `继续 · ${game.modeObj.name}${game.mode === 'stage' ? `（第 ${game.modeObj.index + 1} 关）` : ''}`;
  const prog = loadProgress(), stars = prog.stars.reduce((a, b) => a + (b || 0), 0);
  $('st-free').textContent = localStorage.getItem(SAVE.free) ? '已有存档 · 点击继续' : '点击开始新世界';
  $('st-build').textContent = localStorage.getItem(SAVE.build) ? '已有小镇 · 点击继续经营' : '点击开始开荒';
  $('st-stage').textContent = `${prog.stars.filter((s) => s > 0).length}/${LEVELS.length} 关 · ★ ${stars}/${LEVELS.length * 3}`;
}
function showStages() {
  $('menu').classList.remove('hidden');
  $('m-main').classList.add('hidden');
  $('m-stages').classList.remove('hidden');
  const prog = loadProgress();
  $('stage-grid').innerHTML = LEVELS.map((L, i) => {
    const open = levelOpen(prog, i), s = prog.stars[i] || 0;
    return `<div class="lv${open ? '' : ' locked'}" data-i="${i}"><div class="num">${open ? i + 1 : '🔒'}</div><b>${L.name}</b>` +
      `<div class="stars">${[1, 2, 3].map((k) => `<span class="${k <= s ? 'on' : ''}">★</span>`).join('')}</div>` +
      `<span class="dim">${prog.best[i] ? '最佳 ' + prog.best[i] + ' 秒' : open ? '未通关' : '通关上一关解锁'}</span></div>`;
  }).join('');
}
function lock() {
  try {
    const r = canvas.requestPointerLock();
    if (r && r.catch) r.catch(() => showMenu());
  } catch (e) { showMenu(); }
}
function enter(mode, arg) {
  unlock();
  sfx('click');
  if (game.mode !== mode || arg) loadMode(mode, arg || {});
  game.started = true;
  lock();
}

$('btn-resume').onclick = () => { unlock(); sfx('click'); lock(); };
for (const el of document.querySelectorAll('.mode')) {
  el.onclick = () => { if (el.dataset.mode === 'stage') { unlock(); sfx('click'); showStages(); } else enter(el.dataset.mode); };
}
for (const el of document.querySelectorAll('.reset')) {
  el.onclick = (e) => {
    e.stopPropagation();
    const m = el.dataset.mode;
    if (!confirm(m === 'free' ? '要创建一个全新的世界吗？当前自由模式的建筑和进度会被清除。' : '要重新开荒吗？现在的小镇、金币和背包都会被清除。')) return;
    if (game.mode === m) { game.noSave = true; game.modeObj.dispose(); game.world.dispose(); game.ents.reset(); game.modeObj = null; game.noSave = false; }
    enter(m, { fresh: true });
  };
}
$('stage-grid').onclick = (e) => {
  const el = e.target.closest('.lv');
  if (!el) return;
  if (el.classList.contains('locked')) { sfx('error'); return; }
  enter('stage', { index: +el.dataset.i });
};
$('btn-back').onclick = () => { sfx('close'); showMenu(); };
$('btn-help').onclick = () => { sfx('click'); $('help').classList.toggle('hidden'); };
for (const kind of ['music', 'sfx']) {
  const el = $('v-' + kind);
  el.value = Math.round(settings[kind] * 100);
  el.oninput = () => { unlock(); setVolume(kind, el.value / 100); };
  el.onchange = () => sfx('pick');
}
// 模式卡片上的小图标
$('ic-free').src = blockIcon(atlas.canvas, B.GRASS);
$('ic-build').src = blockIcon(atlas.canvas, B.BRICK);
$('ic-stage').src = blockIcon(atlas.canvas, B.BOUNCE);

document.addEventListener('pointerlockchange', () => {
  game.active = document.pointerLockElement === canvas;
  if (game.active) $('menu').classList.add('hidden');
  else { pl.keys.clear(); pl.btn.fill(false); game.save(); if (!game.panel) showMenu(); }
});
document.addEventListener('pointerlockerror', () => { if (!game.panel) showMenu(); });
addEventListener('keydown', (e) => {
  if (e.code === 'KeyE') {
    if (game.panel === 'palette') game.closePanel();
    else if (game.active) { game.ui.renderPalette(); game.openPanel('palette'); }
  } else if (e.code === 'KeyB' && game.mode === 'build') {
    if (game.panel === 'bpanel') game.closePanel();
    else if (game.active) { game.modeObj.cancelPlacing(); game.modeObj.renderPanel(); game.openPanel('bpanel'); }
  } else if (e.code === 'Escape' && game.panel) game.closePanel(false);
  else if (e.code === 'KeyM') {
    unlock(); setVolume('mute', !settings.mute);
    game.ui.toast(settings.mute ? '已静音（按 M 恢复）' : '声音已开启');
  }
});
addEventListener('beforeunload', () => game.save());
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = handCam.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix(); handCam.updateProjectionMatrix();
});

// 先载入上次玩的世界当作菜单背景
loadMode(localStorage.getItem(MODE_KEY) === 'build' ? 'build' : 'free');
showMenu();

// ---------- 主循环 ----------
let last = performance.now(), hudT = 0, lampT = 0, saveT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  uTime.value += dt;

  game.world.pump(pl.pos.x, pl.pos.z, loaded ? 2 : 8, loaded ? 2 : 6);
  const ready = game.world.ready(pl.pos.x, pl.pos.z);
  if (ready && !loaded) {
    loaded = true;
    while (pl.collides(pl.pos.x, pl.pos.y, pl.pos.z) && pl.pos.y < 94) pl.pos.y += 1; // 防止出生在方块里
    $('loading').classList.add('gone');
    game.modeObj.start();
  }
  // 闯关模式暂停时不计时也不下落
  const paused = game.mode === 'stage' && !game.active;
  if (ready && !paused) {
    pl.update(dt);
    game.modeObj.update(dt);
    game.ents.update(dt);
    if (game.rules.timeFlow) game.time = (game.time + dt / DAY_SECONDS) % 1;
  } else {
    camera.position.set(pl.pos.x, pl.pos.y + 1.62, pl.pos.z);
    camera.rotation.set(pl.pitch, pl.yaw, 0, 'YXZ');
  }

  const fov = 75 + (pl.speedFov ? 9 : 0);
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 8); camera.updateProjectionMatrix(); }
  game.sky.update(dt, camera, game.time, pl.headInWater);
  $('water').style.display = pl.headInWater ? 'block' : 'none';

  if ((hudT -= dt) <= 0) { hudT = 0.2; game.ui.updateHud(); }
  if ((lampT -= dt) <= 0) {
    lampT = 0.25;
    updateLamps();
    const day = game.sky.dayF, sp = Math.hypot(pl.vel.x, pl.vel.y, pl.vel.z);
    ambient(day, pl.headInWater, Math.max(0, (pl.pos.y - 42) / 45) + sp / 26);
    setMood(game.mode === 'free' ? (day < 0.3 ? 'night' : 'calm') : game.modeObj.music);
  }
  if ((saveT += dt) > 15) { saveT = 0; game.save(); }

  // 手持方块的摆动
  const sw = Math.sin(pl.swing * Math.PI);
  const bob = pl.onGround ? Math.sin(now * 0.008) * Math.min(1, Math.hypot(pl.vel.x, pl.vel.z) / 4.4) * 0.025 : 0;
  hand.position.set(0.62 - sw * 0.12, -0.52 + bob - sw * 0.12 - pl.dip * 0.5, -1.25 - sw * 0.15);
  hand.rotation.set(0.18 - sw * 0.7, 0.62, 0);
  hand.scale.setScalar(0.42);
  const lf = 0.3 + 0.7 * game.sky.dayF;
  handAmb.intensity = 1.5 * lf; handSun.intensity = 2 * lf;

  renderer.clear();
  renderer.render(scene, camera);
  renderer.clearDepth();
  renderer.render(handScene, handCam);
}
requestAnimationFrame(frame);
