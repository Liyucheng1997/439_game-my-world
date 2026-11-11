// 玩家：第一人称控制、碰撞、放置与破坏
import * as THREE from 'three';
import { B, DEFS } from './blocks.js';
import { CH } from './world.js';
import { sfx } from './audio.js';

const HW = 0.3, HEIGHT = 1.8, EYE = 1.62, REACH = 6.5;

export class Player {
  constructor(game) {
    this.g = game;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.fly = false; this.onGround = false; this.inWater = false; this.headInWater = false;
    this.keys = new Set();
    this.btn = [false, false, false];
    this.cool = 0; this.hit = null;
    this.boost = 0; this.sprint = false;
    this.lastSpace = 0; this.lastW = 0;
    this.swing = 0;

    const hl = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
      new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.75 }));
    hl.visible = false;
    game.scene.add(hl);
    this.highlight = hl;

    addEventListener('keydown', (e) => {
      if (!game.active || e.repeat) return;
      this.keys.add(e.code);
      const now = performance.now();
      if (e.code === 'Space') {
        e.preventDefault();
        if (now - this.lastSpace < 260) { this.toggleFly(); this.lastSpace = 0; } else this.lastSpace = now;
      } else if (e.code === 'KeyW') {
        if (now - this.lastW < 260) this.sprint = true;
        this.lastW = now;
      } else if (e.code === 'KeyF') this.toggleFly();
      else if (/^Digit[1-9]$/.test(e.code)) game.setSlot(+e.code[5] - 1);
    });
    addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyW') this.sprint = false;
    });
    addEventListener('blur', () => { this.keys.clear(); this.btn.fill(false); });
    addEventListener('mousemove', (e) => {
      if (!game.active) return;
      this.yaw -= e.movementX * 0.0023;
      this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch - e.movementY * 0.0023));
    });
    addEventListener('mousedown', (e) => {
      if (!game.active) return;
      this.btn[e.button] = true; this.cool = 0;
      if (e.button === 1) { e.preventDefault(); this.pick(); }
    });
    addEventListener('mouseup', (e) => { this.btn[e.button] = false; });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('wheel', (e) => {
      if (game.active) game.setSlot((game.slot + (e.deltaY > 0 ? 1 : 8)) % 9);
    }, { passive: true });
  }

  toggleFly() {
    this.fly = !this.fly;
    this.g.ui.toast(this.fly ? '飞行模式：开（空格上升，Shift 下降）' : '飞行模式：关');
  }

  collides(x, y, z) {
    const w = this.g.world;
    const x0 = Math.floor(x - HW), x1 = Math.floor(x + HW);
    const y0 = Math.floor(y), y1 = Math.floor(y + HEIGHT);
    const z0 = Math.floor(z - HW), z1 = Math.floor(z + HW);
    for (let by = y0; by <= y1; by++) for (let bz = z0; bz <= z1; bz++) for (let bx = x0; bx <= x1; bx++)
      if (DEFS[w.getBlock(bx, by, bz)].solid) return true;
    return false;
  }

  move(dx, dy, dz) {
    const p = this.pos;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.35));
    const sx = dx / steps, sy = dy / steps, sz = dz / steps;
    for (let i = 0; i < steps; i++) {
      if (sx) { p.x += sx; if (this.collides(p.x, p.y, p.z)) { p.x -= sx; this.vel.x = 0; } }
      if (sz) { p.z += sz; if (this.collides(p.x, p.y, p.z)) { p.z -= sz; this.vel.z = 0; } }
      if (sy) {
        const old = p.y;
        p.y += sy;
        if (this.collides(p.x, p.y, p.z)) {
          p.y = old;
          if (sy < 0) {
            const snap = Math.floor(old + sy) + 1;
            if (snap <= old && !this.collides(p.x, snap, p.z)) p.y = snap;
            this.onGround = true;
            this.landVel = this.vel.y;
          }
          this.vel.y = 0;
        }
      }
    }
  }

  update(dt) {
    const g = this.g, w = g.world, k = this.keys, p = this.pos, v = this.vel;
    const act = g.active;
    this.inWater = DEFS[w.getBlock(Math.floor(p.x), Math.floor(p.y + 0.9), Math.floor(p.z))].liquid;
    this.headInWater = DEFS[w.getBlock(Math.floor(p.x), Math.floor(p.y + EYE), Math.floor(p.z))].liquid;

    let f = 0, s = 0;
    if (act) { f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0); s = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0); }
    const len = Math.hypot(f, s) || 1; f /= len; s /= len;
    const space = act && k.has('Space'), shift = act && (k.has('ShiftLeft') || k.has('ShiftRight'));
    const sprinting = this.sprint || (shift && !this.fly);
    let speed = this.fly ? 11 : 4.4;
    if (sprinting) speed *= this.fly ? 2.2 : 1.55;
    if (this.inWater && !this.fly) speed *= 0.6;
    if (this.boost > 0) { speed *= 2.3; this.boost -= dt; }
    this.speedFov = (sprinting && f > 0) || this.boost > 0 ? 1 : 0;

    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const tx = (-sin * f + cos * s) * speed, tz = (-cos * f - sin * s) * speed;
    const a = 1 - Math.exp(-(this.onGround || this.fly ? 14 : 4) * dt);
    v.x += (tx - v.x) * a; v.z += (tz - v.z) * a;

    if (this.fly) {
      const ty = ((space ? 1 : 0) - (shift ? 1 : 0)) * speed * 0.8;
      v.y += (ty - v.y) * a;
    } else if (this.inWater) {
      v.y -= 9 * dt; v.y *= 1 - Math.min(1, 2.5 * dt);
      if (space) v.y = Math.min(v.y + 34 * dt, 3.6);
    } else {
      v.y = Math.max(-50, v.y - 28 * dt);
      if (space && this.onGround) v.y = 8.7;
    }

    this.onGround = false;
    this.move(v.x * dt, v.y * dt, v.z * dt);

    if (this.onGround) {
      const below = w.getBlock(Math.floor(p.x), Math.floor(p.y - 0.05), Math.floor(p.z));
      if (below === B.BOUNCE && !this.fly) { v.y = space ? 17 : 12.5; this.onGround = false; sfx('bounce'); }
      else if (below === B.SPEED) this.boost = 0.5;
    }
    if (p.y < -20) { p.y = CH; v.set(0, 0, 0); }

    const cam = g.camera;
    cam.position.set(p.x, p.y + EYE, p.z);
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');

    // 准星指向的方块
    this.hit = this.raycast();
    if (this.hit) { this.highlight.visible = true; this.highlight.position.set(this.hit.x + 0.5, this.hit.y + 0.5, this.hit.z + 0.5); }
    else this.highlight.visible = false;

    this.cool -= dt;
    this.swing = Math.max(0, this.swing - dt * 5);
    if (act && this.cool <= 0) {
      if (this.btn[0]) { this.breakBlock(); this.cool = 0.2; }
      else if (this.btn[2]) { this.placeBlock(); this.cool = 0.2; }
    }
  }

  raycast() {
    const w = this.g.world, cam = this.g.camera;
    const d = new THREE.Vector3(0, 0, -1).applyEuler(cam.rotation), o = cam.position;
    let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
    const sx = d.x > 0 ? 1 : -1, sy = d.y > 0 ? 1 : -1, sz = d.z > 0 ? 1 : -1;
    const tdx = Math.abs(1 / (d.x || 1e-9)), tdy = Math.abs(1 / (d.y || 1e-9)), tdz = Math.abs(1 / (d.z || 1e-9));
    let tmx = (sx > 0 ? x + 1 - o.x : o.x - x) * tdx;
    let tmy = (sy > 0 ? y + 1 - o.y : o.y - y) * tdy;
    let tmz = (sz > 0 ? z + 1 - o.z : o.z - z) * tdz;
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < 40; i++) {
      let t;
      if (tmx < tmy && tmx < tmz) { t = tmx; x += sx; tmx += tdx; nx = -sx; ny = 0; nz = 0; }
      else if (tmy < tmz) { t = tmy; y += sy; tmy += tdy; nx = 0; ny = -sy; nz = 0; }
      else { t = tmz; z += sz; tmz += tdz; nx = 0; ny = 0; nz = -sz; }
      if (t > REACH) return null;
      const id = w.getBlock(x, y, z);
      if (id && !DEFS[id].liquid) return { x, y, z, nx, ny, nz, id };
    }
    return null;
  }

  breakBlock() {
    const h = this.hit;
    if (!h) return;
    this.swing = 1;
    if (h.id === B.BEDROCK) { this.g.ui.toast('基岩太硬了，挖不动'); return; }
    if (this.g.world.setBlock(h.x, h.y, h.z, 0)) {
      this.g.ents.burst(h.x + 0.5, h.y + 0.5, h.z + 0.5, DEFS[h.id].tiles[1]);
      sfx('break');
      this.g.stats.broken++;
    }
  }

  placeBlock() {
    const h = this.hit, g = this.g;
    if (!h) return;
    const id = g.hotbar[g.slot], def = DEFS[id];
    if (!id) return;
    const x = h.x + h.nx, y = h.y + h.ny, z = h.z + h.nz;
    if (y < 1 || y >= CH) { g.ui.toast('这里已经到世界的边界了'); return; }
    const cur = DEFS[g.world.getBlock(x, y, z)];
    if (cur.id !== 0 && !cur.liquid && !cur.plant) return;
    if (def.plant && !DEFS[g.world.getBlock(x, y - 1, z)].solid) return;
    if (def.solid) {
      const p = this.pos;
      if (x + 1 > p.x - HW && x < p.x + HW && z + 1 > p.z - HW && z < p.z + HW && y + 1 > p.y && y < p.y + HEIGHT) return;
    }
    this.swing = 1;
    if (g.world.setBlock(x, y, z, id)) { sfx('place'); g.stats.placed++; }
  }

  pick() {
    const h = this.hit, g = this.g;
    if (!h || h.id === B.BEDROCK || !g.unlocked(h.id)) return;
    const at = g.hotbar.indexOf(h.id);
    if (at >= 0) g.setSlot(at);
    else { g.hotbar[g.slot] = h.id; g.setSlot(g.slot); }
    sfx('pick');
  }
}
