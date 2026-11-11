// 方块定义 + 程序化生成的贴图图集（全部贴图由代码绘制，属于本项目原创）
import { hash2 } from './noise.js';

export const TS = 32; // 单个贴图像素
export const AT = 16; // 图集每行贴图数

// 贴图编号
const T = {
  GRASS_TOP: 0, GRASS_SIDE: 1, DIRT: 2, STONE: 3, SAND: 4, LOG_SIDE: 5, LOG_TOP: 6, LEAVES: 7,
  PLANKS: 8, BRICK: 9, GLASS: 10, WATER: 11, SNOW: 12, SNOW_SIDE: 13, LAMP: 14, COBBLE: 15,
  ICE: 16, CACTUS_SIDE: 17, CACTUS_TOP: 18, BIRCH_SIDE: 19, PINE_LEAVES: 20, BEDROCK: 21,
  BOUNCE: 22, SPEED: 23, TALLGRASS: 24, FLOWER_R: 25, FLOWER_Y: 26, FLOWER_B: 27,
  COLOR0: 28, // 28..37 十种彩色块
  STONEBRICK: 38, ROOF: 39, BIRCH_LEAVES: 40, SANDSTONE: 41,
};

export const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, LOG: 5, LEAVES: 6, PLANKS: 7, BRICK: 8, GLASS: 9,
  WATER: 10, SNOW: 11, SNOWGRASS: 12, LAMP: 13, COBBLE: 14, ICE: 15, CACTUS: 16, BIRCH: 17,
  PINELEAVES: 18, BEDROCK: 19, BOUNCE: 20, SPEED: 21, TALLGRASS: 22, FLOWER_R: 23, FLOWER_Y: 24,
  FLOWER_B: 25, COLOR0: 26, STONEBRICK: 36, ROOF: 37, BIRCHLEAVES: 38, SANDSTONE: 39,
};

const COLORS = [
  ['白色块', [236, 238, 240]], ['红色块', [214, 64, 58]], ['橙色块', [240, 140, 44]], ['黄色块', [248, 210, 62]],
  ['绿色块', [96, 184, 72]], ['青色块', [60, 190, 190]], ['蓝色块', [60, 110, 220]], ['紫色块', [146, 84, 206]],
  ['粉色块', [244, 150, 190]], ['黑色块', [44, 44, 52]],
];

// layer: 0 不透明  1 镂空(植物)  2 半透明  3 自发光
export const DEFS = [];
function def(id, name, tiles, o = {}) {
  DEFS[id] = Object.assign({
    id, name, tiles: tiles.length === 1 ? [tiles[0], tiles[0], tiles[0]] : tiles, // [顶, 侧, 底]
    solid: true, opaque: true, layer: 0, plant: false, liquid: false, unlock: 0, vary: false,
  }, o);
}
const plant = { solid: false, opaque: false, layer: 1, plant: true };
def(B.AIR, '空气', [0], { solid: false, opaque: false });
def(B.GRASS, '草地', [T.GRASS_TOP, T.GRASS_SIDE, T.DIRT], { vary: true });
def(B.DIRT, '泥土', [T.DIRT]);
def(B.STONE, '石头', [T.STONE]);
def(B.SAND, '沙子', [T.SAND], { vary: true });
def(B.LOG, '橡木', [T.LOG_TOP, T.LOG_SIDE, T.LOG_TOP]);
def(B.LEAVES, '树叶', [T.LEAVES], { vary: true });
def(B.PLANKS, '木板', [T.PLANKS]);
def(B.BRICK, '红砖', [T.BRICK]);
def(B.GLASS, '玻璃', [T.GLASS], { opaque: false, layer: 2, unlock: 1 });
def(B.WATER, '水', [T.WATER], { solid: false, opaque: false, layer: 2, liquid: true, unlock: 4 });
def(B.SNOW, '雪块', [T.SNOW]);
def(B.SNOWGRASS, '雪地', [T.SNOW, T.SNOW_SIDE, T.DIRT]);
def(B.LAMP, '暖光灯', [T.LAMP], { layer: 3, unlock: 2 });
def(B.COBBLE, '卵石', [T.COBBLE]);
def(B.ICE, '冰', [T.ICE], { opaque: false, layer: 2 });
def(B.CACTUS, '仙人掌', [T.CACTUS_TOP, T.CACTUS_SIDE, T.CACTUS_TOP]);
def(B.BIRCH, '白桦木', [T.LOG_TOP, T.BIRCH_SIDE, T.LOG_TOP]);
def(B.PINELEAVES, '松针', [T.PINE_LEAVES], { vary: true });
def(B.BEDROCK, '基岩', [T.BEDROCK]);
def(B.BOUNCE, '弹跳块', [T.BOUNCE], { unlock: 3 });
def(B.SPEED, '疾风块', [T.SPEED], { unlock: 7 });
def(B.TALLGRASS, '草丛', [T.TALLGRASS], plant);
def(B.FLOWER_R, '红花', [T.FLOWER_R], plant);
def(B.FLOWER_Y, '黄花', [T.FLOWER_Y], plant);
def(B.FLOWER_B, '蓝花', [T.FLOWER_B], plant);
COLORS.forEach((c, i) => def(B.COLOR0 + i, c[0], [T.COLOR0 + i], { unlock: 5 }));
def(B.STONEBRICK, '石砖', [T.STONEBRICK]);
def(B.ROOF, '屋瓦', [T.ROOF]);
def(B.BIRCHLEAVES, '嫩叶', [T.BIRCH_LEAVES], { vary: true });
def(B.SANDSTONE, '砂岩', [T.SANDSTONE]);

