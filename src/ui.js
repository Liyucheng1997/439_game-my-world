// 界面：快捷栏、方块图鉴 / 背包、HUD、提示
import { DEFS, blockIcon } from './blocks.js';
import { sfx } from './audio.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(game) {
    this.g = game;
    this.hotbarEl = $('hotbar'); this.hudEl = $('hud'); this.sideEl = $('side'); this.nameEl = $('blockname');
    this.nameTimer = 0;
    this.lastToast = new Map();
    this.hudA = ''; this.hudB = '';
  }

  icon(id) { return blockIcon(this.g.atlas.canvas, id); }

  renderHotbar() {
    const g = this.g, inf = g.rules.infinite;
    this.hotbarEl.innerHTML = g.hotbar.map((id, i) => {
      const n = id ? g.count(id) : 0;
      return `<div class="slot${i === g.slot ? ' on' : ''}${id && !inf && n <= 0 ? ' empty' : ''}"><i>${i + 1}</i>${id ? `<img src="${this.icon(id)}">` : ''}${id && !inf ? `<em>${n}</em>` : ''}</div>`;
    }).join('');
    const id = g.hotbar[g.slot];
    this.nameEl.textContent = id ? DEFS[id].name : '';
    this.nameEl.style.opacity = 1;
    clearTimeout(this.nameTimer);
    this.nameTimer = setTimeout(() => { this.nameEl.style.opacity = 0; }, 1800);
  }

  renderPalette() {
    const g = this.g, grid = $('grid'), P = g.modeObj.palette();
    $('pal-title').textContent = P.title;
    $('pal-tip').textContent = P.tip;
    grid.innerHTML = '';
    for (const it of P.items) {
      const el = document.createElement('div');
      el.className = 'item' + (it.ok ? '' : ' locked');
      el.innerHTML = `<img src="${this.icon(it.id)}">${DEFS[it.id].name}${it.sub ? `<br><span>${it.sub}</span>` : ''}`;
      if (it.ok) el.onclick = () => { sfx('pick'); g.hotbar[g.slot] = it.id; g.setSlot(g.slot); g.closePanel(); };
      grid.appendChild(el);
    }
  }

  // 同一句话 1.5 秒内不重复弹
  toast(msg) {
    const now = performance.now();
    if (now - (this.lastToast.get(msg) || 0) < 1500) return;
    this.lastToast.set(msg, now);
    if (this.lastToast.size > 40) this.lastToast.clear();
    const el = document.createElement('div');
    el.className = 'toast panel';
    el.textContent = msg;
    const box = $('toasts');
    box.appendChild(el);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => el.remove(), 3600);
  }

  updateHud() {
    const [a, b] = this.g.modeObj.hud();
    if (a !== this.hudA) { this.hudA = a; this.hudEl.innerHTML = a; }
    if (b !== this.hudB) { this.hudB = b; this.sideEl.innerHTML = b; this.sideEl.classList.toggle('hidden', !b); }
  }
}
