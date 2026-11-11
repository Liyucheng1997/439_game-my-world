// 建造模式：把荒野经营成团子小镇 —— 采集、加工、按蓝图盖房、收租、接委托、升级
import * as THREE from 'three';
import { B, DEFS } from './blocks.js';
import { CH } from './world.js';
import { sfx } from './audio.js';
import { Mode, arrowTo, posLine } from './modes.js';

const $ = (id) => document.getElementById(id);
const K = (x, y, z) => x + ',' + y + ',' + z;
const WHITE = B.COLOR0, RED = B.COLOR0 + 1, YELLOW = B.COLOR0 + 3, BLUE = B.COLOR0 + 6;

// ---------- 蓝图 ----------
function mk(fn) {
  const m = new Map();
  const set = (x, y, z, id) => { if (id) m.set(K(x, y, z), [x, y, z, id]); else m.delete(K(x, y, z)); };
  const fill = (x0, y0, z0, x1, y1, z1, id) => {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) set(x, y, z, id);
  };
  const ring = (x0, y, z0, x1, z1, id, corner) => {
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue;
      set(x, y, z, corner && (x === x0 || x === x1) && (z === z0 || z === z1) ? corner : id);
    }
  };
  fn({ set, fill, ring });
  let cells = [...m.values()], x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, h = 0;
  for (const c of cells) { x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); z0 = Math.min(z0, c[2]); z1 = Math.max(z1, c[2]); h = Math.max(h, c[1] + 1); }
  const cx = Math.floor((x0 + x1) / 2), cz = Math.floor((z0 + z1) / 2);
  cells = cells.map(([x, y, z, id]) => [x - cx, y, z - cz, id]).sort((a, b) => a[1] - b[1]);
  const mats = {};
  for (const c of cells) mats[c[3]] = (mats[c[3]] || 0) + 1;
  return { cells, h, mats, total: cells.length };
}