// 方块面板里的排列顺序
export const PALETTE = [
  B.GRASS, B.DIRT, B.STONE, B.COBBLE, B.SAND, B.SANDSTONE, B.SNOW, B.ICE,
  B.LOG, B.BIRCH, B.PLANKS, B.LEAVES, B.BIRCHLEAVES, B.PINELEAVES, B.CACTUS,
  B.BRICK, B.STONEBRICK, B.ROOF, B.TALLGRASS, B.FLOWER_R, B.FLOWER_Y, B.FLOWER_B,
  B.GLASS, B.LAMP, B.BOUNCE, B.WATER,
  ...COLORS.map((_, i) => B.COLOR0 + i), B.SPEED,
];

export function buildAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TS * AT;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(TS, TS);
  const d = img.data;
  const avg = [];
  let cur = 0;
  const n = (x, y, s = 0) => hash2(x, y, s + cur * 31 + 5);
  const m = (c, f) => [c[0] * f, c[1] * f, c[2] * f, 255];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, 255];

  function tile(i, fn) {
    cur = i;
    let r = 0, g = 0, b = 0, cnt = 0;
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const c = fn(x, y), o = (y * TS + x) * 4;
      const a = c[3] === undefined ? 255 : c[3];
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = a;
      if (a > 100) { r += c[0]; g += c[1]; b += c[2]; cnt++; }
    }
    ctx.putImageData(img, (i % AT) * TS, Math.floor(i / AT) * TS);
    cnt = cnt || 1;
    avg[i] = [r / cnt, g / cnt, b / cnt];
  }

  const dirt = (x, y) => {
    const c = m([136, 97, 66], 0.86 + 0.26 * n(x, y, 1));
    return n(x >> 1, y >> 1, 2) > 0.9 ? m(c, 1.22) : n(x >> 1, y >> 1, 3) > 0.92 ? m(c, 0.75) : c;
  };
  const grass = (x, y) => {
    const c = m([104, 172, 74], 0.86 + 0.22 * n(x, y, 1));
    return n(x, y >> 1, 4) > 0.86 ? m(c, 0.82) : n(x, y >> 1, 5) > 0.9 ? m(c, 1.14) : c;
  };
  const snow = (x, y) => m([240, 246, 252], 0.95 + 0.05 * n(x >> 1, y >> 1, 1));
  const edge = (x, y, w = 1) => x < w || y < w || x >= TS - w || y >= TS - w;

  tile(T.GRASS_TOP, grass);
  tile(T.DIRT, dirt);
  tile(T.GRASS_SIDE, (x, y) => (y < 5 + n(x, 0, 9) * 5 ? grass(x, y) : dirt(x, y)));
  tile(T.STONE, (x, y) => {
    let f = 0.8 + 0.16 * n(x >> 2, y >> 2, 1) + 0.1 * n(x, y, 2);
    if (n((x + y) >> 3, (x - y + 64) >> 2, 3) > 0.9) f *= 0.84;
    return m([132, 134, 140], f);
  });
  tile(T.SAND, (x, y) => m([224, 206, 152], 0.92 + 0.1 * n(x, y, 1) + (n(x >> 1, y, 2) > 0.93 ? -0.1 : 0)));
  tile(T.LOG_SIDE, (x, y) => m([112, 82, 50], 0.74 + 0.3 * n(x, y >> 3, 1) + 0.08 * n(x, y, 2)));
  tile(T.LOG_TOP, (x, y) => {
    if (edge(x, y, 3)) return m([104, 76, 46], 0.8 + 0.2 * n(x, y, 1));
    const r = Math.hypot(x - 15.5, y - 15.5);
    return m([196, 160, 104], 0.84 + 0.14 * Math.sin(r * 1.6) + 0.05 * n(x, y, 2));
  });
  const leaves = (base) => (x, y) => {
    const f = 0.84 + 0.22 * n(x >> 1, y >> 1, 1);
    return n(x >> 1, y >> 1, 2) > 0.84 ? m(base, 0.7) : n(x, y, 3) > 0.93 ? m(base, 1.2) : m(base, f);
  };
  tile(T.LEAVES, leaves([62, 134, 54]));
  tile(T.PINE_LEAVES, leaves([40, 96, 62]));
  tile(T.BIRCH_LEAVES, leaves([128, 178, 70]));
  tile(T.PLANKS, (x, y) => {
    const row = y >> 3;
    if ((y & 7) === 7) return [118, 88, 52, 255];
    if (x === Math.floor(n(row, 0, 7) * 28) + 2) return [128, 96, 58, 255];
    return m([190, 150, 96], 0.88 + 0.14 * n(row, 1, 1) + 0.07 * n(x >> 2, y, 2));
  });
  tile(T.BRICK, (x, y) => {
    const row = y >> 3, xo = (x + (row & 1) * 8) & 31;
    if ((y & 7) === 7 || (xo & 15) === 15) return m([204, 198, 186], 0.94 + 0.08 * n(x, y, 1));
    return m([172, 82, 62], 0.82 + 0.3 * n(xo >> 4, row, 2) + 0.07 * n(x, y, 3));
  });
  tile(T.STONEBRICK, (x, y) => {
    const row = y >> 4, xo = (x + (row & 1) * 8) & 31;
    if ((y & 15) === 15 || (xo & 15) === 15) return [92, 94, 100, 255];
    const hi = (y & 15) === 0 || (xo & 15) === 0 ? 1.1 : 1;
    return m([150, 152, 158], hi * (0.88 + 0.12 * n(xo >> 4, row, 2) + 0.08 * n(x, y, 3)));
  });
  tile(T.GLASS, (x, y) => {
    if (edge(x, y, 2)) return [222, 240, 248, 255];
    const k = x - y;
    if (k === 6 || k === 7 || k === -9) return [255, 255, 255, 130];
    return [196, 228, 244, 46];
  });
  tile(T.WATER, (x, y) => {
    const w = 0.92 + 0.1 * Math.sin((x + y * 0.5) * 0.4) * Math.sin(y * 0.4) + 0.04 * n(x, y, 1);
    return [46 * w, 118 * w, 214 * w, 176];
  });
  tile(T.SNOW, snow);
  tile(T.SNOW_SIDE, (x, y) => (y < 6 + n(x >> 1, 0, 9) * 4 ? snow(x, y) : dirt(x, y)));
  tile(T.LAMP, (x, y) => {
    if (edge(x, y, 2)) return [150, 108, 58, 255];
    if (edge(x, y, 4)) return [226, 170, 84, 255];
    const r = Math.hypot(x - 15.5, y - 15.5) / 16;
    return mix([255, 250, 214], [255, 214, 120], Math.min(1, r));
  });
  tile(T.COBBLE, (x, y) => {
    const cx = (x + ((y >> 3) & 1) * 4) >> 3, cy = y >> 3;
    const lx = (x + ((y >> 3) & 1) * 4) & 7, ly = y & 7;
    const r = Math.hypot(lx - 3.5, ly - 3.5);
    if (r > 3.9 + n(cx, cy, 4) * 0.8) return [78, 80, 86, 255];
    return m([146, 146, 150], 0.76 + 0.3 * n(cx, cy, 1) + 0.06 * n(x, y, 2) - r * 0.03);
  });
  tile(T.ICE, (x, y) => {
    const k = (x + y * 2) % 23;
    const f = k < 2 ? 1.12 : 0.96 + 0.05 * n(x >> 2, y >> 2, 1);
    return [168 * f, 208 * f, 244 * f, 205];
  });
  tile(T.CACTUS_SIDE, (x, y) => {
    if ((x & 7) === 3 && (y & 7) === (x >> 3 & 1) * 4) return [232, 236, 200, 255];
    return m([72, 146, 72], ((x & 7) === 7 ? 0.74 : 0.9) + 0.12 * n(x, y, 1));
  });
  tile(T.CACTUS_TOP, (x, y) => {
    const r = Math.hypot(x - 15.5, y - 15.5);
    return m([84, 160, 80], 0.86 + 0.12 * Math.sin(r * 1.2) + 0.06 * n(x, y, 1));
  });
  tile(T.BIRCH_SIDE, (x, y) => {
    if (n(x >> 2, y, 9) > 0.9 || n(x >> 3, y >> 1, 8) > 0.93) return [62, 58, 52, 255];
    return m([228, 226, 214], 0.92 + 0.08 * n(x, y >> 2, 1));
  });
  tile(T.BEDROCK, (x, y) => m([70, 70, 78], 0.55 + 0.7 * n(x >> 1, y >> 1, 1)));
  tile(T.BOUNCE, (x, y) => {
    if (edge(x, y, 2)) return [168, 46, 108, 255];
    const k = Math.max(Math.abs(x - 15.5), Math.abs(y - 15.5));
    return (k | 0) % 6 < 2 ? [255, 176, 214, 255] : [240, 92, 160, 255];
  });
  tile(T.SPEED, (x, y) => {
    if (edge(x, y, 2)) return [28, 120, 150, 255];
    const k = (y + Math.abs(x - 15.5)) | 0;
    return k % 10 < 3 ? [226, 252, 255, 255] : [70, 200, 232, 255];
  });
  tile(T.TALLGRASS, (x, y) => {
    const g = x >> 1;
    if (n(g, 0, 2) < 0.4 || (x & 1) !== (n(g, 0, 3) > 0.5 ? 1 : 0)) return [0, 0, 0, 0];
    const h = 9 + n(g, 0, 1) * 22;
    if (31 - y > h) return [0, 0, 0, 0];
    return m([92, 168, 66], 0.75 + 0.4 * ((31 - y) / h));
  });
  const flower = (petal, core) => (x, y) => {
    const dx = x - 15.5, dy = y - 9.5, r = Math.hypot(dx, dy);
    if (r < 2.3) return [...core, 255];
    if (r < 4.6 + 2.2 * Math.cos(5 * Math.atan2(dy, dx))) return m(petal, 0.9 + 0.1 * n(x, y, 1));
    if ((x === 15 || x === 16) && y > 10) return [70, 150, 60, 255];
    if ((y === 22 || y === 23) && x >= 11 && x < 15) return [84, 168, 66, 255];
    if ((y === 26 || y === 27) && x > 16 && x <= 20) return [84, 168, 66, 255];
    return [0, 0, 0, 0];
  };
  tile(T.FLOWER_R, flower([226, 62, 70], [250, 214, 80]));
  tile(T.FLOWER_Y, flower([250, 208, 60], [224, 120, 40]));
  tile(T.FLOWER_B, flower([92, 132, 240], [250, 240, 200]));
  COLORS.forEach((c, i) => tile(T.COLOR0 + i, (x, y) => {
    const f = edge(x, y, 1) ? 0.86 : edge(x, y, 2) ? 1.06 : 0.95 + 0.06 * n(x >> 1, y >> 1, 1);
    return m(c[1], f);
  }));
  tile(T.ROOF, (x, y) => {
    const row = y >> 3, lx = (x + (row & 1) * 4) & 7, ly = y & 7;
    const r = Math.hypot(lx - 3.5, ly + 0.5);
    if (r > 7.2) return [112, 44, 36, 255];
    return m([182, 76, 58], 0.8 + ly * 0.04 + 0.1 * n((x + (row & 1) * 4) >> 3, row, 1));
  });
  tile(T.SANDSTONE, (x, y) => {
    const f = 0.9 + 0.1 * n(0, y >> 2, 1) + 0.05 * n(x, y, 2);
    return m([216, 192, 132], (y & 15) === 15 ? 0.78 : f);
  });

  return { canvas, avg };
}

