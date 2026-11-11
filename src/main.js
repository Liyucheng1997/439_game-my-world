// 方块奇境 —— 主程序
import * as THREE from 'three';
import { B, DEFS, PALETTE, AT, buildAtlas } from './blocks.js';
import { World, SEA } from './world.js';
import { Player } from './player.js';
import { Sky } from './sky.js';
import { Entities } from './entities.js';
import { UI } from './ui.js';
import { sfx } from './audio.js';

const SAVE_KEY = 'block-wonderland-save-v1';
const VIEW = 7;          // 可视距离（区块）
const DAY_SECONDS = 600; // 一昼夜 10 分钟
const $ = (id) => document.getElementById(id);

// ---------- 读档 ----------
let save = null;
try { save = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { save = null; }
const seed = save?.seed ?? Math.floor(Math.random() * 1e9);
const edits = new Map();
if (save?.edits) for (const k in save.edits) {
  const a = save.edits[k], m = new Map();
  for (let i = 0; i < a.length; i += 2) m.set(a[i], a[i + 1]);
  edits.set(Number(k), m);
}

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
const materials = [
  new THREE.MeshLambertMaterial({ map: tex, vertexColors: true }),
  new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, alphaTest: 0.4 }),
  new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
  new THREE.MeshBasicMaterial({ map: tex, vertexColors: true }),
];

// ---------- 游戏对象 ----------
const game = {
  scene, camera, atlas, seed,
  active: false, paletteOpen: false, noSave: false,
  time: save?.time ?? 0.38,
  crystals: new Set(save?.crystals ?? []),
  hotbar: save?.hotbar ?? [B.GRASS, B.DIRT, B.STONE, B.PLANKS, B.LOG, B.BRICK, B.COBBLE, B.ROOF, B.FLOWER_R],
  slot: save?.slot ?? 0,
  stats: save?.stats ?? { placed: 0, broken: 0 },

  unlocked(id) { return DEFS[id].unlock <= this.crystals.size; },

  setSlot(i) { this.slot = i; this.ui.renderHotbar(); updateHand(); },

  collectCrystal(id) {
    this.crystals.add(id);
    const n = this.crystals.size;
    sfx('crystal');
    this.ui.toast(`✦ 获得星晶！（共 ${n} 颗）`);
    const got = PALETTE.filter((b) => DEFS[b].unlock === n).map((b) => DEFS[b].name);
    if (got.length) { sfx('unlock'); this.ui.toast(`解锁新方块：${got.length > 3 ? got.slice(0, 3).join('、') + ' 等 ' + got.length + ' 种' : got.join('、')}（按 E 查看）`); }
    this.save();
  },

  openPalette() {
    this.paletteOpen = true;
    this.ui.renderPalette();
    $('palette').classList.remove('hidden');
    document.exitPointerLock();
  },
  closePalette(relock = true) {
    this.paletteOpen = false;
    $('palette').classList.add('hidden');
    if (relock) lock(); else showMenu();
  },

  save() {
    if (this.noSave) return;
    const e = {};
    for (const [k, m] of this.world.edits) { const a = []; for (const [i, id] of m) a.push(i, id); e[k] = a; }
    const p = this.player;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        seed, edits: e, time: this.time, crystals: [...this.crystals], hotbar: this.hotbar, slot: this.slot, stats: this.stats,
        p: [p.pos.x, p.pos.y, p.pos.z, p.yaw, p.pitch, p.fly ? 1 : 0],
      }));
    } catch (err) { console.warn('存档失败', err); }
  },
};
window.game = game;

game.world = new World(seed, scene, materials, edits, VIEW);
game.ui = new UI(game);
game.player = new Player(game);
game.sky = new Sky(scene, VIEW);
game.ents = new Entities(game);

// 出生点
const pl = game.player;
if (save?.p) {
  pl.pos.set(save.p[0], save.p[1], save.p[2]); pl.yaw = save.p[3]; pl.pitch = save.p[4]; pl.fly = !!save.p[5];
} else {
  for (let i = 0; i < 400; i++) {
    const x = i * 7, z = i * 3, h = game.world.height(x, z);
    if (h > SEA + 2 && h < 44) { pl.pos.set(x + 0.5, h + 1.01, z + 0.5); break; }
  }
}