const BLUEPRINTS = [
  { id: 'cabin', name: '小木屋', desc: '团子们的第一个家', lv: 1, pop: 2, income: 8, pros: 10, reward: 60, ...mk(({ set, fill, ring }) => {
    fill(0, 0, 0, 4, 0, 3, B.COBBLE);
    ring(0, 1, 0, 4, 3, B.PLANKS, B.LOG); ring(0, 2, 0, 4, 3, B.PLANKS, B.LOG);
    set(2, 1, 0, 0); set(2, 2, 0, 0); set(0, 2, 1, B.GLASS); set(4, 2, 2, B.GLASS);
    fill(0, 3, 0, 4, 3, 3, B.ROOF); fill(1, 4, 1, 3, 4, 2, B.ROOF);
  }) },
  { id: 'lamp', name: '路灯', desc: '点亮夜晚的小路', lv: 1, pop: 0, income: 0, pros: 2, reward: 10, ...mk(({ set }) => {
    set(0, 0, 0, B.COBBLE); set(0, 1, 0, B.FENCE); set(0, 2, 0, B.FENCE); set(0, 3, 0, B.LANTERN);
  }) },
  { id: 'garden', name: '花圃', desc: '围上栅栏的小花园', lv: 1, pop: 0, income: 3, pros: 8, reward: 40, ...mk(({ set, fill, ring }) => {
    fill(0, 0, 0, 4, 0, 4, B.GRASS);
    ring(0, 1, 0, 4, 4, B.FENCE); set(2, 1, 0, 0);
    set(1, 1, 1, B.FLOWER_R); set(3, 1, 1, B.FLOWER_Y); set(1, 1, 3, B.FLOWER_B); set(3, 1, 3, B.FLOWER_R);
    set(2, 1, 1, B.FLOWER_Y); set(1, 1, 2, B.FLOWER_B); set(3, 1, 2, B.FLOWER_R); set(2, 1, 3, B.FLOWER_Y);
    set(2, 1, 2, B.FENCE); set(2, 2, 2, B.LANTERN);
  }) },
  { id: 'well', name: '水井', desc: '清凉的井水，居民更安心', lv: 2, pop: 0, income: 4, pros: 10, reward: 60, ...mk(({ set, fill, ring }) => {
    fill(0, 0, 0, 2, 0, 2, B.COBBLE); set(1, 0, 1, B.WATER);
    ring(0, 1, 0, 2, 2, B.COBBLE);
    for (const x of [0, 2]) { set(x, 2, 1, B.FENCE); set(x, 3, 1, B.FENCE); }
    fill(0, 4, 0, 2, 4, 2, B.ROOF);
  }) },
  { id: 'bakery', name: '面包店', desc: '每天早上飘出香味', lv: 2, pop: 2, income: 20, pros: 22, reward: 130, ...mk(({ set, fill, ring }) => {
    fill(0, 0, 0, 6, 0, 4, B.PLANKS);
    for (let y = 1; y <= 3; y++) ring(0, y, 0, 6, 4, B.BRICK, B.STONEBRICK);
    set(3, 1, 0, 0); set(3, 2, 0, 0);
    set(1, 2, 0, B.GLASS); set(5, 2, 0, B.GLASS); set(0, 2, 2, B.GLASS); set(6, 2, 2, B.GLASS);
    fill(0, 4, 0, 6, 4, 4, B.ROOF); fill(1, 5, 1, 5, 5, 3, B.ROOF);
    set(5, 5, 3, B.BRICK); set(5, 6, 3, B.BRICK); set(5, 7, 3, B.BRICK);
    set(1, 1, 3, B.HAY); set(2, 1, 3, B.BOOKSHELF); set(3, 3, 2, B.LANTERN);
  }) },
  { id: 'tower', name: '瞭望塔', desc: '登高望远，守护小镇', lv: 3, pop: 1, income: 12, pros: 25, reward: 150, ...mk(({ set, fill, ring }) => {
    fill(0, 0, 0, 2, 0, 2, B.STONEBRICK);
    for (let y = 1; y <= 6; y++) ring(0, y, 0, 2, 2, B.STONEBRICK);
    set(1, 1, 0, 0); set(1, 2, 0, 0); set(1, 4, 2, B.GLASS); set(0, 5, 1, B.GLASS); set(2, 5, 1, B.GLASS);
    fill(-1, 7, -1, 3, 7, 3, B.PLANKS); set(1, 7, 1, 0);
    ring(-1, 8, -1, 3, 3, B.FENCE);
    for (const [x, z] of [[-1, -1], [3, -1], [-1, 3], [3, 3]]) { set(x, 9, z, B.FENCE); set(x, 10, z, B.LANTERN); }
  }) },
  { id: 'windmill', name: '风车', desc: '磨面粉的大风车', lv: 3, pop: 1, income: 28, pros: 30, reward: 180, ...mk(({ set, fill, ring }) => {
    fill(0, 0, 0, 2, 0, 2, B.COBBLE);
    for (let y = 1; y <= 6; y++) ring(0, y, 0, 2, 2, y % 2 ? WHITE : B.PLANKS);
    set(1, 1, 2, 0); set(1, 2, 2, 0);
    fill(0, 7, 0, 2, 7, 2, B.ROOF); set(1, 8, 1, B.ROOF);
    set(1, 5, -1, B.LOG);
    for (let k = 1; k <= 3; k++) { set(1 + k, 5, -1, B.PLANKS); set(1 - k, 5, -1, B.PLANKS); set(1, 5 + k, -1, B.PLANKS); set(1, 5 - k, -1, B.PLANKS); }
    set(4, 6, -1, WHITE); set(-2, 4, -1, WHITE); set(0, 8, -1, WHITE); set(2, 2, -1, WHITE);
  }) },
  { id: 'market', name: '集市', desc: '三个彩色小摊，客人络绎不绝', lv: 4, pop: 3, income: 45, pros: 32, reward: 220, ...mk(({ set, fill }) => {
    fill(0, 0, 0, 10, 0, 2, B.PATH);
    [[RED, B.HAY], [YELLOW, B.BOOKSHELF], [BLUE, B.HAY]].forEach(([col, goods], i) => {
      const x = i * 4;
      for (const [dx, dz] of [[0, 0], [2, 0], [0, 2], [2, 2]]) { set(x + dx, 1, dz, B.FENCE); set(x + dx, 2, dz, B.FENCE); }
      for (let dx = 0; dx <= 2; dx++) for (let dz = 0; dz <= 2; dz++) set(x + dx, 3, dz, dx === 1 ? WHITE : col);
      set(x + 1, 1, 2, goods);
    });
  }) },
  { id: 'lighthouse', name: '灯塔', desc: '红白相间，夜里为远方指路', lv: 4, pop: 1, income: 30, pros: 40, reward: 260, ...mk(({ set, fill, ring }) => {
    fill(-1, 0, -1, 3, 0, 3, B.COBBLE);
    for (let y = 1; y <= 9; y++) ring(0, y, 0, 2, 2, Math.floor((y - 1) / 2) % 2 ? WHITE : RED);
    set(1, 1, 0, 0); set(1, 2, 0, 0);
    fill(-1, 10, -1, 3, 10, 3, B.STONEBRICK);
    ring(0, 11, 0, 2, 2, B.GLASS); set(1, 11, 1, B.LAMP);
    fill(0, 12, 0, 2, 12, 2, B.ROOF); set(1, 13, 1, B.ROOF);
  }) },
  { id: 'star', name: '星晶塔', desc: '小镇的心脏：用星晶点亮整片奇境', lv: 5, pop: 0, income: 100, pros: 80, reward: 600, ...mk(({ set, fill, ring }) => {
    fill(0, 0, 0, 6, 0, 6, B.STONEBRICK);
    ring(1, 1, 1, 5, 5, B.STONEBRICK);
    for (const [x, z] of [[1, 1], [5, 1], [1, 5], [5, 5]]) { for (let y = 2; y <= 5; y++) set(x, y, z, B.STONEBRICK); set(x, 7, z, B.STARBLOCK); }
    ring(1, 6, 1, 5, 5, B.STONEBRICK);
    for (let y = 1; y <= 7; y++) set(3, y, 3, B.GLASS);
    set(3, 8, 3, B.STARBLOCK);
    for (const [x, z] of [[3, 1], [1, 3], [5, 3], [3, 5]]) set(x, 7, z, B.LANTERN);
  }) },
];
const BP = Object.fromEntries(BLUEPRINTS.map((b) => [b.id, b]));

