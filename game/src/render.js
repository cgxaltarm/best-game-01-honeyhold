// Drawing only: the world's state and the current screen in, pixels out. The
// 1280x720 playfield is scaled to fit the window and centred. Everything is
// canvas 2D — no images, no network. The frame is dense by design: header,
// left panel, right panel, toolbar and a honeycomb board that fills the rest.
import {
  ENEMIES, FIELD, FLOWER_CELLS, FLOWER_EVERY, FLOWER_RATE, FONT, HEX, LAYOUT, MAX_HP, PALETTE,
  PATH_CELLS, TOWERS, TOWER_ORDER, WAVE_DEFS, WAVES,
} from './config.js';
import { hexAt, hexCenter } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_CLEAR = 'clear';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';
export const SCREEN_PAUSED = 'paused';

/** Clickable rects, shared with main.js for hit-testing. */
export const UI = {
  toolbarCards: TOWER_ORDER.map((_, i) => ({ x: 16 + i * 212, y: 634, w: 200, h: 76 })),
  startBtn: { x: 980, y: 634, w: 284, h: 76 },
  speedBtn: { x: 868, y: 634, w: 100, h: 76 },
  upgradeBtn: { x: 12, y: 428, w: 176, h: 40 },
  sellBtn: { x: 12, y: 476, w: 176, h: 40 },
};

// Title panel geometry (5 lines): h=150+5*30+170=470, y=(720-470)/2=125,
// button y=125+470-118=477. Initialised here so the button is clickable
// from the very first frame, before the first draw has run.
let lastButton = { x: 440, y: 477, w: 400, h: 60 };
/** The rect of the button the last overlay panel drew (null when none). */
export function overlayButton() { return lastButton; }

const PATH_SET = new Set(PATH_CELLS.map(([c, r]) => c + ',' + r));
const FLOWER_SET = new Set(FLOWER_CELLS.map(([c, r]) => c + ',' + r));

