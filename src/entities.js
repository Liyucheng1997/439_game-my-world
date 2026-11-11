// 实体：团子（小生物）、星晶（收集物）、破碎粒子
import * as THREE from 'three';
import { hash2 } from './noise.js';
import { B, DEFS } from './blocks.js';
import { SEA } from './world.js';

const CELL = 48; // 每个 48x48 的区域最多一颗星晶
const PASTEL = [0xffc9de, 0xffe3a8, 0xc9f0c0, 0xbfe3ff, 0xe0ccff, 0xffffff, 0xffd0b0];

const lam = (color) => new THREE.MeshLambertMaterial({ color });
const M_BLACK = lam(0x1c1c22), M_WHITE = lam(0xffffff), M_PINK = lam(0xff8fb0), M_GREEN = lam(0x62c050), M_STEM = lam(0x4c9a40);
const G_BODY = new THREE.SphereGeometry(0.42, 24, 16), G_BALL = new THREE.SphereGeometry(1, 14, 10);
const G_EAR = new THREE.ConeGeometry(0.11, 0.26, 12), G_STEM = new THREE.CylinderGeometry(0.018, 0.018, 0.16, 6);

function makeMob(color) {
  const root = new THREE.Group(), inner = new THREE.Group();
  root.add(inner);
  const bodyMat = lam(color);
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
    add(G_BALL, M_BLACK, s * 0.15, 0.46, 0.365, 0.055, 0.065, 0.04);  // 眼睛
    add(G_BALL, M_WHITE, s * 0.135, 0.485, 0.398, 0.02);              // 高光
    add(G_BALL, M_PINK, s * 0.27, 0.37, 0.3, 0.055, 0.035, 0.03);     // 腮红
    add(G_BALL, bodyMat, s * 0.17, 0.05, 0.1, 0.1, 0.055, 0.14);      // 脚
    const ear = add(G_EAR, bodyMat, s * 0.2, 0.74, 0, 1);
    ear.rotation.z = -s * 0.35;
  }
  add(G_BALL, M_BLACK, 0, 0.4, 0.41, 0.022, 0.016, 0.015);            // 小嘴
  add(G_BALL, bodyMat, 0, 0.28, -0.4, 0.09);                          // 尾巴
  add(G_STEM, M_STEM, 0, 0.78, 0.02, 1);                              // 头顶小芽
  const leaf = add(G_BALL, M_GREEN, 0.07, 0.87, 0.02, 0.09, 0.025, 0.05);
  leaf.rotation.z = 0.5;
  const leaf2 = add(G_BALL, M_GREEN, -0.06, 0.86, 0.02, 0.07, 0.022, 0.045);
  leaf2.rotation.z = -0.6;
  return { root, inner };
}

function glowTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(200,255,255,1)'); gr.addColorStop(0.3, 'rgba(110,230,255,0.45)'); gr.addColorStop(1, 'rgba(80,200,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

export class Entities {
  constructor(game) {
    this.g = game;
    this.mobs = []; this.spawnT = 0;
    this.crystals = new Map(); // id -> 模型
    this.nearest = null;
    this.parts = [];
    this.partGeo = new THREE.BoxGeometry(0.13, 0.13, 0.13);
    this.cGeo = new THREE.OctahedronGeometry(0.38);
    this.cMat = new THREE.MeshBasicMaterial({ color: 0x9ff8ff });
    this.cGlow = new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.beamGeo = new THREE.CylinderGeometry(0.07, 0.07, 70, 6, 1, true);
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0x8cf0ff, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.time = 0;
  }

  // ---------- 粒子 ----------
  burst(x, y, z, tile) {
    const c = this.g.atlas.avg[tile] || [200, 200, 200];
    const mat = new THREE.MeshLambertMaterial();
    mat.color.setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace);
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(this.partGeo, mat);
      m.position.set(x + (Math.random() - 0.5) * 0.7, y + (Math.random() - 0.5) * 0.7, z + (Math.random() - 0.5) * 0.7);
      m.userData.v = new THREE.Vector3((Math.random() - 0.5) * 3.5, Math.random() * 4 + 1, (Math.random() - 0.5) * 3.5);
      m.userData.life = 0.5 + Math.random() * 0.4;
      m.userData.mat = i === 0 ? mat : null;
      this.g.scene.add(m);
      this.parts.push(m);
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
    const pcx = Math.floor(p.x / CELL), pcz = Math.floor(p.z / CELL);
    const want = new Set();
    let best = null, bestD = 1e9;
    for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) {
      const c = this.crystalAt(pcx + dx, pcz + dz);
      if (!c || g.crystals.has(c.id)) continue;
      const dist = Math.hypot(c.x - p.x, c.z - p.z);
      if (dist < bestD) { bestD = dist; best = c; }
      if (Math.abs(dx) > 3 || Math.abs(dz) > 3) continue;
      want.add(c.id);
      if (!this.crystals.has(c.id)) {
        const h = Math.max(w.height(Math.floor(c.x), Math.floor(c.z)), SEA);
        const grp = new THREE.Group();
        grp.position.set(c.x, h + 2.6, c.z);
        const gem = new THREE.Mesh(this.cGeo, this.cMat);
        gem.scale.y = 1.5;
        const glow = new THREE.Sprite(this.cGlow);
        glow.scale.setScalar(2.6);
        const beam = new THREE.Mesh(this.beamGeo, this.beamMat);
        beam.position.y = 36;
        grp.add(gem, glow, beam);
        grp.userData = { gem, baseY: h + 2.6, c };
        g.scene.add(grp);
        this.crystals.set(c.id, grp);
      }
    }
    this.nearest = best ? { x: best.x, z: best.z, dist: bestD } : null;
    for (const [id, grp] of this.crystals) {
      if (!want.has(id)) { g.scene.remove(grp); this.crystals.delete(id); continue; }
      const u = grp.userData;
      u.gem.rotation.y += dt * 1.6;
      grp.position.y = u.baseY + Math.sin(this.time * 2 + u.c.x) * 0.2;
      const dx = grp.position.x - p.x, dy = grp.position.y - (p.y + 0.9), dz = grp.position.z - p.z;
      if (dx * dx + dy * dy + dz * dz < 2.6) {
        g.scene.remove(grp); this.crystals.delete(id);
        g.collectCrystal(id);
      }
    }
  }

  // ---------- 团子 ----------
  spawnMob() {
    const g = this.g, w = g.world, p = g.player.pos;
    const a = Math.random() * Math.PI * 2, r = 14 + Math.random() * 26;
    const x = Math.floor(p.x + Math.cos(a) * r), z = Math.floor(p.z + Math.sin(a) * r);
    if (!w.getChunk(x >> 4, z >> 4)) return;
    const y = w.getTop(x, z), id = w.getBlock(x, y, z);
    if (id !== B.GRASS && id !== B.SNOWGRASS && id !== B.SAND) return;
    if (w.getBlock(x, y + 1, z) === B.WATER || y < SEA) return;
    const m = makeMob(PASTEL[Math.floor(Math.random() * PASTEL.length)]);
    const s = 0.8 + Math.random() * 0.5;
    m.root.scale.setScalar(s);
    Object.assign(m, { x: x + 0.5, y: y + 1, z: z + 0.5, vy: 0, hv: 0, heading: Math.random() * 6.28, timer: Math.random() * 2, ground: false, phase: Math.random() * 6 });
    g.scene.add(m.root);
    this.mobs.push(m);
  }

  updateMobs(dt) {
    const g = this.g, w = g.world, p = g.player.pos;
    this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawnT = 0.7; if (this.mobs.length < 10) this.spawnMob(); }
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
          if (Math.random() < 0.35) m.heading += (Math.random() - 0.5) * 2.6;
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
    }
  }

  update(dt) {
    this.time += dt;
    this.updateCrystals(dt);
    this.updateMobs(dt);
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const m = this.parts[i], u = m.userData;
      u.life -= dt;
      if (u.life <= 0) { this.g.scene.remove(m); if (u.mat) u.mat.dispose(); this.parts.splice(i, 1); continue; }
      u.v.y -= 16 * dt;
      m.position.addScaledVector(u.v, dt);
      m.rotation.x += dt * 6; m.rotation.y += dt * 4;
      m.scale.setScalar(Math.min(1, u.life * 3));
    }
  }
}