const LEVELS = [
  { need: 0, name: '荒野营地' }, { need: 12, name: '小小村落' }, { need: 40, name: '热闹村庄' },
  { need: 90, name: '繁荣小镇' }, { need: 160, name: '奇境之城' },
];

// 商店：[方块, 单价, 解锁等级]
const SHOP = [
  [B.PLANKS, 2, 1], [B.LOG, 4, 1], [B.COBBLE, 2, 1], [B.ROOF, 3, 1], [B.GLASS, 4, 1], [B.FENCE, 3, 1], [B.LANTERN, 12, 1],
  [B.GRASS, 1, 1], [B.FLOWER_R, 3, 1], [B.FLOWER_Y, 3, 1], [B.FLOWER_B, 3, 1],
  [B.BRICK, 3, 2], [B.STONEBRICK, 3, 2], [B.WATER, 2, 2], [B.HAY, 5, 2], [B.BOOKSHELF, 8, 2], [B.PATH, 2, 2],
  [WHITE, 4, 3], [RED, 4, 3], [B.SANDSTONE, 3, 3], [B.BOUNCE, 20, 3],
  [YELLOW, 4, 4], [BLUE, 4, 4], [B.COLOR0 + 4, 4, 4], [B.COLOR0 + 8, 4, 4], [B.LAMP, 15, 4], [B.SPEED, 25, 4],
];

// 加工：{ in: [[方块, 数量]...], out: [方块, 数量] }；in 里的 'star' 表示星晶
const RECIPES = [
  { in: [[B.LOG, 1]], out: [B.PLANKS, 4] }, { in: [[B.BIRCH, 1]], out: [B.PLANKS, 4] },
  { in: [[B.PLANKS, 2]], out: [B.FENCE, 3] }, { in: [[B.STONE, 1]], out: [B.COBBLE, 1] },
  { in: [[B.STONE, 1]], out: [B.STONEBRICK, 1] }, { in: [[B.COBBLE, 1]], out: [B.PATH, 1] },
  { in: [[B.SAND, 1]], out: [B.GLASS, 1] }, { in: [[B.DIRT, 1]], out: [B.BRICK, 1] }, { in: [[B.DIRT, 1]], out: [B.ROOF, 1] },
  { in: [[B.TALLGRASS, 3]], out: [B.HAY, 1] }, { in: [[B.GLASS, 1], [B.PLANKS, 1]], out: [B.LANTERN, 1] },
  { in: [[B.PLANKS, 3]], out: [B.BOOKSHELF, 1] }, { in: [['star', 1]], out: [B.STARBLOCK, 1] },
];

// 委托：[方块, 最少, 最多, 单件报酬, 解锁等级]
const ORDER_POOL = [
  [B.LOG, 4, 8, 7, 1], [B.PLANKS, 8, 16, 3, 1], [B.DIRT, 6, 12, 3, 1], [B.SAND, 5, 10, 4, 1], [B.STONE, 6, 12, 4, 1],
  [B.TALLGRASS, 4, 8, 4, 1], [B.FLOWER_R, 3, 5, 8, 1], [B.FLOWER_Y, 3, 5, 8, 1], [B.FLOWER_B, 3, 5, 8, 1],
  [B.MUSHROOM, 2, 4, 14, 2], [B.BRICK, 6, 12, 6, 2], [B.GLASS, 4, 8, 8, 2], [B.HAY, 2, 4, 18, 2],
  [B.CACTUS, 2, 4, 20, 3], [B.SNOW, 6, 10, 6, 3], [B.BOOKSHELF, 2, 3, 22, 3], [B.LANTERN, 2, 4, 20, 3],
];
const NAMES = ['糯米', '豆沙', '芝麻', '抹茶', '奶黄', '红豆', '桂花', '椰蓉'];

const rot = (x, z, r) => (r === 0 ? [x, z] : r === 1 ? [-z, x] : r === 2 ? [-x, -z] : [z, -x]);

