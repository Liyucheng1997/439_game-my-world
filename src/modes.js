// 游戏模式的公共接口 + 自由模式
import { DEFS, PALETTE } from './blocks.js';
import { sfx } from './audio.js';

const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];

// 从玩家看向 (x,z) 的方向箭头
export function arrowTo(g, x, z) {
  const p = g.player, dx = x - p.pos.x, dz = z - p.pos.z, sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
  const ang = Math.atan2(dx * cos - dz * sin, -dx * sin - dz * cos);
  return ARROWS[(Math.round(ang / (Math.PI / 4)) + 8) % 8];
}

export function posLine(g) {
  const p = g.player, hh = Math.floor(g.time * 24), mm = Math.floor((g.time * 24 - hh) * 60);
  return `<span class="dim">坐标 ${Math.floor(p.pos.x)}, ${Math.floor(p.pos.y)}, ${Math.floor(p.pos.z)} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}${p.fly ? ' · 飞行中' : ''}</span>`;
}

export class Mode {
  constructor(game) {
    this.g = game;
    this.rules = { fly: true, mobs: true, infinite: true, timeFlow: true };
    this.music = 'calm';
  }
  spawn() { return null; }                 // 指定出生点 {x,y,z,yaw}
  start() {}                               // 世界加载好之后
  unlocked(id) { return true; }            // 这个方块现在能不能用
  placeId(x, y, z) { return this.g.hotbar[this.g.slot]; } // 往这一格放什么（0 = 不能放）
  canBreak(h) { return true; }
  onPlace(x, y, z, id) {}
  onBreak(h) {}
  click(button) { return false; }          // 返回 true 表示这次点击被模式用掉了
  key(code) { return false; }
  onCrystal(id) {}
  update(dt) {}
  hud() { return ['', '']; }
  palette() { return { title: '', tip: '', items: [] }; }
  serialize() { return {}; }
  dispose() {}
}

// 自由模式：方块无限，收集星晶解锁新方块
export class FreeMode extends Mode {
  constructor(game) {
    super(game);
    this.name = '自由模式';
  }

  unlocked(id) { return DEFS[id].unlock <= this.g.crystals.size; }

  onCrystal() {
    const g = this.g, n = g.crystals.size;
    g.ui.toast(`✦ 获得星晶！（共 ${n} 颗）`);
    const got = PALETTE.filter((b) => DEFS[b].unlock === n).map((b) => DEFS[b].name);
    if (got.length) {
      sfx('unlock');
      g.ui.toast(`解锁新方块：${got.length > 3 ? got.slice(0, 3).join('、') + ' 等 ' + got.length + ' 种' : got.join('、')}（按 E 查看）`);
    }
  }

  hud() {
    const g = this.g, n = g.crystals.size;
    const next = PALETTE.map((id) => DEFS[id]).filter((d) => d.unlock > n).sort((a, b) => a.unlock - b.unlock)[0];
    let nav = '附近没有星晶，去远方看看';
    const c = g.ents.nearest;
    if (c) nav = `最近星晶 ${arrowTo(g, c.x, c.z)} ${Math.round(c.dist)} 米`;
    return [
      `<b>✦ ${n}</b> 星晶${next ? ` <span class="dim">· 再集 ${next.unlock - n} 颗解锁「${next.name}」</span>` : ' <span class="dim">· 已解锁全部方块</span>'}<br>${nav}<br>${posLine(g)}`,
      '',
    ];
  }

  palette() {
    return {
      title: '方块图鉴',
      tip: '点击方块放进当前选中的快捷栏格子 · 收集星晶 ✦ 解锁更多方块 · 按 E 或 Esc 关闭',
      items: PALETTE.map((id) => {
        const ok = this.unlocked(id);
        return { id, ok, sub: ok ? '' : `✦ ${DEFS[id].unlock}` };
      }),
    };
  }
}