// 画一个等距视角的方块小图标（给物品栏用）
const iconCache = new Map();
export function blockIcon(atlasCanvas, id) {
  if (iconCache.has(id)) return iconCache.get(id);
  const def = DEFS[id];
  const c = document.createElement('canvas');
  c.width = c.height = 48;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const src = (t) => [(t % AT) * TS, Math.floor(t / AT) * TS, TS, TS];
  if (def.plant) {
    g.drawImage(atlasCanvas, ...src(def.tiles[1]), 4, 4, 40, 40);
  } else {
    const k = 1 / TS;
    const face = (t, a, b, cc, dd, e, f, dark) => {
      g.setTransform(a, b, cc, dd, e, f);
      g.drawImage(atlasCanvas, ...src(t), 0, 0, TS, TS);
      if (dark) { g.fillStyle = `rgba(0,0,0,${dark})`; g.fillRect(0, 0, TS, TS); }
    };
    face(def.tiles[0], 20 * k, 10 * k, -20 * k, 10 * k, 24, 3, 0);
    face(def.tiles[1], 20 * k, 10 * k, 0, 22 * k, 4, 13, 0.18);
    face(def.tiles[1], 20 * k, -10 * k, 0, 22 * k, 24, 23, 0.36);
    g.setTransform(1, 0, 0, 1, 0, 0);
  }
  const url = c.toDataURL();
  iconCache.set(id, url);
  return url;
}
