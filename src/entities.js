// 实体：团子（小生物 / 小镇居民）、星晶（收集物）、粒子特效、萤火虫与蝴蝶
import * as THREE from 'three';
import { hash2 } from './noise.js';
import { B, DEFS } from './blocks.js';

const CELL = 48; // 每个 48x48 的区域最多一颗星晶
const PASTEL = [0xffc9de, 0xffe3a8, 0xc9f0c0, 0xbfe3ff, 0xe0ccff, 0xffffff, 0xffd0b0];

const lam = (color) => new THREE.MeshLambertMaterial({ color });
const M_BLACK = lam(0x1c1c22), M_WHITE = lam(0xffffff), M_PINK = lam(0xff8fb0), M_GREEN = lam(0x62c050), M_STEM = lam(0x4c9a40);
const M_STRAW = lam(0xe8c66a), M_BAND = lam(0xd8553f);
const G_BODY = new THREE.SphereGeometry(0.42, 24, 16), G_BALL = new THREE.SphereGeometry(1, 14, 10);
const G_EAR = new THREE.ConeGeometry(0.11, 0.26, 12), G_STEM = new THREE.CylinderGeometry(0.018, 0.018, 0.16, 6);
const G_BRIM = new THREE.CylinderGeometry(0.36, 0.38, 0.03, 20), G_CROWN = new THREE.CylinderGeometry(0.15, 0.2, 0.16, 16);
const G_HBAND = new THREE.CylinderGeometry(0.205, 0.205, 0.045, 16);

function makeMob(color, hat) {
  const root = new THREE.Group(), inner = new THREE.Group();
  root.add(inner);
  const bodyMat = lam(color), eyes = [];
  const add = (geo, mat, x, y, z, sx, sy, sz) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.scale.set(sx, sy ?? sx, sz ?? sx);
    m.castShadow = true;
    inner.add(m);
    return m;
  };
  add(G_BODY, bodyMat, 0, 0.36, 0, 1, 0.84, 1);
  add(G_BALL, M_WHITE, 0, 0.27, 0.17, 0.27, 0.22, 0.24);            // 肚皮
  for (const s of [-1, 1]) {
    eyes.push(add(G_BALL, M_BLACK, s * 0.15, 0.46, 0.365, 0.055, 0.065, 0.04));  // 眼睛
    eyes.push(add(G_BALL, M_WHITE, s * 0.135, 0.485, 0.398, 0.02));              // 高光
    add(G_BALL, M_PINK, s * 0.27, 0.37, 0.3, 0.055, 0.035, 0.03);     // 腮红
    add(G_BALL, bodyMat, s * 0.17, 0.05, 0.1, 0.1, 0.055, 0.14);      // 脚
    add(G_BALL, bodyMat, s * 0.4, 0.3, 0.06, 0.07, 0.1, 0.07);        // 小手
    const ear = add(G_EAR, bodyMat, s * 0.2, 0.74, 0, 1);
    ear.rotation.z = -s * 0.35;
  }
  add(G_BALL, M_BLACK, 0, 0.4, 0.41, 0.022, 0.016, 0.015);            // 小嘴
  add(G_BALL, bodyMat, 0, 0.28, -0.4, 0.09);                          // 尾巴
  if (hat) {                                                          // 居民戴草帽
    add(G_BRIM, M_STRAW, 0, 0.71, 0, 1);
    add(G_CROWN, M_STRAW, 0, 0.8, 0, 1);
    add(G_HBAND, M_BAND, 0, 0.75, 0, 1);
  } else {
    add(G_STEM, M_STEM, 0, 0.78, 0.02, 1);                            // 头顶小芽
    const leaf = add(G_BALL, M_GREEN, 0.07, 0.87, 0.02, 0.09, 0.025, 0.05);
    leaf.rotation.z = 0.5;
    const leaf2 = add(G_BALL, M_GREEN, -0.06, 0.86, 0.02, 0.07, 0.022, 0.045);
    leaf2.rotation.z = -0.6;
  }
  for (const e of eyes) e.userData.sy = e.scale.y;
  return { root, inner, eyes };
}