function hexPath(ctx, cx, cy, size) {
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const a = (Math.PI / 180) * (60 * i - 30);
    const x = cx + size * Math.cos(a);
    const y = cy + size * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export function createRenderer(canvas, seed) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();
  function text(value, x, y, size, color, align, bold) {
    const key = size + (bold ? 'b' : '');
    if (!fonts.has(key)) fonts.set(key, (bold ? 'bold ' : '') + size + 'px ' + FONT);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.fillText(String(value), x, y);
  }
  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }
  function panel(x, y, w, h, fill) {
    context.fillStyle = fill || PALETTE.panel;
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.beginPath();
    context.roundRect(x, y, w, h, 10);
    context.fill();
    context.stroke();
  }
  function heart(x, y, size, filled) {
    context.save();
    context.translate(x, y);
    context.scale(size / 16, size / 16);
    context.beginPath();
    context.moveTo(0, 5);
    context.bezierCurveTo(-11, -4, -6, -12, 0, -6);
    context.bezierCurveTo(6, -12, 11, -4, 0, 5);
    context.closePath();
    context.fillStyle = filled ? PALETTE.hp : '#c9b18a';
    context.fill();
    context.restore();
  }
  function drawBee(x, y, size, color, flash) {
    // Wings
    context.fillStyle = 'rgba(255,255,255,0.85)';
    context.beginPath(); context.ellipse(x - size * 0.35, y - size * 0.55, size * 0.42, size * 0.26, -0.5, 0, Math.PI * 2); context.fill();
    context.beginPath(); context.ellipse(x + size * 0.35, y - size * 0.55, size * 0.42, size * 0.26, 0.5, 0, Math.PI * 2); context.fill();
    // Body
    context.fillStyle = flash > 0 ? '#ffffff' : color;
    context.beginPath(); context.ellipse(x, y, size, size * 0.78, 0, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#3d2314';
    context.fillRect(x - size * 0.45, y - size * 0.5, size * 0.28, size);
    context.fillRect(x + size * 0.15, y - size * 0.6, size * 0.28, size * 1.2);
    // Eye
    context.fillStyle = '#3d2314';
    context.beginPath(); context.arc(x + size * 0.55, y - size * 0.2, size * 0.14, 0, Math.PI * 2); context.fill();
  }
  function drawEnemy(e, time) {
    const def = ENEMIES[e.type];
    const wob = Math.sin(time * 6 + e.wobble) * 2;
    const x = e.x;
    const y = e.y + wob;
    // Legs
    context.strokeStyle = '#2b1a08';
    context.lineWidth = 2;
    for (let l = -1; l <= 1; l += 1) {
      context.beginPath(); context.moveTo(x - 4, y); context.lineTo(x - 10, y + l * 8 + 6); context.stroke();
      context.beginPath(); context.moveTo(x + 4, y); context.lineTo(x + 10, y + l * 8 + 6); context.stroke();
    }
    context.fillStyle = def.color;
    context.beginPath(); context.arc(x, y, e.radius, 0, Math.PI * 2); context.fill();
    context.fillStyle = 'rgba(0,0,0,0.35)';
    context.beginPath(); context.arc(x - e.radius * 0.3, y - e.radius * 0.3, e.radius * 0.55, 0, Math.PI * 2); context.fill();
    if (e.type === 'wasp') {
      context.fillStyle = '#ffd23e';
      context.fillRect(x - e.radius * 0.7, y - 3, e.radius * 0.5, 6);
      context.fillRect(x + e.radius * 0.1, y - 3, e.radius * 0.5, 6);
      context.fillStyle = 'rgba(255,255,255,0.8)';
      context.beginPath(); context.ellipse(x, y - e.radius - 2, 7, 4, 0, 0, Math.PI * 2); context.fill();
    }
    if (e.type === 'beetle') {
      context.strokeStyle = '#2b1a08'; context.lineWidth = 2;
      context.beginPath(); context.moveTo(x, y - e.radius); context.lineTo(x, y + e.radius); context.stroke();
    }
    if (e.type === 'spider') {
      context.fillStyle = '#fff';
      context.beginPath(); context.arc(x - 4, y - 3, 2.5, 0, Math.PI * 2); context.fill();
      context.beginPath(); context.arc(x + 4, y - 3, 2.5, 0, Math.PI * 2); context.fill();
    }
    // HP bar
    const w = e.radius * 2 + 4;
    context.fillStyle = 'rgba(0,0,0,0.5)';
    context.fillRect(x - w / 2, y - e.radius - 10, w, 5);
    context.fillStyle = e.hp / e.maxHp > 0.5 ? '#7ed957' : e.hp / e.maxHp > 0.25 ? '#ffb703' : '#e63946';
    context.fillRect(x - w / 2, y - e.radius - 10, w * Math.max(0, e.hp / e.maxHp), 5);
  }

  function drawBoard(state, time, ui) {
    const b = LAYOUT.board;
    context.fillStyle = PALETTE.grass;
    context.fillRect(b.x, b.y, b.w, b.h);
    // Grass texture: seeded dots and tufts.
    let gs = (seed | 0) || 0x9e3779b9;
    const rnd = () => { gs ^= gs << 13; gs ^= gs >>> 17; gs ^= gs << 5; return (gs >>> 0) / 4294967296; };
    context.fillStyle = PALETTE.grassDark;
    for (let i = 0; i < 40; i += 1) {
      const x = b.x + rnd() * b.w;
      const y = b.y + rnd() * b.h;
      context.beginPath(); context.arc(x, y, 2 + rnd() * 3, 0, Math.PI * 2); context.fill();
    }
    context.strokeStyle = PALETTE.grassLight;
    context.lineWidth = 2;
    for (let i = 0; i < 24; i += 1) {
      const x = b.x + rnd() * b.w;
      const y = b.y + rnd() * b.h;
      context.beginPath(); context.moveTo(x, y); context.lineTo(x - 3, y - 7); context.moveTo(x + 3, y); context.lineTo(x + 6, y - 7); context.stroke();
    }
    // Hexes
    for (let row = 0; row < HEX.rows; row += 1) {
      for (let col = 0; col < HEX.cols; col += 1) {
        const c = hexCenter(col, row);
        const k = col + ',' + row;
        hexPath(context, c.x, c.y, HEX.size - 2);
        if (PATH_SET.has(k)) { context.fillStyle = PALETTE.hexPath; context.fill(); context.strokeStyle = PALETTE.hexPathEdge; }
        else if (FLOWER_SET.has(k)) { context.fillStyle = PALETTE.hexFlower; context.fill(); context.strokeStyle = PALETTE.hexFlowerEdge; }
        else { context.fillStyle = PALETTE.hexBuild; context.fill(); context.strokeStyle = PALETTE.hexBuildEdge; }
        context.lineWidth = 1.5;
        context.stroke();
      }
    }
    // Flowers on flower tiles
    for (const f of state.flowerCells) {
      const c = hexCenter(f.col, f.row);
      const petals = ['#ff6b9d', '#ffffff', '#c77dff', '#ff9f1c'];
      for (let p = 0; p < 5; p += 1) {
        const a = (p / 5) * Math.PI * 2 + time * 0.3;
        context.fillStyle = petals[p % petals.length];
        context.beginPath(); context.arc(c.x + Math.cos(a) * 7, c.y + Math.sin(a) * 7, 4.5, 0, Math.PI * 2); context.fill();
      }
      context.fillStyle = '#ffb703';
      context.beginPath(); context.arc(c.x, c.y, 4.5, 0, Math.PI * 2); context.fill();
    }
    // Path direction dots
    context.fillStyle = 'rgba(122,74,18,0.55)';
    for (let i = 0; i < PATH_CELLS.length - 1; i += 1) {
      const a = hexCenter(PATH_CELLS[i][0], PATH_CELLS[i][1]);
      const bb = hexCenter(PATH_CELLS[i + 1][0], PATH_CELLS[i + 1][1]);
      context.beginPath(); context.arc((a.x + bb.x) / 2, (a.y + bb.y) / 2, 3, 0, Math.PI * 2); context.fill();
    }
    // Hover hex + range preview
    if (ui.hoverHex && (ui.screen === SCREEN_PLAY)) {
      const c = hexCenter(ui.hoverHex.col, ui.hoverHex.row);
      const t = TOWERS[ui.selectedType];
      context.fillStyle = 'rgba(255,255,255,0.25)';
      hexPath(context, c.x, c.y, HEX.size - 2);
      context.fill();
      context.strokeStyle = 'rgba(255,255,255,0.9)';
      context.lineWidth = 2;
      context.beginPath(); context.arc(c.x, c.y, t.range, 0, Math.PI * 2); context.stroke();
    }
    // Selected tower range
    if (ui.selectedTower) {
      const t = ui.selectedTower;
      const stats = ui.towerStats(t.type, t.level);
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.beginPath(); context.arc(t.x, t.y, stats.range, 0, Math.PI * 2); context.fill();
      context.strokeStyle = '#fff';
      context.lineWidth = 1.5;
      context.beginPath(); context.arc(t.x, t.y, stats.range, 0, Math.PI * 2); context.stroke();
    }
    // Hive
    const h = state.hive;
    const pulse = 1 + Math.sin(time * 2) * 0.03;
    context.save();
    context.translate(h.x, h.y);
    context.scale(pulse, pulse);
    hexPath(context, 0, 0, 40);
    context.fillStyle = PALETTE.hexHive;
    context.fill();
    context.strokeStyle = '#8a5a1e'; context.lineWidth = 3; context.stroke();
    context.fillStyle = '#f48c06';
    for (let i = -1; i <= 1; i += 1) context.fillRect(-26, i * 14 - 3, 52, 6);
    context.fillStyle = '#3d2314';
    context.beginPath(); context.arc(0, 6, 9, 0, Math.PI * 2); context.fill();
    context.restore();
    text('HIVE', h.x, h.y - 46, 13, '#fff', 'center', true);
    // Towers
    for (const t of state.towers) {
      drawBee(t.x, t.y - 4, 15 + t.level * 2, TOWERS[t.type].color, t.flash);
      text('Lv' + t.level, t.x, t.y + 22, 11, '#3d2314', 'center', true);
      if (ui.selectedTower === t) {
        context.strokeStyle = '#fff'; context.lineWidth = 2.5;
        hexPath(context, t.x, t.y, HEX.size - 2);
        context.stroke();
      }
    }
    // Enemies
    for (const e of state.enemies) drawEnemy(e, time);
    // Projectiles
    for (const p of state.projectiles) {
      context.fillStyle = p.color;
      context.beginPath(); context.arc(p.x, p.y, 5, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#fff';
      context.beginPath(); context.arc(p.x, p.y, 2, 0, Math.PI * 2); context.fill();
    }
    // Particles
    for (const p of state.particles) {
      context.globalAlpha = Math.max(0, p.life * 2);
      context.fillStyle = p.color;
      context.beginPath(); context.arc(p.x, p.y, 3, 0, Math.PI * 2); context.fill();
    }
    context.globalAlpha = 1;
    // Floaters
    for (const f of state.floaters) {
      context.globalAlpha = Math.max(0, Math.min(1, f.life));
      text(f.text, f.x, f.y, 14, f.color, 'center', true);
    }
    context.globalAlpha = 1;
  }

  function drawHeader(state, best, ui) {
    const h = LAYOUT.header;
    context.fillStyle = PALETTE.header;
    context.fillRect(h.x, h.y, h.w, h.h);
    context.fillStyle = PALETTE.headerEdge;
    context.fillRect(0, h.h - 3, h.w, 3);
    text('🍯 HONEYHOLD', 16, 40, 26, PALETTE.gold, 'left', true);
    text('Defend the Hive', 16, 58, 12, '#d9a441', 'left');
    // Wave pill
    panel(300, 10, 150, 44, '#5a3a1a');
    text('WAVE ' + state.wave + ' / ' + WAVES, 375, 39, 20, '#fff', 'center', true);
    // Enemies left + progress
    const total = state.phase === 'wave'
      ? state.spawnQueue.length + state.enemies.length
      : (WAVE_DEFS[state.wave - 1] || []).reduce((s, [, n]) => s + n, 0);
    const done = (WAVE_DEFS[state.wave - 1] || []).reduce((s, [, n]) => s + n, 0);
    const progress = state.phase === 'wave' ? 1 - total / Math.max(1, done) : 0;
    text('ENEMIES LEFT: ' + total, 470, 30, 14, '#fff', 'left', true);
    context.fillStyle = '#2b1a08';
    context.fillRect(470, 38, 180, 10);
    context.fillStyle = '#ffb703';
    context.fillRect(470, 38, 180 * progress, 10);
    // Score
    text('SCORE', 690, 26, 12, '#d9a441', 'left', true);
    text(String(state.score), 690, 50, 22, '#fff', 'left', true);
    // Honey
    context.fillStyle = PALETTE.honey;
    context.beginPath(); context.arc(820, 32, 12, 0, Math.PI * 2); context.fill();
    context.beginPath(); context.moveTo(820, 14); context.lineTo(828, 30); context.lineTo(812, 30); context.closePath(); context.fill();
    text('HONEY', 840, 26, 12, '#d9a441', 'left', true);
    text(String(Math.floor(state.honey)), 840, 50, 22, '#ffb703', 'left', true);
    // Hive HP hearts: 10 hearts, each one is 2 HP.
    text('HIVE', 960, 26, 12, '#d9a441', 'left', true);
    for (let i = 0; i < MAX_HP / 2; i += 1) heart(968 + i * 13, 44, 12, i < Math.ceil(state.hp / 2));
    text(state.hp + '/' + MAX_HP, 960, 58, 11, '#fff', 'left');
    // Best + mute
    text('BEST ' + best, 1270, 26, 12, '#d9a441', 'right');
    text(ui.muted ? 'MUTED (M)' : 'SOUND ON (M)', 1270, 46, 12, '#fff', 'right');
  }

  function drawLeft(state, ui) {
    const p = LAYOUT.left;
    context.fillStyle = '#f7e3b0';
    context.fillRect(p.x, p.y, p.w, p.h);
    context.fillStyle = PALETTE.panelEdge;
    context.fillRect(p.x + p.w - 3, p.y, 3, p.h);
    text('TOWER', 14, 92, 16, PALETTE.panelDark, 'left', true);
    const sel = ui.selectedTower;
    const type = sel ? sel.type : ui.selectedType;
    const t = TOWERS[type];
    const level = sel ? sel.level : 1;
    const stats = ui.towerStats(type, level);
    // Bee preview
    panel(12, 102, 176, 92, '#fff8e7');
    drawBee(60, 148, 20, t.color, 0);
    text(t.name, 92, 132, 15, PALETTE.text, 'left', true);
    text('Lv ' + level + (sel ? '  •  ' + sel.kills + ' kills' : '  •  new'), 92, 154, 12, PALETTE.muted, 'left');
    text(t.desc, 92, 174, 11, PALETTE.muted, 'left');
    text('DMG ' + stats.dmg + '   RATE ' + stats.rate.toFixed(1) + '/s', 20, 216, 13, PALETTE.text, 'left', true);
    text('RANGE ' + stats.range + '   ' + (stats.splash ? 'SPLASH ' + stats.splash : 'SINGLE TARGET'), 20, 238, 13, PALETTE.text, 'left', true);
    text('DPS ' + Math.round(stats.dmg * stats.rate * (stats.splash ? 1.6 : 1)), 20, 260, 13, PALETTE.text, 'left', true);
    if (sel) {
      const upCost = ui.upgradeCost(sel);
      const sellVal = ui.sellValue(sel);
      const canUp = sel.level < 3;
      panel(UI.upgradeBtn.x, UI.upgradeBtn.y, UI.upgradeBtn.w, UI.upgradeBtn.h, canUp && state.honey >= upCost ? '#ffb703' : '#d9c49a');
      text(canUp ? 'UPGRADE  🍯' + upCost : 'MAX LEVEL', 100, 454, 14, PALETTE.text, 'center', true);
      panel(UI.sellBtn.x, UI.sellBtn.y, UI.sellBtn.w, UI.sellBtn.h, '#e8b04b');
      text('SELL  +' + sellVal + ' honey', 100, 502, 14, PALETTE.text, 'center', true);
    } else {
      panel(12, 428, 176, 88, '#fff8e7');
      text('Click a tower card below,', 100, 452, 12, PALETTE.text, 'center');
      text('then click a gold hex', 100, 470, 12, PALETTE.text, 'center');
      text('to place it. Cost: 🍯' + t.cost, 100, 492, 12, PALETTE.text, 'center', true);
    }
    text('HOW TO PLAY', 14, 552, 13, PALETTE.panelDark, 'left', true);
    const tips = ['1-4 pick a bee, click a hex', 'SPACE starts the wave', 'Flowers drip honey over time', 'Ants, wasps, beetles, spiders', 'march on the hive — stop them!', 'ESC pauses • M mutes'];
    tips.forEach((line, i) => text(line, 14, 572 + i * 15, 11.5, PALETTE.muted, 'left'));
  }

  function drawRight(state, best) {
    const p = LAYOUT.right;
    context.fillStyle = '#f7e3b0';
    context.fillRect(p.x, p.y, p.w, p.h);
    context.fillStyle = PALETTE.panelEdge;
    context.fillRect(p.x, p.y, 3, p.h);
    text('NEXT WAVE', 1094, 92, 16, PALETTE.panelDark, 'left', true);
    const def = WAVE_DEFS[state.wave - 1] || [];
    panel(1092, 102, 176, 96, '#fff8e7');
    if (state.phase === 'wave') {
      text('Wave ' + state.wave + ' is attacking!', 1180, 130, 13, PALETTE.text, 'center', true);
      text((state.spawnQueue.length + state.enemies.length) + ' enemies left', 1180, 152, 13, PALETTE.text, 'center');
      text(state.waveKills + ' killed this wave', 1180, 174, 12, PALETTE.muted, 'center');
    } else {
      def.forEach(([type, n], i) => {
        context.fillStyle = ENEMIES[type].color;
        context.beginPath(); context.arc(1112, 126 + i * 22, 8, 0, Math.PI * 2); context.fill();
        text('x' + n + '  ' + ENEMIES[type].name, 1128, 130 + i * 22, 13, PALETTE.text, 'left');
      });
      text('Press SPACE to start', 1180, 188, 12, PALETTE.muted, 'center');
    }
    text('WAVES', 1094, 228, 16, PALETTE.panelDark, 'left', true);
    for (let w = 0; w < WAVES; w += 1) {
      const y = 240 + w * 30;
      const done = w + 1 < state.wave || (w + 1 === state.wave && state.phase === 'wave' && false);
      const current = w + 1 === state.wave;
      const cleared = w + 1 < state.wave;
      context.fillStyle = cleared ? '#7ed957' : current ? '#ffb703' : '#fff8e7';
      context.beginPath(); context.roundRect(1092, y, 176, 24, 6); context.fill();
      context.strokeStyle = PALETTE.panelEdge; context.lineWidth = 1; context.stroke();
      text((cleared ? '✓ ' : current ? '▶ ' : '· ') + 'Wave ' + (w + 1), 1102, y + 17, 13, PALETTE.text, 'left', true);
      const count = WAVE_DEFS[w].reduce((s, [, n]) => s + n, 0);
      text(count + ' foes', 1258, y + 17, 12, PALETTE.muted, 'right');
    }
    text('🌸 ' + FLOWER_CELLS.length + ' flowers: +' + (FLOWER_CELLS.length * FLOWER_RATE) + ' honey / ' + FLOWER_EVERY + 's', 1094, 560, 12, PALETTE.muted, 'left');
    text('Combo x' + state.combo + '  •  Kills ' + state.kills, 1094, 580, 12, PALETTE.muted, 'left');
    text('Best score ' + best, 1094, 600, 12, PALETTE.muted, 'left');
  }

  function drawToolbar(state, ui) {
    const tb = LAYOUT.toolbar;
    context.fillStyle = '#3d2314';
    context.fillRect(tb.x, tb.y, tb.w, tb.h);
    context.fillStyle = PALETTE.headerEdge;
    context.fillRect(0, tb.y, tb.w, 3);
    TOWER_ORDER.forEach((type, i) => {
      const r = UI.toolbarCards[i];
      const t = TOWERS[type];
      const selected = ui.selectedType === type && !ui.selectedTower;
      const afford = state.honey >= t.cost;
      panel(r.x, r.y, r.w, r.h, selected ? '#ffe9a8' : afford ? '#fff3d6' : '#d9c49a');
      if (selected) { context.strokeStyle = '#d62828'; context.lineWidth = 3; context.beginPath(); context.roundRect(r.x, r.y, r.w, r.h, 10); context.stroke(); }
      drawBee(r.x + 34, r.y + 30, 16, t.color, 0);
      text(t.name, r.x + 62, r.y + 26, 15, PALETTE.text, 'left', true);
      text('🍯' + t.cost + '   DMG ' + t.dmg, r.x + 62, r.y + 46, 12, PALETTE.muted, 'left');
      text(t.desc + '  RNG ' + t.range + '  [' + t.key + ']', r.x + 14, r.y + 66, 11, PALETTE.muted, 'left');
    });
    // Speed toggle
    panel(UI.speedBtn.x, UI.speedBtn.y, UI.speedBtn.w, UI.speedBtn.h, '#fff3d6');
    text('SPEED', UI.speedBtn.x + 50, UI.speedBtn.y + 28, 12, PALETTE.muted, 'center', true);
    text('x' + state.speed, UI.speedBtn.x + 50, UI.speedBtn.y + 56, 20, PALETTE.text, 'center', true);
    // Start wave button
    const running = state.phase === 'wave';
    panel(UI.startBtn.x, UI.startBtn.y, UI.startBtn.w, UI.startBtn.h, running ? '#d9c49a' : '#7ed957');
    text(running ? 'WAVE ' + state.wave + ' FIGHTING…' : '▶  START WAVE ' + state.wave, UI.startBtn.x + 142, UI.startBtn.y + 32, 19, '#1d3a0f', 'center', true);
    text(running ? 'defend the hive!' : 'SPACE works too', UI.startBtn.x + 142, UI.startBtn.y + 56, 12, '#1d3a0f', 'center');
  }

  function drawOverlayPanel(title, lines, prompt, accent, buttonLabel, buttonFill) {
    context.fillStyle = 'rgba(30,18,4,0.55)';
    context.fillRect(200, 64, 880, 560);
    const w = 640;
    const h = 150 + lines.length * 30 + (buttonLabel ? 170 : 90);
    const x = (FIELD.width - w) / 2;
    const y = (FIELD.height - h) / 2;
    panel(x, y, w, h, '#fff3d6');
    context.fillStyle = accent || PALETTE.gold;
    context.fillRect(x, y, w, 8);
    text(title, FIELD.width / 2, y + 62, 40, PALETTE.text, 'center', true);
    lines.forEach((line, i) => text(line, FIELD.width / 2, y + 108 + i * 30, 18, PALETTE.muted, 'center'));
    if (buttonLabel) {
      lastButton = { x: 440, y: y + h - 118, w: 400, h: 60 };
      panel(lastButton.x, lastButton.y, lastButton.w, lastButton.h, buttonFill);
      text(buttonLabel, 640, lastButton.y + 40, 26, buttonFill === '#7ed957' ? '#1d3a0f' : PALETTE.text, 'center', true);
    } else {
      lastButton = null;
    }
    text(prompt, FIELD.width / 2, y + h - 32, 18, PALETTE.panelDark, 'center', true);
  }

  function draw(state, screen, best, time, ui) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#3d2314';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    context.textBaseline = 'alphabetic';
    drawBoard(state, time, ui);
    drawHeader(state, best, ui);
    drawLeft(state, ui);
    drawRight(state, best);
    drawToolbar(state, ui);
    if (screen === SCREEN_TITLE) {
      drawOverlayPanel('🍯 HONEYHOLD 🐝', [
        'Defend the Hive — a complete tower-defense game.',
        'Place bees on the honeycomb, upgrade them, and stop',
        'the ants, wasps, beetles and spiders marching on the hive.',
        '10 waves. Flowers drip honey. Survive them all to win.',
        'Aim: place • upgrade • defend — start, HUD, win & restart all inside.',
      ], 'Click PLAY or press SPACE to start  •  made for make.fun best-game-01', '#ffb703', '▶  PLAY', '#7ed957');
    } else if (screen === SCREEN_CLEAR) {
      const c = state.lastClear || { wave: state.wave, kills: 0, honey: 0, bonus: 0, score: state.score };
      drawOverlayPanel('WAVE ' + c.wave + ' CLEARED! 🎉', [
        'Enemies defeated: ' + c.kills,
        'Honey earned: +' + c.honey + '  (wave bonus +' + c.bonus + ')',
        'Score: ' + c.score + '   •   Hive HP: ' + state.hp + '/' + MAX_HP,
        'Next: Wave ' + Math.min(WAVES, c.wave + 1) + ' brings tougher foes — spend your honey!',
      ], 'Click NEXT WAVE or press SPACE', '#7ed957', '▶  NEXT WAVE', '#7ed957');
    } else if (screen === SCREEN_OVER) {
      drawOverlayPanel('THE HIVE HAS FALLEN 💔', [
        'The invaders broke through on Wave ' + state.wave + '.',
        'Score: ' + state.score + '   •   Best: ' + best,
        'Enemies defeated: ' + state.kills + '   •   Leaked: ' + state.leaked,
        'Tip: guard the bends of the path — one bee there hits every wave.',
      ], 'Click RESTART or press SPACE to try again', '#d62828', '↻  RESTART', '#ffb703');
    } else if (screen === SCREEN_WIN) {
      drawOverlayPanel('🏆 THE HIVE STANDS! VICTORY! 🏆', [
        'All 10 waves defeated — the hive is safe!',
        'Final score: ' + state.score + '   •   Best: ' + best,
        'Enemies defeated: ' + state.kills + '   •   Hive HP left: ' + state.hp + '/' + MAX_HP,
        'You are the keeper of the golden hive. Play again to beat your best!',
      ], 'Click PLAY AGAIN or press SPACE', '#ffb703', '↻  PLAY AGAIN', '#7ed957');
    } else if (screen === SCREEN_PAUSED) {
      drawOverlayPanel('PAUSED ⏸', [
        'The bees are holding their breath.',
        'Wave ' + state.wave + '  •  Score ' + state.score + '  •  Hive HP ' + state.hp + '/' + MAX_HP,
      ], 'Press P, ESC or SPACE to resume', '#ffb703');
    }
    if (ui.message) {
      context.globalAlpha = 0.92;
      panel(440, 76, 400, 34, '#3d2314');
      text(ui.message, 640, 99, 15, '#fff', 'center', true);
      context.globalAlpha = 1;
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
