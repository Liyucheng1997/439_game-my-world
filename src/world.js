// 世界：区块数据、地形生成、网格构建
import * as THREE from 'three';
import { Simplex, hash2, smooth } from './noise.js';
import { B, DEFS, AT } from './blocks.js';

export const CS = 16;   // 区块边长
export const CH = 96;   // 世界高度
export const SEA = 20;  // 海平面

export const ckey = (cx, cz) => (cx + 30000) * 60001 + (cz + 30000);

const FACES = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
];
const CORN = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const AOB = [0.5, 0.68, 0.85, 1];

class Chunk {
  constructor(cx, cz) {
    this.cx = cx; this.cz = cz;
    this.data = new Uint8Array(CS * CS * CH);
    this.top = new Uint8Array(CS * CS);
    this.meshes = [];
    this.meshed = false;
    this.dirty = false;
    this.lamps = [];
  }
}

export class World {
  constructor(seed, scene, materials, edits, viewDist = 7) {
    this.seed = seed; this.scene = scene; this.materials = materials;
    this.edits = edits || new Map();
    this.chunks = new Map();
    this.R = viewDist;
    this.n1 = new Simplex(seed + 1); this.n2 = new Simplex(seed + 2); this.n3 = new Simplex(seed + 3);
    this.n4 = new Simplex(seed + 4); this.n5 = new Simplex(seed + 5); this.n6 = new Simplex(seed + 6);
    this._biome = 0;
    this._lk = -1; this._lc = null;
    this.order = [];
    for (let dx = -this.R - 1; dx <= this.R + 1; dx++)
      for (let dz = -this.R - 1; dz <= this.R + 1; dz++) this.order.push([dx, dz, dx * dx + dz * dz]);
    this.order.sort((a, b) => a[2] - b[2]);
    this.tick = 0;
  }

  // 地表高度；同时把生物群系写进 this._biome（0 平原 1 森林 2 沙漠 3 雪原）
  height(x, z) {
    const c = this.n1.fbm(x / 300, z / 300, 4);
    const hl = this.n2.fbm(x / 80, z / 80, 4);
    const mm = smooth(0.1, 0.55, this.n3.fbm(x / 420, z / 420, 2));
    const ridge = 1 - Math.abs(this.n4.fbm(x / 140, z / 140, 4));
    let h = Math.floor(24 + c * 11 + hl * 4.5 + mm * ridge * ridge * 36);
    h = Math.max(3, Math.min(CH - 22, h));
    const temp = this.n5.fbm(x / 380, z / 380, 2), moist = this.n6.fbm(x / 260, z / 260, 2);
    this._biome = temp < -0.3 ? 3 : temp > 0.3 && h < 40 ? 2 : moist > 0.05 ? 1 : 0;
    return h;
  }

  surface(h, b) {
    if (h > 52) return B.SNOW;
    if (h > 46) return B.STONE;
    if (h <= SEA + 1) return B.SAND;
    if (b === 2) return B.SAND;
    if (b === 3) return B.SNOWGRASS;
    return B.GRASS;
  }

  getChunk(cx, cz) { return this.chunks.get(ckey(cx, cz)); }

  getBlock(x, y, z) {
    if (y < 0) return B.BEDROCK;
    if (y >= CH) return 0;
    const k = ckey(x >> 4, z >> 4);
    let c;
    if (k === this._lk) c = this._lc;
    else { c = this.chunks.get(k); this._lk = k; this._lc = c; }
    if (!c) return 0;
    return c.data[(x & 15) + (z & 15) * 16 + y * 256];
  }

  getTop(x, z) {
    const c = this.chunks.get(ckey(x >> 4, z >> 4));
    return c ? c.top[(x & 15) + (z & 15) * 16] : 0;
  }

  isSolid(x, y, z) { return DEFS[this.getBlock(Math.floor(x), Math.floor(y), Math.floor(z))].solid; }

  _calcTop(c, lx, lz) {
    const d = c.data;
    let y = CH - 1;
    while (y > 0 && !DEFS[d[lx + lz * 16 + y * 256]].opaque) y--;
    c.top[lx + lz * 16] = y;
  }