function glowTexture(c0, c1) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, `rgba(${c0},1)`); gr.addColorStop(0.3, `rgba(${c1},0.45)`); gr.addColorStop(1, `rgba(${c1},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

export class Entities {
  constructor(game) {
    this.g = game;
    this.mobs = []; this.spawnT = 0;
    this.crystals = new Map(); // id -> 模型
    this.fixed = null;         // 闯关模式：固定位置的星晶 [{id,x,y,z}]
    this.homes = [];           // 建造模式：居民的家 [{x,y,z}]
    this.nearest = null;
    this.parts = [];
    this.partGeo = new THREE.BoxGeometry(0.13, 0.13, 0.13);
    this.cGeo = new THREE.OctahedronGeometry(0.38);
    this.cMat = new THREE.MeshBasicMaterial({ color: 0x9ff8ff });
    this.cGlow = new THREE.SpriteMaterial({ map: glowTexture('200,255,255', '110,230,255'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.beamGeo = new THREE.CylinderGeometry(0.07, 0.07, 70, 6, 1, true);
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0x8cf0ff, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.time = 0;

    // 暖光灯的光晕
    this.haloMat = new THREE.SpriteMaterial({ map: glowTexture('255,244,210', '255,180,90'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
    this.halos = [];
    for (let i = 0; i < 14; i++) { const s = new THREE.Sprite(this.haloMat); s.visible = false; game.scene.add(s); this.halos.push(s); }

    // 萤火虫
    const N = 40, fp = new Float32Array(N * 3);
    this.flies = [];
    for (let i = 0; i < N; i++) this.flies.push({ x: 0, y: -100, z: 0, ph: Math.random() * 6.28, sp: 0.4 + Math.random() * 0.6 });
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
    this.flyPts = new THREE.Points(fg, new THREE.PointsMaterial({
      map: glowTexture('255,255,220', '220,255,120'), color: 0xf4ff9a, size: 0.42, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.flyPts.frustumCulled = false;
    game.scene.add(this.flyPts);

    // 蝴蝶
    this.bflies = [];
    const wing = new THREE.PlaneGeometry(0.16, 0.2);
    wing.translate(0.08, 0, 0);
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.MeshLambertMaterial({ color: [0xffd65c, 0xff9ac0, 0x9ad4ff, 0xffffff, 0xffb070, 0xc8a8ff][i], side: THREE.DoubleSide });
      const grp = new THREE.Group(), a = new THREE.Mesh(wing, mat), b = new THREE.Mesh(wing, mat);
      b.scale.x = -1;
      grp.add(a, b); grp.visible = false;
      game.scene.add(grp);
      this.bflies.push({ grp, a, b, x: 0, y: -100, z: 0, tx: 0, ty: 0, tz: 0, t: 0, ph: Math.random() * 6 });
    }
  }

  // 换世界时清场
  reset() {
    const s = this.g.scene;
    for (const m of this.mobs) s.remove(m.root);
    for (const grp of this.crystals.values()) s.remove(grp);
    for (const m of this.parts) { s.remove(m); if (m.userData.mat) m.userData.mat.dispose(); }
    this.mobs = []; this.crystals.clear(); this.parts = [];
    this.fixed = null; this.homes = []; this.nearest = null;
    for (const f of this.flies) f.y = -100;
    for (const b of this.bflies) { b.y = -100; b.t = 0; b.grp.visible = false; }
  }

  // ---------- 粒子 ----------
  // color: [r,g,b] 0~255
  puff(x, y, z, color, o = {}) {
    const { n = 12, spread = 0.7, speed = 3.5, up = 4, life = 0.5, grav = 16, size = 1, glow = false } = o;
    if (this.parts.length > 500) return;
    const mat = glow ? new THREE.MeshBasicMaterial() : new THREE.MeshLambertMaterial();
    mat.color.setRGB(color[0] / 255, color[1] / 255, color[2] / 255, THREE.SRGBColorSpace);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.partGeo, mat);
      m.position.set(x + (Math.random() - 0.5) * spread, y + (Math.random() - 0.5) * spread, z + (Math.random() - 0.5) * spread);
      const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * speed;
      m.userData.v = new THREE.Vector3(Math.cos(a) * r, (Math.random() * 0.8 + 0.2) * up, Math.sin(a) * r);
      m.userData.life = life * (0.7 + Math.random() * 0.6);
      m.userData.grav = grav; m.userData.size = size;
      m.userData.mat = i === 0 ? mat : null;
      this.g.scene.add(m);
      this.parts.push(m);
    }
  }

  burst(x, y, z, tile) { this.puff(x, y, z, this.g.atlas.avg[tile] || [200, 200, 200]); }

  // 烟花：建筑落成、通关时放
  firework(x, y, z) {
    const cols = [[255, 120, 140], [255, 220, 110], [130, 230, 255], [170, 255, 150], [220, 170, 255]];
    for (let k = 0; k < 3; k++) {
      const c = cols[Math.floor(Math.random() * cols.length)];
      const px = x + (Math.random() - 0.5) * 5, py = y + 3 + Math.random() * 4, pz = z + (Math.random() - 0.5) * 5;
      for (let i = 0; i < 2; i++) this.puff(px, py, pz, c, { n: 16, spread: 0.2, speed: 6, up: i ? -3 : 5, life: 1.1, grav: 5, size: 1.3, glow: true });
    }
  }

  // ---------- 星晶 ----------
  crystalAt(cx, cz) {
    const seed = this.g.world.seed;
    if (hash2(cx, cz, seed + 77) > 0.55) return null;
    return {
      id: cx + ',' + cz,
      x: Math.floor(cx * CELL + 6 + hash2(cx, cz, seed + 78) * 36) + 0.5,
      z: Math.floor(cz * CELL + 6 + hash2(cx, cz, seed + 79) * 36) + 0.5,
    };
  }

  updateCrystals(dt) {
    const g = this.g, p = g.player.pos, w = g.world;
    const want = new Set(), list = [];
    let best = null, bestD = 1e9;
    if (this.fixed) {
      for (const c of this.fixed) if (!g.crystals.has(c.id)) list.push([c, true]);
    } else {
      const pcx = Math.floor(p.x / CELL), pcz = Math.floor(p.z / CELL);
      for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) {
        const c = this.crystalAt(pcx + dx, pcz + dz);
        if (c && !g.crystals.has(c.id)) list.push([c, Math.abs(dx) <= 3 && Math.abs(dz) <= 3]);
      }
    }
    for (const [c, show] of list) {
      const dist = Math.hypot(c.x - p.x, c.z - p.z);
      if (dist < bestD) { bestD = dist; best = c; }
      if (!show) continue;
      want.add(c.id);
      if (!this.crystals.has(c.id)) {
        const y = c.y ?? Math.max(w.height(Math.floor(c.x), Math.floor(c.z)), w.sea) + 2.6;
        const grp = new THREE.Group();
        grp.position.set(c.x, y, c.z);
        const gem = new THREE.Mesh(this.cGeo, this.cMat);
        gem.scale.y = 1.5;
        const glow = new THREE.Sprite(this.cGlow);
        glow.scale.setScalar(2.6);
        grp.add(gem, glow);
        if (!this.fixed) { const beam = new THREE.Mesh(this.beamGeo, this.beamMat); beam.position.y = 36; grp.add(beam); }
        grp.userData = { gem, glow, baseY: y, c };
        g.scene.add(grp);
        this.crystals.set(c.id, grp);
      }
    }
    this.nearest = best ? { x: best.x, z: best.z, dist: bestD } : null;
    for (const [id, grp] of this.crystals) {
      if (!want.has(id)) { g.scene.remove(grp); this.crystals.delete(id); continue; }
      const u = grp.userData;
      u.gem.rotation.y += dt * 1.6;
      u.glow.scale.setScalar(2.6 + 0.3 * Math.sin(this.time * 3 + u.c.x));
      grp.position.y = u.baseY + Math.sin(this.time * 2 + u.c.x) * 0.2;
      const dx = grp.position.x - p.x, dy = grp.position.y - (p.y + 0.9), dz = grp.position.z - p.z;
      if (dx * dx + dy * dy + dz * dz < 2.9) {
        g.scene.remove(grp); this.crystals.delete(id);
        this.puff(grp.position.x, grp.position.y, grp.position.z, [170, 250, 255], { n: 18, speed: 3, up: 3, life: 0.7, grav: 4, glow: true });
        g.collectCrystal(id);
      }
    }
  }

  // ---------- 团子 ----------
  addMob(x, y, z, home) {
    const m = makeMob(PASTEL[Math.floor(Math.random() * PASTEL.length)], !!home);
    const s = 0.8 + Math.random() * 0.5;
    m.root.scale.setScalar(s);
    Object.assign(m, { x, y, z, vy: 0, hv: 0, heading: Math.random() * 6.28, timer: Math.random() * 2, ground: false, phase: Math.random() * 6, home, blink: 1 + Math.random() * 4 });
    this.g.scene.add(m.root);
    this.mobs.push(m);
  }

  spawnMob() {
    const g = this.g, w = g.world, p = g.player.pos;
    const a = Math.random() * Math.PI * 2, r = 14 + Math.random() * 26;
    const x = Math.floor(p.x + Math.cos(a) * r), z = Math.floor(p.z + Math.sin(a) * r);
    if (!w.getChunk(x >> 4, z >> 4)) return;
    const y = w.getTop(x, z), id = w.getBlock(x, y, z);
    if (id !== B.GRASS && id !== B.SNOWGRASS && id !== B.SAND) return;
    if (w.getBlock(x, y + 1, z) === B.WATER || y < w.sea) return;
    this.addMob(x + 0.5, y + 1, z + 0.5, null);
  }

  // 让每个"家"附近都有它的居民
  syncResidents() {
    const g = this.g, w = g.world, p = g.player.pos;
    for (const h of this.homes) {
      if (h.mob && this.mobs.includes(h.mob)) continue;
      h.mob = null;
      if (Math.hypot(h.x - p.x, h.z - p.z) > 60) continue;
      const x = Math.floor(h.x + (Math.random() - 0.5) * 8), z = Math.floor(h.z + (Math.random() - 0.5) * 8);
      if (!w.getChunk(x >> 4, z >> 4)) continue;
      const y = w.groundY(x, z, Math.min(95, h.y + 12));
      if (y < 0 || DEFS[w.getBlock(x, y + 1, z)].liquid) continue;
      this.addMob(x + 0.5, y + 1, z + 0.5, h);
      h.mob = this.mobs[this.mobs.length - 1];
    }
  }

  updateMobs(dt) {
    const g = this.g, w = g.world, p = g.player.pos;
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 0.7;
      if (g.rules.mobs && this.mobs.filter((m) => !m.home).length < 10) this.spawnMob();
      if (this.homes.length) this.syncResidents();
    }
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      const dxp = p.x - m.x, dzp = p.z - m.z, dist = Math.hypot(dxp, dzp);
      if (dist > 75 || m.y < -5) { g.scene.remove(m.root); this.mobs.splice(i, 1); continue; }
      if (!w.getChunk(Math.floor(m.x) >> 4, Math.floor(m.z) >> 4)) continue;
      m.timer -= dt;
      if (m.ground && m.timer <= 0) {
        if (dist < 5.5) {           // 看到玩家：转过来开心地蹦
          m.heading = Math.atan2(dxp, dzp);
          m.vy = 4.2; m.hv = dist > 2.2 ? 0.8 : 0; m.timer = 0.5 + Math.random() * 0.6;
        } else {
          if (m.home && Math.hypot(m.home.x - m.x, m.home.z - m.z) > 9) m.heading = Math.atan2(m.home.x - m.x, m.home.z - m.z) + (Math.random() - 0.5);
          else if (Math.random() < 0.35) m.heading += (Math.random() - 0.5) * 2.6;
          const ax = m.x + Math.sin(m.heading) * 1.3, az = m.z + Math.cos(m.heading) * 1.3;
          let wet = false;
          for (let dy = 1; dy >= -3; dy--) {
            const id = w.getBlock(Math.floor(ax), Math.floor(m.y) + dy, Math.floor(az));
            if (DEFS[id].liquid) { wet = true; break; }
            if (DEFS[id].solid) break;
          }
          if (wet) { m.heading += Math.PI * (0.6 + Math.random() * 0.8); m.timer = 0.4; }
          else { m.vy = 6.6; m.hv = 2.2; m.timer = 0.6 + Math.random() * 2.2; }
        }
        if (m.vy > 0) m.ground = false;
      }
      if (!m.ground) {
        const nx = m.x + Math.sin(m.heading) * m.hv * dt, nz = m.z + Math.cos(m.heading) * m.hv * dt;
        if (w.isSolid(nx, m.y + 0.15, nz) || w.isSolid(nx, m.y + 0.6, nz)) m.hv *= 0.5;
        else { m.x = nx; m.z = nz; }
        m.vy -= 22 * dt;
        m.y += m.vy * dt;
        if (m.vy > 0 && w.isSolid(m.x, m.y + 0.7, m.z)) m.vy = 0;
        if (m.vy <= 0 && w.isSolid(m.x, m.y, m.z)) { m.y = Math.floor(m.y) + 1; m.vy = 0; m.hv = 0; m.ground = true; }
      } else if (!w.isSolid(m.x, m.y - 0.1, m.z)) m.ground = false;

      const sy = m.ground ? 1 + 0.05 * Math.sin(this.time * 3 + m.phase) : 1 + Math.max(-0.2, Math.min(0.28, m.vy * 0.04));
      const sxz = 1 / Math.sqrt(sy);
      m.inner.scale.set(sxz, sy, sxz);
      m.root.position.set(m.x, m.y, m.z);
      let d = m.heading - m.root.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      m.root.rotation.y += d * Math.min(1, dt * 10);
      // 眨眼
      m.blink -= dt;
      const shut = m.blink < 0.12;
      for (const e of m.eyes) e.scale.y = shut ? e.userData.sy * 0.12 : e.userData.sy;
      if (m.blink < 0) m.blink = 1.5 + Math.random() * 4;
    }
  }

  // ---------- 灯光光晕 ----------
  setHalos(lamps, night) {
    const k = 0.25 + 0.75 * night;
    this.haloMat.opacity = 0.75 * k;
    this.halos.forEach((s, i) => {
      const l = lamps[i];
      s.visible = !!l;
      if (l) { s.position.set(l[0], l[1], l[2]); s.scale.setScalar(1.6 + 2.2 * night); }
    });
  }

  // ---------- 萤火虫、蝴蝶 ----------
  updateCritters(dt, dayF) {
    const g = this.g, w = g.world, p = g.player.pos, night = 1 - dayF;
    const place = (o, r) => {
      const a = Math.random() * 6.283, d = 4 + Math.random() * r;
      const x = Math.floor(p.x + Math.cos(a) * d), z = Math.floor(p.z + Math.sin(a) * d);
      if (!w.getChunk(x >> 4, z >> 4)) return false;
      const top = w.getTop(x, z);
      if (top <= w.sea) return false;
      o.x = x + 0.5; o.z = z + 0.5; o.y = top + 1.3 + Math.random() * 2;
      return true;
    };
    const fp = this.flyPts.geometry.attributes.position;
    this.flyPts.visible = night > 0.3;
    this.flyPts.material.opacity = Math.min(1, (night - 0.3) * 2.5);
    if (this.flyPts.visible) {
      this.flies.forEach((f, i) => {
        if (Math.hypot(f.x - p.x, f.z - p.z) > 30 || f.y < -50) { if (!place(f, 24)) f.y = -100; }
        const t = this.time * f.sp + f.ph;
        fp.setXYZ(i, f.x + Math.sin(t) * 1.4, f.y + Math.sin(t * 1.7) * 0.6, f.z + Math.cos(t * 0.8) * 1.4);
      });
      fp.needsUpdate = true;
    }
    for (const b of this.bflies) {
      const on = dayF > 0.7;
      if (!on) { b.grp.visible = false; continue; }
      if (b.y < -50 || Math.hypot(b.x - p.x, b.z - p.z) > 34) { if (!place(b, 18)) { b.grp.visible = false; continue; } b.tx = b.x; b.ty = b.y; b.tz = b.z; b.t = 0; }
      if ((b.t -= dt) <= 0) {
        b.t = 1 + Math.random() * 3;
        const o = { x: 0, y: 0, z: 0 };
        const a = Math.random() * 6.283, d = 2 + Math.random() * 5;
        o.x = b.x + Math.cos(a) * d; o.z = b.z + Math.sin(a) * d;
        const top = w.getTop(Math.floor(o.x), Math.floor(o.z));
        if (top > w.sea) { b.tx = o.x; b.tz = o.z; b.ty = top + 1.2 + Math.random() * 1.6; }
      }
      const dx = b.tx - b.x, dy = b.ty - b.y, dz = b.tz - b.z, len = Math.hypot(dx, dy, dz);
      if (len > 0.1) { const s = Math.min(len, 1.8 * dt) / len; b.x += dx * s; b.y += dy * s; b.z += dz * s; b.grp.rotation.y = Math.atan2(dx, dz); }
      const flap = Math.sin(this.time * 16 + b.ph) * 1.05;
      b.a.rotation.y = -flap; b.b.rotation.y = flap;
      b.grp.visible = true;
      b.grp.position.set(b.x, b.y + Math.sin(this.time * 5 + b.ph) * 0.12, b.z);
      b.grp.rotation.x = -1.2;
    }
  }

  update(dt) {
    this.time += dt;
    this.updateCrystals(dt);
    this.updateMobs(dt);
    this.updateCritters(dt, this.g.sky.dayF);
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const m = this.parts[i], u = m.userData;
      u.life -= dt;
      if (u.life <= 0) { this.g.scene.remove(m); if (u.mat) u.mat.dispose(); this.parts.splice(i, 1); continue; }
      u.v.y -= u.grav * dt;
      m.position.addScaledVector(u.v, dt);
      m.rotation.x += dt * 6; m.rotation.y += dt * 4;
      m.scale.setScalar(Math.min(1, u.life * 3) * u.size);
    }
  }
}