export class BuildMode extends Mode {
  constructor(game, save) {
    super(game);
    this.name = '建造模式';
    this.music = 'cozy';
    this.rules = { fly: true, mobs: true, infinite: false, timeFlow: true };
    const s = save?.build;
    this.coins = s?.coins ?? 80;
    this.stars = s?.stars ?? 0;
    this.sites = (s?.sites ?? []).map((o) => ({ ...o }));
    this.orders = s?.orders ?? [];
    this.orderT = s?.orderT ?? 20;
    this.won = s?.won ?? false;
    this.tab = 'bp';
    this.placing = null;   // 正在选址的蓝图 { bp, r, mesh, ok, x, y, z }
    this.scanT = 0; this.pulse = 0; this.near = null;
    if (!s) {
      game.inv = { [B.COBBLE]: 20, [B.PLANKS]: 16, [B.LOG]: 8, [B.GLASS]: 2, [B.ROOF]: 12 };
      game.hotbar = [B.COBBLE, B.PLANKS, B.LOG, B.ROOF, B.GLASS, 0, 0, 0, 0];
    }
    this.ghostGeo = new THREE.BoxGeometry(1, 1, 1);
    this.ghostMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.4, depthWrite: false });
    this.prevMat = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.3, depthWrite: false });
    for (const site of this.sites) this._prep(site);
    $('bpanel').onclick = (e) => this._panelClick(e);
  }

  start() {
    this._homes();
    if (!this.sites.length) this.g.ui.toast('欢迎来到荒野！按 B 打开建造手册，盖起第一间小木屋');
  }

  // ---------- 数值 ----------
  get pros() { return this.sites.reduce((n, s) => n + (s.done ? BP[s.bp].pros : 0), 0); }
  get pop() { return this.sites.reduce((n, s) => n + (s.done ? BP[s.bp].pop : 0), 0); }
  get income() { return this.sites.reduce((n, s) => n + (s.done ? BP[s.bp].income : 0), 0); }
  get level() { const p = this.pros; let l = 1; LEVELS.forEach((L, i) => { if (p >= L.need) l = i + 1; }); return l; }

  unlocked(id) { return this.g.count(id) > 0; }

  // ---------- 工地 ----------
  _prep(site) {
    const bp = BP[site.bp];
    site.cells = bp.cells.map(([x, y, z, id]) => { const [rx, rz] = rot(x, z, site.r); return [site.x + rx, site.y + y, site.z + rz, id]; });
    site.map = new Map(site.cells.map((c) => [K(c[0], c[1], c[2]), c[3]]));
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const c of site.cells) { x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); z0 = Math.min(z0, c[2]); z1 = Math.max(z1, c[2]); }
    Object.assign(site, { x0, x1, z0, z1, missing: bp.total, need: {} });
    if (!site.done) {
      site.mesh = new THREE.InstancedMesh(this.ghostGeo, this.ghostMat, bp.total);
      site.mesh.frustumCulled = false; site.mesh.count = 0; site.mesh.renderOrder = 3;
      this.g.scene.add(site.mesh);
    }
  }

  _refresh(site) {
    if (site.done) return;
    const w = this.g.world, avg = this.g.atlas.avg, mt = new THREE.Matrix4(), col = new THREE.Color();
    let n = 0, missing = 0;
    const need = {};
    for (const [x, y, z, id] of site.cells) {
      if (!w.getChunk(x >> 4, z >> 4)) return;
      const cur = w.getBlock(x, y, z);
      if (cur === id) continue;
      missing++; need[id] = (need[id] || 0) + 1;
      const wrong = cur !== 0 && !DEFS[cur].plant && !DEFS[cur].liquid;
      const s = wrong ? 1.04 : 0.86;
      mt.makeScale(s, s, s).setPosition(x + 0.5, y + 0.5, z + 0.5);
      site.mesh.setMatrixAt(n, mt);
      const c = wrong ? [255, 70, 70] : avg[DEFS[id].icon ?? DEFS[id].tiles[1]];
      site.mesh.setColorAt(n, col.setRGB(Math.min(1, c[0] / 200), Math.min(1, c[1] / 200), Math.min(1, c[2] / 200), THREE.SRGBColorSpace));
      n++;
    }
    site.mesh.count = n;
    site.mesh.instanceMatrix.needsUpdate = true;
    if (site.mesh.instanceColor) site.mesh.instanceColor.needsUpdate = true;
    site.missing = missing; site.need = need;
    if (missing === 0) this._complete(site);
  }

  _touch(x, z) {
    for (const s of this.sites) if (!s.done && x >= s.x0 - 1 && x <= s.x1 + 1 && z >= s.z0 - 1 && z <= s.z1 + 1) this._refresh(s);
  }

  _complete(site) {
    const g = this.g, bp = BP[site.bp], before = this.level;
    site.done = true;
    g.scene.remove(site.mesh); site.mesh.dispose(); site.mesh = null;
    this.coins += bp.reward;
    sfx('built'); sfx('firework');
    g.ents.firework(site.x + 0.5, site.y + bp.h, site.z + 0.5);
    g.ui.toast(`🎉「${bp.name}」落成！奖励 ${bp.reward} 金币，繁荣度 +${bp.pros}`);
    if (bp.pop) g.ui.toast(`${bp.pop} 只团子搬进了新家`);
    const lv = this.level;
    if (lv > before) {
      sfx('levelup');
      const got = BLUEPRINTS.filter((b) => b.lv === lv).map((b) => b.name);
      g.ui.toast(`✨ 小镇升级为「${LEVELS[lv - 1].name}」！${got.length ? '新蓝图：' + got.join('、') : ''}`);
    }
    if (bp.id === 'star' && !this.won) {
      this.won = true;
      sfx('clear');
      for (let i = 0; i < 4; i++) setTimeout(() => g.ents.firework(site.x + 0.5, site.y + bp.h + 2, site.z + 0.5), 600 + i * 700);
      g.ui.toast('🌟 星晶塔点亮了！你把荒野变成了奇境之城，小镇可以继续扩建');
    }
    this._homes();
    g.save();
  }

  _homes() {
    const homes = [];
    for (const s of this.sites) if (s.done) for (let i = 0; i < BP[s.bp].pop; i++) homes.push({ x: s.x + 0.5, y: s.y, z: s.z + 0.5 });
    const old = this.g.ents.homes;
    homes.forEach((h, i) => { if (old[i] && old[i].x === h.x && old[i].z === h.z) h.mob = old[i].mob; });
    this.g.ents.homes = homes;
  }

  // ---------- 选址 ----------
  beginPlacing(id) {
    this.cancelPlacing();
    const bp = BP[id];
    const mesh = new THREE.InstancedMesh(this.ghostGeo, this.prevMat, bp.total);
    mesh.frustumCulled = false; mesh.renderOrder = 3;
    this.g.scene.add(mesh);
    this.placing = { bp, r: 0, mesh, ok: false, x: 0, y: 0, z: 0 };
    this._shapePreview();
    this.g.ui.toast(`选址「${bp.name}」：左键确认 · R 旋转 · 右键取消`);
  }

  _shapePreview() {
    const P = this.placing, mt = new THREE.Matrix4();
    P.bp.cells.forEach(([x, y, z], i) => {
      const [rx, rz] = rot(x, z, P.r);
      P.mesh.setMatrixAt(i, mt.makeScale(0.9, 0.9, 0.9).setPosition(rx + 0.5, y + 0.5, rz + 0.5));
    });
    P.mesh.instanceMatrix.needsUpdate = true;
  }

  cancelPlacing() {
    if (!this.placing) return;
    this.g.scene.remove(this.placing.mesh); this.placing.mesh.dispose();
    this.placing = null;
  }

  _confirm() {
    const P = this.placing, g = this.g, w = g.world;
    if (!P.ok) { sfx('error'); g.ui.toast('这里放不下，换个地方试试'); return; }
    const site = { bp: P.bp.id, x: P.x, y: P.y, z: P.z, r: P.r, done: false };
    this.cancelPlacing();
    this._prep(site);
    // 整地：清掉占位的东西（回收进背包），把地基垫平
    let got = 0;
    for (let x = site.x0; x <= site.x1; x++) for (let z = site.z0; z <= site.z1; z++) {
      for (let y = site.y + P.bp.h + 1; y >= site.y; y--) {
        const cur = w.getBlock(x, y, z);
        if (!cur || cur === B.BEDROCK || cur === site.map.get(K(x, y, z))) continue;
        w.setBlock(x, y, z, 0, true);
        if (!DEFS[cur].liquid) { g.give(cur, 1, true); got++; }
      }
      for (let y = site.y - 1; y > site.y - 7 && y > 0; y--) {
        if (DEFS[w.getBlock(x, y, z)].solid) break;
        w.setBlock(x, y, z, B.DIRT, true);
      }
    }
    this.sites.push(site);
    this._refresh(site);
    sfx('blueprint');
    g.ui.renderHotbar();
    g.ui.toast(`工地已划好${got ? `，清理场地回收了 ${got} 个方块` : ''}。对着发光的虚影按住右键盖起来`);
    g.save();
  }

  click(button) {
    if (!this.placing) return false;
    if (button === 0) this._confirm(); else { this.cancelPlacing(); this.g.ui.toast('已取消选址'); }
    return true;
  }

  key(code) {
    if (code === 'KeyR' && this.placing) { this.placing.r = (this.placing.r + 1) % 4; this._shapePreview(); sfx('click'); return true; }
    return false;
  }

  // ---------- 放置 / 破坏 ----------
  placeId(x, y, z) {
    const g = this.g;
    for (const s of this.sites) {
      if (s.done) continue;
      const want = s.map.get(K(x, y, z));
      if (!want) continue;
      if (g.count(want) > 0) return want;
      g.ui.toast(`缺少「${DEFS[want].name}」：去采集、加工或到商店买（按 B）`);
      sfx('error');
      return 0;
    }
    const id = g.hotbar[g.slot];
    if (!id) return 0;
    if (g.count(id) <= 0) { g.ui.toast(`「${DEFS[id].name}」用完了`); return 0; }
    return id;
  }

  onPlace(x, y, z, id) { this.g.take(id, 1); this._touch(x, z); }

  canBreak(h) { return true; }

  onBreak(h) { this.g.give(h.id, 1); this._touch(h.x, h.z); }

  onCrystal() {
    this.stars++; this.coins += 40;
    sfx('coin');
    this.g.ui.toast(`✦ 获得星晶！金币 +40（星晶可以在「加工」里做成星晶块）`);
  }

  // ---------- 每帧 ----------
  update(dt) {
    const g = this.g, p = g.player;
    this.coins += this.income * dt / 60;
    this.pulse += dt;
    this.ghostMat.opacity = 0.34 + 0.12 * Math.sin(this.pulse * 3);

    if ((this.scanT -= dt) <= 0) {
      this.scanT = 1;
      let best = null, bd = 1e9;
      for (const s of this.sites) {
        if (s.done) continue;
        this._refresh(s);
        if (s.done) continue;
        const d = Math.hypot(s.x - p.pos.x, s.z - p.pos.z);
        if (d < bd) { bd = d; best = s; }
      }
      this.near = best;
    }

    if ((this.orderT -= dt) <= 0) {
      this.orderT = 50 + Math.random() * 40;
      if (this.orders.length < 3) {
        const pool = ORDER_POOL.filter((o) => o[4] <= this.level && !this.orders.some((x) => x.item === o[0]));
        const o = pool[Math.floor(Math.random() * pool.length)];
        if (o) {
          const qty = o[1] + Math.floor(Math.random() * (o[2] - o[1] + 1));
          this.orders.push({ item: o[0], qty, reward: Math.ceil(qty * o[3] * 1.2 / 5) * 5, who: NAMES[Math.floor(Math.random() * NAMES.length)] });
          sfx('order');
          g.ui.toast(`📮 新委托：团子「${this.orders[this.orders.length - 1].who}」想要 ${qty} 个${DEFS[o[0]].name}（按 B 查看）`);
        }
      }
    }

    const P = this.placing;
    if (P) {
      const h = p.hit, w = g.world;
      P.mesh.visible = !!h;
      if (h) {
        // 蓝图落在地面上：对准花草、树叶、树干时往下找到真正的地面
        let gy = h.y;
        while (gy > 2 && (!DEFS[w.getBlock(h.x, gy, h.z)].solid || [B.LEAVES, B.BIRCHLEAVES, B.PINELEAVES, B.LOG, B.BIRCH, B.CACTUS].includes(w.getBlock(h.x, gy, h.z)))) gy--;
        P.x = h.x; P.z = h.z; P.y = gy;
        P.mesh.position.set(P.x, P.y, P.z);
        let ok = P.y >= 2 && P.y + P.bp.h < CH - 1;
        let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
        for (const [x, , z] of P.bp.cells) {
          const [rx, rz] = rot(x, z, P.r);
          x0 = Math.min(x0, P.x + rx); x1 = Math.max(x1, P.x + rx); z0 = Math.min(z0, P.z + rz); z1 = Math.max(z1, P.z + rz);
        }
        if (!w.getChunk(x0 >> 4, z0 >> 4) || !w.getChunk(x1 >> 4, z1 >> 4)) ok = false;
        for (const s of this.sites) if (x0 <= s.x1 && x1 >= s.x0 && z0 <= s.z1 && z1 >= s.z0) ok = false;
        P.ok = ok;
        this.prevMat.color.set(ok ? 0x9fe8ff : 0xff6a6a);
      } else P.ok = false;
    }
  }

  // ---------- 界面 ----------
  hud() {
    const g = this.g, lv = this.level, pros = this.pros, next = LEVELS[lv];
    const main = `<b class="gold">● ${Math.floor(this.coins)}</b> 金币 <span class="dim">+${this.income}/分</span> · 居民 <b>${this.pop}</b> · <b>✦ ${this.stars}</b><br>` +
      `Lv${lv} ${LEVELS[lv - 1].name}${next ? ` <span class="dim">· 繁荣度 ${pros}/${next.need}</span>` : ` <span class="dim">· 繁荣度 ${pros}</span>`}<br>${posLine(g)}`;

    let side = '<h4>小镇目标</h4>';
    const base = LEVELS[lv - 1].need;
    if (next) side += `<div class="bar"><i style="width:${Math.min(100, (pros - base) / (next.need - base) * 100)}%"></i></div>`;
    const doneAny = this.sites.some((s) => s.done), s = this.near;
    if (this.placing) side += `<p>▸ 把「${this.placing.bp.name}」的蓝图对准一块空地<br><span class="dim">左键确认 · R 旋转 · 右键取消</span></p>`;
    else if (s && !s.done) {
      const bp = BP[s.bp];
      side += `<p>▸ 工地「${bp.name}」 <b>${bp.total - s.missing}/${bp.total}</b> ${arrowTo(g, s.x, s.z)} ${Math.round(Math.hypot(s.x - g.player.pos.x, s.z - g.player.pos.z))} 米</p>`;
      side += '<p class="mats">' + Object.entries(s.need).map(([id, n]) => {
        const have = g.count(+id);
        return `<span class="${have >= n ? 'ok' : 'lack'}">${DEFS[id].name} ${Math.min(have, n)}/${n}</span>`;
      }).join('') + '</p>';
      side += '<p class="dim">对着虚影按住右键自动放对应方块</p>';
    } else if (!doneAny) side += '<p>▸ 按 <kbd>B</kbd> 打开建造手册，选「小木屋」开工</p>';
    else if (next) side += `<p>▸ 再攒 ${next.need - pros} 点繁荣度升级为「${next.name}」<br><span class="dim">按 B 选新的蓝图开工</span></p>`;
    else if (!this.won) side += '<p>▸ 最终目标：建成「星晶塔」<br><span class="dim">需要 5 颗星晶，跟着光柱去找</span></p>';
    else side += '<p>▸ 奇境之城已建成，自由扩建吧</p>';
    const ready = this.orders.filter((o) => g.count(o.item) >= o.qty).length;
    if (this.orders.length) side += `<p class="dim">📮 委托 ${this.orders.length} 个${ready ? `，<span class="ok">${ready} 个可交付</span>` : ''}</p>`;
    return [main, side];
  }

  palette() {
    const g = this.g, ids = Object.keys(g.inv).map(Number).filter((id) => g.inv[id] > 0);
    return {
      title: '背包',
      tip: ids.length ? '点击方块放进当前选中的快捷栏格子 · 挖到的方块都会进背包 · 按 E 或 Esc 关闭' : '背包是空的：去挖点方块，或者按 B 到商店看看',
      items: ids.map((id) => ({ id, ok: true, sub: '×' + g.inv[id] })),
    };
  }

  _mats(mats) {
    const g = this.g;
    return Object.entries(mats).map(([id, n]) => `<span class="${g.count(+id) >= n ? 'ok' : 'lack'}">${DEFS[id].name}×${n}</span>`).join(' ');
  }

  renderPanel() {
    const g = this.g, lv = this.level, icon = (id) => `<img src="${g.ui.icon(id)}">`;
    const tabs = [['bp', '蓝图'], ['shop', '商店'], ['craft', '加工'], ['order', `委托${this.orders.length ? ' ' + this.orders.length : ''}`]];
    $('btabs').innerHTML = tabs.map(([k, n]) => `<button class="tab${this.tab === k ? ' on' : ''}" data-act="tab:${k}">${n}</button>`).join('') +
      `<span class="wallet"><b class="gold">● ${Math.floor(this.coins)}</b> 金币 · ✦ ${this.stars} · Lv${lv} ${LEVELS[lv - 1].name}</span>`;
    let h = '';
    if (this.tab === 'bp') {
      const act = this.sites.map((s, i) => [s, i]).filter(([s]) => !s.done);
      if (act.length) h += '<div class="sec">进行中的工地</div>' + act.map(([s, i]) =>
        `<div class="row"><div class="grow"><b>${BP[s.bp].name}</b> <span class="dim">${BP[s.bp].total - s.missing}/${BP[s.bp].total}</span><div class="mats">${this._mats(s.need)}</div></div><button class="mini ghost" data-act="cancel:${i}">取消工地</button></div>`).join('');
      h += '<div class="sec">蓝图</div><div class="cards">' + BLUEPRINTS.map((b) => {
        const lock = b.lv > lv, cnt = this.sites.filter((s) => s.done && s.bp === b.id).length;
        return `<div class="bp${lock ? ' locked' : ''}"><div class="t"><b>${b.name}</b>${cnt ? ` <span class="dim">已建 ${cnt}</span>` : ''}</div>` +
          `<div class="dim">${b.desc}</div><div class="stat">繁荣 +${b.pros}${b.pop ? ` · 居民 +${b.pop}` : ''}${b.income ? ` · 收入 +${b.income}/分` : ''} · 奖励 ${b.reward}</div>` +
          `<div class="mats">${this._mats(b.mats)}</div>` +
          (lock ? `<div class="lockmsg">Lv${b.lv}「${LEVELS[b.lv - 1].name}」解锁</div>` : `<button class="mini" data-act="bp:${b.id}">选址开工</button>`) + '</div>';
      }).join('') + '</div>';
    } else if (this.tab === 'shop') {
      h += '<div class="grid">' + SHOP.map(([id, price, need]) => {
        if (need > lv) return `<div class="item locked">${icon(id)}${DEFS[id].name}<br><span>Lv${need}</span></div>`;
        return `<div class="item shop">${icon(id)}${DEFS[id].name} <span class="dim">×${g.count(id)}</span><br>` +
          `<button class="mini" data-act="buy:${id}:1"${this.coins < price ? ' disabled' : ''}>● ${price}</button>` +
          `<button class="mini" data-act="buy:${id}:10"${this.coins < price * 10 ? ' disabled' : ''}>×10</button></div>`;
      }).join('') + '</div>';
    } else if (this.tab === 'craft') {
      const have = (k) => (k === 'star' ? this.stars : g.count(k)), nm = (k) => (k === 'star' ? '星晶' : DEFS[k].name);
      h += RECIPES.map((r, i) => {
        const can = Math.min(...r.in.map(([k, n]) => Math.floor(have(k) / n)));
        return `<div class="row"><div class="grow">${r.in.map(([k, n]) => `<span class="${have(k) >= n ? 'ok' : 'lack'}">${nm(k)}×${n}</span>`).join(' + ')}` +
          ` → ${icon(r.out[0])}<b>${DEFS[r.out[0]].name}×${r.out[1]}</b> <span class="dim">现有 ${g.count(r.out[0])}</span></div>` +
          `<button class="mini" data-act="craft:${i}:1"${can < 1 ? ' disabled' : ''}>加工</button>` +
          `<button class="mini ghost" data-act="craft:${i}:${Math.max(1, can)}"${can < 2 ? ' disabled' : ''}>全部 ×${can}</button></div>`;
      }).join('');
    } else {
      h += this.orders.length ? this.orders.map((o, i) => {
        const have = g.count(o.item), ok = have >= o.qty;
        return `<div class="row">${icon(o.item)}<div class="grow"><b>团子「${o.who}」</b>想要 ${DEFS[o.item].name}×${o.qty} <span class="${ok ? 'ok' : 'lack'}">（有 ${have}）</span><br><span class="dim">报酬 ● ${o.reward}</span></div>` +
          `<button class="mini" data-act="deliver:${i}"${ok ? '' : ' disabled'}>交付</button><button class="mini ghost" data-act="skip:${i}">婉拒</button></div>`;
      }).join('') : '<p class="dim">暂时没有委托，团子们过一会儿会来找你。</p>';
      h += '<p class="dim">完成委托能赚金币；居民越多、小镇等级越高，委托也越值钱。</p>';
    }
    $('bbody').innerHTML = h;
  }

  _panelClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const g = this.g, [act, a, b] = el.dataset.act.split(':');
    if (act === 'tab') { this.tab = a; sfx('click'); }
    else if (act === 'bp') {
      if (this.sites.filter((s) => !s.done).length >= 3) { sfx('error'); g.ui.toast('同时最多 3 个工地，先盖完一个吧'); return; }
      sfx('click'); g.closePanel(); this.beginPlacing(a); return;
    } else if (act === 'cancel') {
      const s = this.sites[+a];
      if (s && !s.done) { g.scene.remove(s.mesh); s.mesh.dispose(); this.sites.splice(+a, 1); this.near = null; sfx('close'); }
    } else if (act === 'buy') {
      const item = SHOP.find((s) => s[0] === +a), cost = item[1] * +b;
      if (this.coins < cost) { sfx('error'); return; }
      this.coins -= cost; g.give(+a, +b); sfx('coin');
    } else if (act === 'craft') {
      const r = RECIPES[+a];
      for (let i = 0; i < +b; i++) {
        if (!r.in.every(([k, n]) => (k === 'star' ? this.stars : g.count(k)) >= n)) break;
        for (const [k, n] of r.in) { if (k === 'star') this.stars -= n; else g.take(k, n); }
        g.give(r.out[0], r.out[1]);
      }
      sfx('craft');
    } else if (act === 'deliver') {
      const o = this.orders[+a];
      if (!o || g.count(o.item) < o.qty) return;
      g.take(o.item, o.qty); this.coins += o.reward; this.orders.splice(+a, 1);
      sfx('coin'); g.ui.toast(`团子「${o.who}」很开心！金币 +${o.reward}`);
    } else if (act === 'skip') { this.orders.splice(+a, 1); sfx('close'); }
    this.renderPanel();
    g.ui.renderHotbar();
  }

  serialize() {
    return { build: {
      coins: this.coins, stars: this.stars, orders: this.orders, orderT: this.orderT, won: this.won,
      sites: this.sites.map(({ bp, x, y, z, r, done }) => ({ bp, x, y, z, r, done })),
    } };
  }

  dispose() {
    this.cancelPlacing();
    for (const s of this.sites) if (s.mesh) { this.g.scene.remove(s.mesh); s.mesh.dispose(); }
    this.ghostGeo.dispose(); this.ghostMat.dispose(); this.prevMat.dispose();
    $('bpanel').onclick = null;
  }
}