  generate(cx, cz) {
    const c = new Chunk(cx, cz), d = c.data, seed = this.seed;
    const ox = cx * CS, oz = cz * CS, P = 3, W = CS + 2 * P;
    const hs = new Int16Array(W * W), bs = new Uint8Array(W * W);
    for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
      hs[x + z * W] = this.height(ox + x - P, oz + z - P);
      bs[x + z * W] = this._biome;
    }
    // 地形
    for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
      const i = lx + P + (lz + P) * W, h = hs[i], b = bs[i];
      const top = this.surface(h, b);
      const under = top === B.SAND ? (b === 2 && h > SEA + 1 ? B.SANDSTONE : B.SAND)
        : top === B.STONE || top === B.SNOW ? B.STONE : B.DIRT;
      const col = lx + lz * 16;
      for (let y = 0; y <= h; y++) d[col + y * 256] = y === 0 ? B.BEDROCK : y < h - 3 ? B.STONE : y < h ? under : top;
      for (let y = h + 1; y <= SEA; y++) d[col + y * 256] = b === 3 && y === SEA ? B.ICE : B.WATER;
    }
    const put = (gx, y, gz, id, soft) => {
      const lx = gx - ox, lz = gz - oz;
      if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || y >= CH) return;
      const i = lx + lz * 16 + y * 256;
      if (!soft || d[i] === 0) d[i] = id;
    };
    // 树木（可能跨区块，所以多看一圈）
    for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
      const h = hs[x + z * W], b = bs[x + z * W], gx = ox + x - P, gz = oz + z - P;
      if (h <= SEA + 1) continue;
      const s = this.surface(h, b), r = hash2(gx, gz, seed + 11), r2 = hash2(gx, gz, seed + 12);
      if (s === B.SAND) {
        if (b === 2 && r < 0.005) for (let i = 1; i <= 2 + Math.floor(r2 * 2); i++) put(gx, h + i, gz, B.CACTUS);
        continue;
      }
      if (s === B.SNOWGRASS) {
        if (r >= 0.014) continue;
        const th = 6 + Math.floor(r2 * 4);
        for (let k = 0; k <= th - 2; k++) {
          const y = h + th + 1 - k, rad = k === 0 ? 0 : k % 2 === 1 ? 1 : 2;
          for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
            if (Math.abs(dx) + Math.abs(dz) > rad + (rad === 2 ? 1 : 0)) continue;
            put(gx + dx, y, gz + dz, B.PINELEAVES, true);
          }
        }
        for (let i = 1; i <= th; i++) put(gx, h + i, gz, B.LOG);
        continue;
      }
      if (s !== B.GRASS || r >= (b === 1 ? 0.035 : 0.004)) continue;
      const birch = b === 1 && r2 > 0.65;
      const th = (birch ? 5 : 4) + Math.floor(hash2(gx, gz, seed + 13) * 3);
      const leaf = birch ? B.BIRCHLEAVES : B.LEAVES;
      for (let dy = th - 2; dy <= th + 1; dy++) {
        const rad = dy >= th ? 1 : 2;
        for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
          if (Math.abs(dx) === rad && Math.abs(dz) === rad && (dy > th || hash2(gx + dx * 7 + dy, gz + dz * 5, seed + 14) > 0.45)) continue;
          put(gx + dx, h + dy, gz + dz, leaf, true);
        }
      }
      for (let i = 1; i <= th; i++) put(gx, h + i, gz, birch ? B.BIRCH : B.LOG);
    }
    // 花草
    for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
      const i = lx + P + (lz + P) * W, h = hs[i], b = bs[i], col = lx + lz * 16;
      if (d[col + h * 256] !== B.GRASS || d[col + (h + 1) * 256] !== 0) continue;
      const r = hash2(ox + lx, oz + lz, seed + 23);
      const g = b === 1 ? 0.07 : 0.14;
      if (r < g) d[col + (h + 1) * 256] = B.TALLGRASS;
      else if (r < g + 0.02) d[col + (h + 1) * 256] = B.FLOWER_R + Math.floor((r - g) / 0.02 * 3);
    }
    // 玩家改动
    const e = this.edits.get(ckey(cx, cz));
    if (e) for (const [i, id] of e) d[i] = id;
    for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) this._calcTop(c, lx, lz);
    this.chunks.set(ckey(cx, cz), c);
    this._lk = -1;
    return c;
  }

  setBlock(x, y, z, id) {
    if (y < 1 || y >= CH) return false;
    const cx = x >> 4, cz = z >> 4, k = ckey(cx, cz), c = this.chunks.get(k);
    if (!c) return false;
    const lx = x & 15, lz = z & 15, i = lx + lz * 16 + y * 256;
    c.data[i] = id;
    let e = this.edits.get(k);
    if (!e) this.edits.set(k, (e = new Map()));
    e.set(i, id);
    this._calcTop(c, lx, lz);
    // 支撑没了，上面的花草也消失
    if (!DEFS[id].solid && y + 1 < CH && DEFS[c.data[i + 256]].plant) { c.data[i + 256] = 0; e.set(i + 256, 0); }
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if ((dx === -1 && lx !== 0) || (dx === 1 && lx !== 15) || (dz === -1 && lz !== 0) || (dz === 1 && lz !== 15)) continue;
      const nc = this.getChunk(cx + dx, cz + dz);
      if (nc && nc.meshed) this.meshChunk(nc);
    }
    return true;
  }

  meshChunk(c) {
    const world = this, d = c.data, ox = c.cx * CS, oz = c.cz * CS;
    const L = [0, 1, 2, 3].map(() => ({ pos: [], nor: [], uv: [], col: [], idx: [] }));
    const get = (x, y, z) => {
      if (y < 0) return B.BEDROCK;
      if (y >= CH) return 0;
      if (x >= 0 && x < 16 && z >= 0 && z < 16) return d[x + z * 16 + y * 256];
      return world.getBlock(ox + x, y, oz + z);
    };
    const opq = (x, y, z) => (DEFS[get(x, y, z)].opaque ? 1 : 0);
    const aos = [3, 3, 3, 3];
    c.lamps = [];
    let maxY = 0;
    for (let i = 0; i < 256; i++) if (c.top[i] > maxY) maxY = c.top[i];
    maxY = Math.min(CH - 1, Math.max(maxY, SEA) + 2);
    // 玩家可能在高处建造：找到真正有方块的最高层
    for (let y = CH - 1; y > maxY; y--) {
      let any = false;
      for (let i = y * 256, e = i + 256; i < e; i++) if (d[i]) { any = true; break; }
      if (any) { maxY = y; break; }
    }

    for (let y = 0; y <= maxY; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const id = d[x + z * 16 + y * 256];
      if (!id) continue;
      const def = DEFS[id];
      if (id === B.LAMP) c.lamps.push([ox + x + 0.5, y + 0.5, oz + z + 0.5]);

      if (def.plant) {
        const M = L[1], t = def.tiles[1], tx = t % AT, ty = Math.floor(t / AT);
        const jx = (hash2(ox + x, oz + z, 91) - 0.5) * 0.3, jz = (hash2(ox + x, oz + z, 92) - 0.5) * 0.3;
        const top = c.top[x + z * 16], depth = top - y;
        const br = depth > 0 ? Math.max(0.5, 1 - 0.07 * depth) : 1;
        for (let q = 0; q < 2; q++) {
          const base = M.pos.length / 3;
          const x0 = x + 0.15 + jx, x1 = x + 0.85 + jx;
          const z0 = z + (q ? 0.85 : 0.15) + jz, z1 = z + (q ? 0.15 : 0.85) + jz;
          M.pos.push(x0, y, z0, x1, y, z1, x1, y + 0.9, z1, x0, y + 0.9, z0);
          for (let k = 0; k < 4; k++) { M.nor.push(0, 1, 0); M.col.push(br, br, br); }
          const u0 = (tx + 0.02) / AT, u1 = (tx + 0.98) / AT, v0 = 1 - (ty + 0.98) / AT, v1 = 1 - (ty + 0.02) / AT;
          M.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
          // 正反两面都画，法线统一朝上，两面受光一致
          M.idx.push(base, base + 1, base + 2, base, base + 2, base + 3, base, base + 2, base + 1, base, base + 3, base + 2);
        }
        continue;
      }

      const lower = def.liquid && !DEFS[get(x, y + 1, z)].liquid;
      const vary = def.vary ? 0.93 + 0.12 * hash2(ox + x + y * 31, oz + z, 55) : 1;
      for (let f = 0; f < 6; f++) {
        const F = FACES[f], n = F.n, u = F.u, v = F.v;
        const nx = x + n[0], ny = y + n[1], nz = z + n[2];
        const nb = get(nx, ny, nz);
        if (DEFS[nb].opaque || (nb === id && !def.opaque)) continue;
        const M = L[def.layer];
        const t = def.tiles[f === 2 ? 0 : f === 3 ? 2 : 1], tx = t % AT, ty = Math.floor(t / AT);
        let light = vary;
        if (def.layer !== 3) {
          const top = nx >= 0 && nx < 16 && nz >= 0 && nz < 16 ? c.top[nx + nz * 16] : world.getTop(ox + nx, oz + nz);
          const depth = top - ny;
          if (depth > 0) light *= Math.max(0.5, 1 - 0.07 * depth);
        }
        const base = M.pos.length / 3;
        for (let k = 0; k < 4; k++) {
          const a = CORN[k][0], b = CORN[k][1];
          let py = y + 0.5 + 0.5 * (n[1] + a * u[1] + b * v[1]);
          if (lower && py > y + 0.9) py = y + 0.875;
          M.pos.push(x + 0.5 + 0.5 * (n[0] + a * u[0] + b * v[0]), py, z + 0.5 + 0.5 * (n[2] + a * u[2] + b * v[2]));
          M.nor.push(n[0], n[1], n[2]);
          const uu = (a + 1) * 0.48 + 0.02, vv = (b + 1) * 0.48 + 0.02;
          M.uv.push((tx + uu) / AT, 1 - (ty + 1 - vv) / AT);
          let ao = 3;
          if (def.layer === 0) {
            const s1 = opq(nx + a * u[0], ny + a * u[1], nz + a * u[2]);
            const s2 = opq(nx + b * v[0], ny + b * v[1], nz + b * v[2]);
            const cc = opq(nx + a * u[0] + b * v[0], ny + a * u[1] + b * v[1], nz + a * u[2] + b * v[2]);
            ao = s1 && s2 ? 0 : 3 - s1 - s2 - cc;
          }
          aos[k] = ao;
          const br = AOB[ao] * light;
          M.col.push(br, br, br);
        }
        if (aos[0] + aos[2] > aos[1] + aos[3]) M.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        else M.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
      }
    }

    this._disposeMeshes(c);
    for (let l = 0; l < 4; l++) {
      const M = L[l];
      if (!M.idx.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(M.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(M.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(M.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(M.col, 3));
      g.setIndex(M.idx);
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, this.materials[l]);
      mesh.position.set(ox, 0, oz);
      mesh.castShadow = l === 0;
      mesh.receiveShadow = l !== 3;
      if (l === 2) mesh.renderOrder = 2;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.scene.add(mesh);
      c.meshes.push(mesh);
    }
    c.meshed = true; c.dirty = false;
  }

  _disposeMeshes(c) {
    for (const m of c.meshes) { this.scene.remove(m); m.geometry.dispose(); }
    c.meshes = [];
  }

  // 每帧调用：按距离逐步生成 / 构建周围区块
  pump(px, pz, genBudget = 3, meshBudget = 2) {
    const pcx = Math.floor(px) >> 4, pcz = Math.floor(pz) >> 4, R = this.R;
    let gen = 0, mesh = 0;
    for (const [dx, dz] of this.order) {
      if (this.chunks.has(ckey(pcx + dx, pcz + dz))) continue;
      this.generate(pcx + dx, pcz + dz);
      if (++gen >= genBudget) break;
    }
    for (const [dx, dz] of this.order) {
      if (Math.abs(dx) > R || Math.abs(dz) > R) continue;
      const cx = pcx + dx, cz = pcz + dz, c = this.getChunk(cx, cz);
      if (!c || (c.meshed && !c.dirty)) continue;
      let ok = true;
      for (let a = -1; a <= 1 && ok; a++) for (let b = -1; b <= 1; b++) if (!this.getChunk(cx + a, cz + b)) { ok = false; break; }
      if (!ok) continue;
      this.meshChunk(c);
      if (++mesh >= meshBudget) break;
    }
    if (++this.tick % 90 === 0) {
      for (const [k, c] of this.chunks) {
        if (Math.abs(c.cx - pcx) > R + 3 || Math.abs(c.cz - pcz) > R + 3) {
          this._disposeMeshes(c); this.chunks.delete(k);
        }
      }
      this._lk = -1;
    }
    return gen + mesh;
  }

  ready(x, z) {
    const c = this.getChunk(Math.floor(x) >> 4, Math.floor(z) >> 4);
    return !!c && c.meshed;
  }
}
