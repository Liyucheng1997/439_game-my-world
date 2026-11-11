// 界面：快捷栏、方块图鉴、HUD、提示
import { DEFS, PALETTE, blockIcon } from './blocks.js';

const $ = (id) => document.getElementById(id);
const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];

export class UI {
  constructor(game) {
    this.g = game;
    this.hotbarEl = $('hotbar'); this.hudEl = $('hud'); this.nameEl = $('blockname');
    this.nameTimer = 0;
  }

  icon(id) { return blockIcon(this.g.atlas.canvas, id); }

  renderHotbar() {
    const g = this.g;
    this.hotbarEl.innerHTML = g.hotbar.map((id, i) =>
      `<div class="slot${i === g.slot ? ' on' : ''}"><i>${i + 1}</i>${id ? `<img src="${this.icon(id)}">` : ''}</div>`).join('');
    const id = g.hotbar[g.slot];
    this.nameEl.textContent = id ? DEFS[id].name : '';
    this.nameEl.style.opacity = 1;
    clearTimeout(this.nameTimer);
    this.nameTimer = setTimeout(() => { this.nameEl.style.opacity = 0; }, 1800);
  }

  renderPalette() {
    const g = this.g, grid = $('grid');
    grid.innerHTML = '';
    for (const id of PALETTE) {
      const d = DEFS[id], ok = g.unlocked(id);
      const el = document.createElement('div');
      el.className = 'item' + (ok ? '' : ' locked');
      el.innerHTML = `<img src="${this.icon(id)}">${d.name}${ok ? '' : `<br><span>✦ ${d.unlock}</span>`}`;
      if (ok) el.onclick = () => { g.hotbar[g.slot] = id; g.setSlot(g.slot); g.closePalette(); };
      grid.appendChild(el);
    }
  }

  toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast panel';
    el.textContent = msg;
    const box = $('toasts');
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.remove(), 3000);
  }

  updateHud() {
    const g = this.g, p = g.player, n = g.crystals.size;
    const next = PALETTE.map((id) => DEFS[id]).filter((d) => d.unlock > n).sort((a, b) => a.unlock - b.unlock)[0];
    const hh = Math.floor(g.time * 24), mm = Math.floor((g.time * 24 - hh) * 60);
    let nav = '附近没有星晶，去远方看看';
    const c = g.ents.nearest;
    if (c) {
      const dx = c.x - p.pos.x, dz = c.z - p.pos.z, sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
      const ang = Math.atan2(dx * cos - dz * sin, -dx * sin - dz * cos);
      nav = `最近星晶 ${ARROWS[(Math.round(ang / (Math.PI / 4)) + 8) % 8]} ${Math.round(c.dist)} 米`;
    }
    this.hudEl.innerHTML =
      `<b>✦ ${n}</b> 星晶${next ? ` <span class="dim">· 再集 ${next.unlock - n} 颗解锁「${next.name}」</span>` : ' <span class="dim">· 已解锁全部方块</span>'}<br>` +
      `${nav}<br>` +
      `<span class="dim">坐标 ${Math.floor(p.pos.x)}, ${Math.floor(p.pos.y)}, ${Math.floor(p.pos.z)} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}${p.fly ? ' · 飞行中' : ''}</span>`;
  }
}