// 灯光池：离玩家最近的几盏暖光灯会真的发光
const lampLights = [];
for (let i = 0; i < 4; i++) {
  const l = new THREE.PointLight(0xffb866, 0, 15, 1.5);
  scene.add(l); lampLights.push(l);
}
function updateLamps() {
  const p = pl.pos, pcx = Math.floor(p.x) >> 4, pcz = Math.floor(p.z) >> 4, all = [];
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    const c = game.world.getChunk(pcx + dx, pcz + dz);
    if (c) for (const l of c.lamps) all.push([(l[0] - p.x) ** 2 + (l[1] - p.y) ** 2 + (l[2] - p.z) ** 2, l]);
  }
  all.sort((a, b) => a[0] - b[0]);
  lampLights.forEach((l, i) => {
    if (all[i]) { l.position.set(...all[i][1]); l.intensity = 9; } else l.intensity = 0;
  });
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
  const g = def.plant ? new THREE.PlaneGeometry(1, 1) : new THREE.BoxGeometry(1, 1, 1);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const f = i >> 2, t = def.plant ? def.tiles[1] : def.tiles[f === 2 ? 0 : f === 3 ? 2 : 1];
    const u = 0.02 + 0.96 * uv.getX(i), v = 0.02 + 0.96 * uv.getY(i);
    uv.setXY(i, ((t % AT) + u) / AT, 1 - (Math.floor(t / AT) + 1 - v) / AT);
  }
  return g;
}
function updateHand() {
  const id = game.hotbar[game.slot];
  hand.visible = !!id;
  if (!id) return;
  hand.geometry.dispose();
  hand.geometry = blockGeometry(id);
}

// ---------- 菜单与指针锁定 ----------
function showMenu() {
  $('menu').classList.remove('hidden');
  $('btn-play').textContent = '继续游戏';
}
function lock() {
  try {
    const r = canvas.requestPointerLock();
    if (r && r.catch) r.catch(() => showMenu());
  } catch (e) { showMenu(); }
}
$('btn-play').onclick = () => { sfx('pick'); lock(); };
$('btn-new').onclick = () => {
  if (!confirm('要创建一个全新的世界吗？当前世界的建筑和进度会被清除。')) return;
  game.noSave = true;
  localStorage.removeItem(SAVE_KEY);
  location.reload();
};
if (save) $('btn-play').textContent = '继续游戏';

document.addEventListener('pointerlockchange', () => {
  game.active = document.pointerLockElement === canvas;
  if (game.active) $('menu').classList.add('hidden');
  else { pl.keys.clear(); pl.btn.fill(false); game.save(); if (!game.paletteOpen) showMenu(); }
});
document.addEventListener('pointerlockerror', () => { if (!game.paletteOpen) showMenu(); });
addEventListener('keydown', (e) => {
  if (e.code === 'KeyE') { if (game.paletteOpen) game.closePalette(); else if (game.active) game.openPalette(); }
  else if (e.code === 'Escape' && game.paletteOpen) game.closePalette(false);
});
addEventListener('beforeunload', () => game.save());
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = handCam.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix(); handCam.updateProjectionMatrix();
});

game.ui.renderHotbar();
updateHand();

// ---------- 主循环 ----------
let last = performance.now(), hudT = 0, lampT = 0, saveT = 0, loaded = false;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  game.world.pump(pl.pos.x, pl.pos.z, loaded ? 2 : 8, loaded ? 2 : 6);
  const ready = game.world.ready(pl.pos.x, pl.pos.z);
  if (ready && !loaded) {
    loaded = true;
    while (pl.collides(pl.pos.x, pl.pos.y, pl.pos.z) && pl.pos.y < 94) pl.pos.y += 1; // 防止出生在方块里
    const el = $('loading');
    el.style.opacity = 0;
    setTimeout(() => el.remove(), 700);
  }
  if (ready) {
    pl.update(dt);
    game.ents.update(dt);
    game.time = (game.time + dt / DAY_SECONDS) % 1;
  } else {
    camera.position.set(pl.pos.x, pl.pos.y + 1.62, pl.pos.z);
    camera.rotation.set(pl.pitch, pl.yaw, 0, 'YXZ');
  }

  const fov = 75 + (pl.speedFov ? 9 : 0);
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 8); camera.updateProjectionMatrix(); }
  game.sky.update(dt, camera, game.time, pl.headInWater);
  $('water').style.display = pl.headInWater ? 'block' : 'none';

  if ((hudT -= dt) <= 0) { hudT = 0.2; game.ui.updateHud(); }
  if ((lampT -= dt) <= 0) { lampT = 0.25; updateLamps(); }
  if ((saveT += dt) > 15) { saveT = 0; if (loaded) game.save(); }

  // 手持方块的摆动
  const sw = Math.sin(pl.swing * Math.PI);
  const bob = pl.onGround ? Math.sin(now * 0.008) * Math.min(1, Math.hypot(pl.vel.x, pl.vel.z) / 4.4) * 0.025 : 0;
  hand.position.set(0.62 - sw * 0.12, -0.52 + bob - sw * 0.12, -1.25 - sw * 0.15);
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
