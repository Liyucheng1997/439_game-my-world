// 闯关模式：漂在海上的空岛跑酷 —— 弹跳、疾跑、碎裂块、冰面、搭桥，集齐星晶冲向终点
import { B, DEFS } from './blocks.js';
import { ckey, CH } from './world.js';
import { hash2 } from './noise.js';
import { sfx } from './audio.js';
import { Mode } from './modes.js';

const PROG_KEY = 'block-wonderland-stages-v1';
const K = (x, y, z) => x + ',' + y + ',' + z;
const G = B.GRASS, ICE = B.ICE, BO = B.BOUNCE, SP = B.SPEED, CR = B.CRUMBLE, KB = B.COBBLE;

// 关卡"画笔"：像海龟作图一样一路往前铺平台
class Course {
  constructor(y = 34) {
    this.cells = new Map();
    this.x = 0; this.z = 0; this.y = y; this.dx = 0; this.dz = -1;
    this.stars = []; this.minY = y; this.path = [];
    this.c = { x: 0, z: 0 }; this.end = { x: 0, z: 0 }; this.hw = 1;
  }
  set(x, y, z, id) { if (y > 6 && y < CH - 2) this.cells.set(K(x, y, z), [x, y, z, id]); return this; }
  soft(x, y, z, id) { if (!this.cells.has(K(x, y, z))) this.set(x, y, z, id); }
  top(x, z, id) {
    const y = this.y;
    this.set(x, y, z, id);
    if (id !== G) return;
    const h = hash2(x, z, 7), r = hash2(x, z, 9);
    this.set(x, y - 1, z, B.DIRT);
    if (h < 0.6) this.set(x, y - 2, z, B.STONE);
    if (h < 0.22) this.set(x, y - 3, z, B.STONE);
    if (r < 0.12) this.set(x, y + 1, z, B.TALLGRASS);
    else if (r < 0.18) this.set(x, y + 1, z, B.FLOWER_R + Math.floor(hash2(x, z, 10) * 3));
  }
  // 往前铺一块 len 长、w 宽的平台
  pad(len, w = 3, id = G) {
    const hw = (w - 1) >> 1;
    for (let i = 0; i < len; i++) for (let j = -hw; j <= hw; j++) this.top(this.x + this.dx * i - this.dz * j, this.z + this.dz * i + this.dx * j, id);
    const m = (len - 1) >> 1;
    this.c = { x: this.x + this.dx * m, z: this.z + this.dz * m };
    this.end = { x: this.x + this.dx * (len - 1), z: this.z + this.dz * (len - 1) };
    this.hw = hw;
    this.path.push({ x: this.x, z: this.z, ex: this.end.x, ez: this.end.z, y: this.y, id });
    this.x += this.dx * len; this.z += this.dz * len;
    return this;
  }
  gap(n) { this.x += this.dx * n; this.z += this.dz * n; return this; }
  rise(n) { this.y += n; return this; }
  // d = 1 右转，-1 左转；下一块平台从上一块末端的侧面接出去
  turn(d) {
    const ndx = d > 0 ? -this.dz : this.dz, ndz = d > 0 ? this.dx : -this.dx;
    this.x = this.end.x + ndx * (this.hw + 1); this.z = this.end.z + ndz * (this.hw + 1);
    this.dx = ndx; this.dz = ndz;
    return this;
  }
  star(h = 2.4) { this.stars.push({ x: this.c.x + 0.5, y: this.y + h, z: this.c.z + 0.5 }); return this; }
  starGap(h = 2.8) { this.stars.push({ x: this.x + 0.5, y: this.y + h, z: this.z + 0.5 }); return this; }
  check() { this.set(this.c.x, this.y, this.c.z, B.CHECK); this.cells.delete(K(this.c.x, this.y + 1, this.c.z)); return this; }
  goal() {
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { this.set(this.c.x + a, this.y, this.c.z + b, B.GOAL); this.cells.delete(K(this.c.x + a, this.y + 1, this.c.z + b)); }
    return this;
  }
  // 平台边上立一盏灯
  lamp() {
    const x = this.c.x - this.dz * this.hw, z = this.c.z + this.dx * this.hw, y = this.y;
    this.set(x, y + 1, z, B.FENCE).set(x, y + 2, z, B.FENCE).set(x, y + 3, z, B.LANTERN);
    return this;
  }
  tree(ox, oz) {
    const x = this.c.x + ox, z = this.c.z + oz, y = this.y;
    // 树冠要够高，别挡住跳上来的玩家
    for (let dy = 5; dy <= 8; dy++) {
      const r = dy >= 7 ? 1 : 2;
      for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
        if (Math.abs(a) === r && Math.abs(b) === r && (dy > 7 || hash2(x + a, z + b * 3 + dy, 3) > 0.5)) continue;
        this.soft(x + a, y + dy, z + b, B.LEAVES);
      }
    }
    for (let i = 1; i <= 7; i++) this.set(x, y + i, z, B.LOG);
    return this;
  }
}

