// HONEYHOLD: Defend the Hive — every tuning number, colour and layout rect in
// one place. The playfield is a fixed 1280x720 logical area; the renderer scales
// it to the window, so no rule below depends on the screen size.
export const FIELD = { width: 1280, height: 720 };
export const STEP = 1 / 60;

/** Layout: dense like a board game — header, left panel, right panel, toolbar,
 *  and the honeycomb board filling everything between them. No empty space. */
export const LAYOUT = {
  header: { x: 0, y: 0, w: 1280, h: 64 },
  left: { x: 0, y: 64, w: 200, h: 560 },
  right: { x: 1080, y: 64, w: 200, h: 560 },
  board: { x: 200, y: 64, w: 880, h: 560 },
  toolbar: { x: 0, y: 624, w: 1280, h: 96 },
};

/** Hex grid: pointy-top hexes in odd-r offset rows. */
export const HEX = { size: 34, cols: 13, rows: 9, x0: 224, y0: 92, dx: 60, dy: 50 };

/** The enemy path, as (col,row) hex cells, winding from the left edge to the
 *  hive at the right. Hive cell is the last one. */
export const PATH_CELLS = [
  [0, 4], [1, 4], [2, 4], [3, 4],
  [3, 3], [3, 2], [3, 1],
  [4, 1], [5, 1], [6, 1], [7, 1],
  [7, 2], [7, 3], [7, 4], [7, 5], [7, 6], [7, 7],
  [8, 7], [9, 7], [10, 7],
  [10, 6], [10, 5], [10, 4],
  [11, 4], [12, 4],
];
export const HIVE_CELL = [12, 4];

/** Flower tiles (honey income) — fixed cells, never on the path. */
export const FLOWER_CELLS = [[1, 1], [5, 3], [9, 2], [1, 7], [5, 6], [9, 5], [11, 1], [2, 6]];
export const FLOWER_RATE = 1; // honey per flower every FLOWER_EVERY seconds
export const FLOWER_EVERY = 3;

export const START_HONEY = 160;
export const MAX_HP = 20;
export const WAVES = 10;
export const SELL_RATE = 0.7;
export const MAX_TOWER_LEVEL = 3;

/** Tower types: cost, damage, shots per second, range (px), splash radius (0 = single). */
export const TOWERS = {
  worker: { name: 'Worker Bee', key: '1', cost: 30, dmg: 7, rate: 2.0, range: 95, splash: 0, color: '#ffd23e', desc: 'Fast, cheap' },
  soldier: { name: 'Soldier Bee', key: '2', cost: 60, dmg: 16, rate: 1.1, range: 115, splash: 0, color: '#ff9f1c', desc: 'Balanced' },
  bomber: { name: 'Bomber Bee', key: '3', cost: 100, dmg: 12, rate: 0.7, range: 105, splash: 55, color: '#ff6b35', desc: 'Splash dmg' },
  guard: { name: "Queen's Guard", key: '4', cost: 150, dmg: 45, rate: 0.45, range: 170, splash: 0, color: '#e63946', desc: 'Long range' },
};
export const TOWER_ORDER = ['worker', 'soldier', 'bomber', 'guard'];

/** Enemy types: hp scales with wave, speed px/s, honey bounty, hive damage on leak. */
export const ENEMIES = {
  ant: { name: 'Ant', hp: 30, hpPerWave: 12, speed: 58, bounty: 5, leak: 1, radius: 11, color: '#7b4b2a', firstWave: 1 },
  wasp: { name: 'Wasp', hp: 46, hpPerWave: 17, speed: 46, bounty: 7, leak: 1, radius: 12, color: '#d62828', firstWave: 3 },
  beetle: { name: 'Beetle', hp: 95, hpPerWave: 33, speed: 30, bounty: 12, leak: 2, radius: 15, color: '#7b2cbf', firstWave: 5 },
  spider: { name: 'Spider', hp: 38, hpPerWave: 14, speed: 66, bounty: 8, leak: 1, radius: 12, color: '#3a0ca3', firstWave: 6 },
};

/** Wave compositions: [type, count] pairs. */
export const WAVE_DEFS = [
  [['ant', 8]],
  [['ant', 12]],
  [['ant', 10], ['wasp', 4]],
  [['ant', 12], ['wasp', 6]],
  [['ant', 8], ['wasp', 8], ['beetle', 3]],
  [['wasp', 10], ['beetle', 5], ['spider', 4]],
  [['ant', 12], ['wasp', 8], ['beetle', 6], ['spider', 6]],
  [['wasp', 14], ['beetle', 8], ['spider', 8]],
  [['ant', 16], ['wasp', 10], ['beetle', 8], ['spider', 10]],
  [['wasp', 20], ['beetle', 10], ['spider', 12], ['ant', 6]],
];
export const SPAWN_INTERVAL = [1.1, 1.05, 1.0, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65];

export const PALETTE = {
  grass: '#5a8f3c', grassDark: '#4a7a30', grassLight: '#6da344',
  header: '#3d2314', headerEdge: '#ffb703',
  panel: '#fff3d6', panelEdge: '#d9a441', panelDark: '#7a4a12',
  boardEdge: '#8a5a1e',
  hexBuild: '#ffe9a8', hexBuildEdge: '#e0a458',
  hexPath: '#e8b04b', hexPathEdge: '#b97f2a',
  hexFlower: '#ffd6e8', hexFlowerEdge: '#e88bb0',
  hexHive: '#ffb703',
  text: '#3d2314', muted: '#8a6d3b', light: '#fff8e7',
  gold: '#ffb703', honey: '#f48c06', danger: '#d62828',
  hp: '#e63946', score: '#ffd23e',
};
export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const BEST_KEY = 'honeyhold.best';