// time: 一天中的时刻（关卡里时间不流动）；par: 三星所需的秒数；kit: 发给玩家的方块
export const LEVELS = [
  { name: '初次起跳', tip: '空格跳跃，按住 Shift 助跑能跳得更远', time: 0.42, par: 45, build: (L) => {
    L.pad(6, 5).tree(-2, 2).gap(1).pad(3).gap(2).pad(3).star().gap(2).rise(1).pad(3).gap(2).rise(1).pad(5).check()
      .turn(1).gap(2).pad(3).gap(1).pad(1, 1, KB).gap(1).pad(1, 1, KB).star().gap(1).pad(1, 1, KB).gap(1).pad(4)
      .gap(3).pad(4).star().gap(2).rise(1).pad(5, 5).tree(2, -2).goal();
  } },
  { name: '弹弹乐', tip: '踩上粉色弹跳块会被弹起，按住空格弹得更高', time: 0.5, par: 50, build: (L) => {
    L.pad(5, 5).gap(1).pad(2, 3, BO).gap(1).rise(2).pad(5).star().gap(2).pad(2, 3, BO).gap(1).rise(4).pad(6).check()
      .turn(-1).gap(2).pad(3).gap(1).pad(2, 3, BO).gap(2).rise(2).pad(2, 3, BO).star(3.4).gap(2).rise(2).pad(5).star()
      .gap(2).pad(2, 3, BO).gap(2).rise(2).pad(2, 3, BO).gap(2).rise(2).pad(5, 5).tree(-2, -2).goal();
  } },
  { name: '疾风跑道', tip: '踩过蓝色疾风块会猛地加速，在尽头起跳飞过大裂口', time: 0.36, par: 40, build: (L) => {
    L.pad(5, 5).tree(2, 2).gap(1).pad(5, 3, SP).gap(5).pad(6).star().gap(2).pad(4, 3, SP).gap(4).rise(1).pad(6).check()
      .turn(1).gap(2).pad(6, 3, SP).gap(2).starGap().gap(3).pad(3, 3, SP).gap(5).pad(7).star()
      .gap(3).pad(4).gap(2).rise(1).pad(5, 5).goal();
  } },
  { name: '搭桥工', tip: '裂口太宽就自己搭：低头对着悬空处按右键，会从脚下往前接方块；左键能把自己放的拆回来再用', time: 0.46, par: 80, kit: { [B.PLANKS]: 5 }, build: (L) => {
    L.pad(5, 5).tree(-2, 2).gap(6).pad(4).star().gap(7).rise(1).pad(4).check()
      .turn(-1).gap(4).starGap(2.2).gap(4).pad(3).gap(6).rise(1).pad(4).star().gap(3).pad(5, 5).goal();
  } },
  { name: '碎碎平台', tip: '裂纹方块踩上去半秒就会碎掉，别停下来', time: 0.62, par: 50, build: (L) => {
    L.pad(5, 5).gap(1).pad(6, 1, CR).gap(1).pad(3).star().gap(2).pad(4, 3, CR).gap(2).pad(4, 3, CR).gap(2).pad(3).check()
      .turn(1).gap(1).pad(9, 1, CR).star().gap(2).rise(1).pad(2, 3, CR).gap(2).rise(1).pad(2, 3, CR).gap(2).rise(1).pad(4)
      .star().gap(1).pad(5, 1, CR).gap(1).pad(5, 5).tree(2, -2).goal();
  } },
  { name: '冰面滑行', tip: '冰面很滑，转弯要提前松手', time: 0.3, par: 55, build: (L) => {
    L.pad(5, 5).gap(1).pad(8, 3, ICE).gap(2).pad(3).star().turn(-1).gap(1).pad(7, 3, ICE).turn(1).pad(6, 3, ICE).gap(2).pad(3).check()
      .gap(2).pad(5, 3, ICE).gap(1).starGap().gap(1).pad(5, 3, ICE).star().gap(2).rise(1).pad(4, 3, ICE).gap(2).pad(5, 5).goal();
  } },
  { name: '月夜灯河', tip: '夜里跟着灯笼走，学过的本事都会用上', time: 0.93, par: 90, build: (L) => {
    L.pad(5, 5).lamp().gap(2).pad(3).lamp().gap(1).pad(2, 3, BO).gap(1).rise(3).pad(5).star().lamp().gap(1).pad(4, 3, SP).gap(5).pad(5).lamp().check()
      .turn(1).gap(1).pad(6, 1, CR).gap(2).pad(3).star().lamp().gap(2).rise(1).pad(5, 3, ICE).gap(2).pad(4).lamp().check()
      .turn(-1).gap(2).pad(2, 3, BO).gap(2).rise(2).pad(2, 3, BO).gap(2).rise(2).pad(4).star().lamp().gap(1).pad(5, 3, SP).gap(4).rise(1).pad(6, 5).lamp().goal();
  } },
  { name: '星晶之巅', tip: '最后的试炼：一路向上。带了 4 块木板，省着用', time: 0.735, par: 130, kit: { [B.PLANKS]: 4 }, build: (L) => {
    L.pad(6, 5).tree(-2, 2).gap(2).rise(1).pad(3).gap(2).rise(1).pad(3).star().gap(1).pad(2, 3, BO).gap(1).rise(4).pad(5).check()
      .turn(1).gap(6).pad(4).gap(1).pad(5, 3, SP).gap(5).pad(3, 3, SP).gap(4).rise(1).pad(5).star().check()
      .turn(-1).gap(1).pad(7, 1, CR).gap(2).rise(1).pad(6, 3, ICE).gap(2).pad(3).check()
      .turn(-1).gap(2).pad(2, 3, BO).gap(2).rise(2).pad(2, 3, BO).gap(2).rise(2).pad(2, 3, BO).gap(1).rise(4).pad(5).star().lamp()
      .gap(6).rise(1).pad(7, 7).tree(-2, -2).tree(2, 2).goal();
  } },
];

export function loadProgress() {
  try { return Object.assign({ stars: [], best: [] }, JSON.parse(localStorage.getItem(PROG_KEY))); } catch (e) { return { stars: [], best: [] }; }
}
export const levelOpen = (prog, i) => i === 0 || (prog.stars[i - 1] || 0) > 0;

// 把关卡编译成世界能直接读的格式
export function buildLevel(i) {
  const L = new Course();
  LEVELS[i].build(L);
  const cells = new Map();
  let minY = 99;
  for (const [x, y, z, id] of L.cells.values()) {
    const k = ckey(x >> 4, z >> 4);
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push([(x & 15) + (z & 15) * 16 + y * 256, id]);
    if (DEFS[id].solid) minY = Math.min(minY, y);
  }
  return { custom: { cells, sea: 5 }, stars: L.stars.map((s, n) => ({ id: 's' + n, ...s })), minY, path: L.path };
}

const fmt = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(1).padStart(4, '0')}`;

export class StageMode extends Mode {
  constructor(game, index, level) {
    super(game);
    this.name = '闯关模式';
    this.music = 'drive';
    this.rules = { fly: false, mobs: false, infinite: false, timeFlow: false };
    this.index = index; this.def = LEVELS[index]; this.level = level;
    this.t = 0; this.running = false; this.finished = false; this.falls = 0;
    this.cp = { x: 0.5, y: 35.01, z: 0.5, yaw: 0 }; this.cpKey = '';
    this.own = new Set();        // 玩家自己放的方块
    this.crumble = new Map();    // 正在碎裂 / 等待恢复的方块
    this.warnT = 0;
    game.time = this.def.time;
    game.inv = { ...(this.def.kit || {}) };
    game.hotbar = [...Object.keys(game.inv).map(Number), 0, 0, 0, 0, 0, 0, 0, 0, 0].slice(0, 9);
    game.slot = 0;
    game.ents.fixed = level.stars;
  }

  spawn() { return this.cp; }

  start() {
    this.g.ui.toast(`第 ${this.index + 1} 关 · ${this.def.name}`);
    this.g.ui.toast(this.def.tip);
  }

  unlocked(id) { return this.g.count(id) > 0; }

  key(code) {
    if (code === 'KeyR' && !this.finished) { this.respawn(); return true; }
    return false;
  }

  placeId() {
    const g = this.g, id = g.hotbar[g.slot];
    if (!id) return 0;
    if (g.count(id) <= 0) { g.ui.toast('方块用完了：把之前放的拆回来再用'); return 0; }
    return id;
  }
  onPlace(x, y, z, id) { this.g.take(id, 1); this.own.add(K(x, y, z)); }
  canBreak(h) {
    if (this.own.has(K(h.x, h.y, h.z))) return true;
    this.g.ui.toast('闯关模式里只能拆自己放的方块');
    return false;
  }
  onBreak(h) { this.own.delete(K(h.x, h.y, h.z)); this.g.give(h.id, 1); }

  onCrystal() {
    const g = this.g;
    g.ui.toast(`✦ 星晶 ${g.crystals.size}/${this.level.stars.length}`);
  }

  respawn() {
    const g = this.g, c = this.cp;
    this.falls++;
    sfx('fall');
    // 放出去的方块全部收回来，免得卡关
    for (const k of this.own) {
      const [x, y, z] = k.split(',').map(Number), id = g.world.getBlock(x, y, z);
      if (id) { g.world.setBlock(x, y, z, 0, false, false); g.give(id, 1, true); }
    }
    this.own.clear();
    g.ui.renderHotbar();
    g.player.teleport(c.x, c.y, c.z, c.yaw);
    g.ui.toast(this.def.kit ? '回到存档点，放出去的方块已收回' : '回到存档点');
  }

  finish() {
    const g = this.g, total = this.level.stars.length, got = g.crystals.size;
    this.finished = true; this.running = false;
    const stars = 1 + (got >= total ? 1 : 0) + (got >= total && this.t <= this.def.par ? 1 : 0);
    const prog = loadProgress(), i = this.index;
    const newBest = !prog.best[i] || this.t < prog.best[i];
    prog.stars[i] = Math.max(prog.stars[i] || 0, stars);
    if (newBest) prog.best[i] = Math.round(this.t * 10) / 10;
    try { localStorage.setItem(PROG_KEY, JSON.stringify(prog)); } catch (e) { /* 忽略 */ }
    sfx('clear'); sfx('firework');
    const p = g.player.pos;
    g.ents.firework(p.x, p.y + 2, p.z);
    setTimeout(() => g.ents.firework(p.x, p.y + 3, p.z), 500);
    setTimeout(() => g.showResult({
      index: i, name: this.def.name, stars, time: fmt(this.t), par: fmt(this.def.par), got, total, falls: this.falls,
      newBest, hasNext: i + 1 < LEVELS.length,
    }), 1100);
  }

  update(dt) {
    const g = this.g, pl = g.player, p = pl.pos, w = g.world;
    if (this.finished) return;
    if (!this.running && (Math.abs(pl.vel.x) + Math.abs(pl.vel.z) > 0.5 || !pl.onGround)) this.running = true;
    if (this.running) this.t += dt;
    if (p.y < Math.max(w.sea + 1.2, this.level.minY - 14)) { this.respawn(); return; }

    if (pl.onGround) {
      const y = Math.floor(p.y - 0.05);
      // 脚下踩到的所有方块
      for (const ox of [-0.28, 0.28]) for (const oz of [-0.28, 0.28]) {
        const x = Math.floor(p.x + ox), z = Math.floor(p.z + oz), id = w.getBlock(x, y, z), k = K(x, y, z);
        if (id === CR && !this.crumble.has(k)) this.crumble.set(k, { x, y, z, t: 0.5, gone: false });
      }
      const gid = pl.ground?.id;
      if (gid === B.GOAL) { this.finish(); return; }
      if (gid === B.CHECK) {
        const k = K(pl.ground.x, pl.ground.y, pl.ground.z);
        if (k !== this.cpKey) {
          this.cpKey = k;
          this.cp = { x: pl.ground.x + 0.5, y: pl.ground.y + 1.01, z: pl.ground.z + 0.5, yaw: pl.yaw };
          sfx('checkpoint');
          g.ents.puff(this.cp.x, this.cp.y + 0.3, this.cp.z, [150, 255, 200], { n: 14, speed: 2, up: 4, life: 0.8, grav: 3, glow: true });
          g.ui.toast('已到达存档点');
        }
      }
    }

    for (const [k, c] of this.crumble) {
      c.t -= dt;
      if (c.t > 0) continue;
      if (!c.gone) {
        c.gone = true; c.t = 3.5;
        w.setBlock(c.x, c.y, c.z, 0, false, false);
        g.ents.burst(c.x + 0.5, c.y + 0.5, c.z + 0.5, DEFS[CR].tiles[1]);
        sfx('crumble');
      } else if (Math.abs(p.x - c.x - 0.5) > 0.82 || Math.abs(p.z - c.z - 0.5) > 0.82 || p.y >= c.y + 1 || p.y + 1.8 <= c.y) {
        // 等玩家不在这一格里了再长回来
        w.setBlock(c.x, c.y, c.z, CR, false, false);
        this.crumble.delete(k);
      }
    }
  }

  hud() {
    const g = this.g, total = this.level.stars.length, kit = Object.entries(g.inv);
    const main = `<b>第 ${this.index + 1} 关</b> · ${this.def.name}<br>` +
      `<span class="big">⏱ ${fmt(this.t)}</span> · <b>✦ ${g.crystals.size}/${total}</b>` +
      (kit.length ? `<br>${kit.map(([id, n]) => `${DEFS[id].name} ×${n}`).join(' · ')}` : '');
    const best = loadProgress().best[this.index];
    const side = `<h4>过关目标</h4><p>▸ 踩上金色的终点台 <span class="dim">★</span><br>▸ 集齐 ${total} 颗星晶 <span class="dim">★★</span><br>▸ 并在 ${fmt(this.def.par)} 内完成 <span class="dim">★★★</span></p>` +
      `<p class="dim">${this.def.tip}</p>` + (best ? `<p class="dim">最佳 ${fmt(best)} · 本次掉落 ${this.falls} 次</p>` : '');
    return [main, side];
  }

  palette() {
    const g = this.g;
    return { title: '随身方块', tip: '这一关发给你的方块 · 按 E 或 Esc 关闭', items: Object.keys(g.inv).map(Number).map((id) => ({ id, ok: true, sub: '×' + g.inv[id] })) };
  }
}
