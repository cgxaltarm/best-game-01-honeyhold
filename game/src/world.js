// HONEYHOLD rules and state, with no drawing and no browser in it: the hex
// board, the winding path, towers, enemies, projectiles, honey economy, waves,
// score, combo and hive HP. step() advances one fixed step and returns what
// happened as bit flags, so the caller can react (and play sounds) without the
// world knowing about screens or sound.
//
// The auto-player (autoStep / autoPlayToEnd) plays the real rules with a
// greedy strategy — best-coverage hexes first, upgrades when rich — and is
// what proves the game is winnable: it must clear all 10 waves.
import {
  ENEMIES, FLOWER_CELLS, FLOWER_EVERY, FLOWER_RATE, HEX, HIVE_CELL,
  MAX_HP, MAX_TOWER_LEVEL, PATH_CELLS, SELL_RATE, SPAWN_INTERVAL,
  START_HONEY, STEP, TOWERS, TOWER_ORDER, WAVE_DEFS, WAVES,
} from './config.js';

export const EVENT_NONE = 0;
export const EVENT_SHOOT = 1;
export const EVENT_KILL = 2;
export const EVENT_LEAK = 4;
export const EVENT_WAVE_CLEAR = 8;
export const EVENT_OVER = 16;
export const EVENT_WIN = 32;
export const EVENT_COIN = 64;
export const EVENT_PLACE = 128;

export const PHASE_BUILD = 'build';
export const PHASE_WAVE = 'wave';

export function hexCenter(col, row) {
  return {
    x: HEX.x0 + col * HEX.dx + (row % 2) * (HEX.dx / 2),
    y: HEX.y0 + row * HEX.dy,
  };
}

export function hexAt(x, y) {
  let best = null;
  let bestDist = Infinity;
  for (let row = 0; row < HEX.rows; row += 1) {
    for (let col = 0; col < HEX.cols; col += 1) {
      const c = hexCenter(col, row);
      const d = Math.hypot(x - c.x, y - c.y);
      if (d < bestDist) { bestDist = d; best = { col, row }; }
    }
  }
  return bestDist <= HEX.size ? best : null;
}

function keyOf(col, row) { return col + ',' + row; }

export function createWorld(random) {
  const pathSet = new Set(PATH_CELLS.map(([c, r]) => keyOf(c, r)));
  const flowerSet = new Set(FLOWER_CELLS.map(([c, r]) => keyOf(c, r)));
  // Waypoints along the path in pixels (hex centres, hive centre last).
  const waypoints = PATH_CELLS.map(([c, r]) => hexCenter(c, r));
  // Path-neighbour count per buildable hex: how many path cells touch it.
  const coverage = new Map();
  const neighbours = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
  for (let row = 0; row < HEX.rows; row += 1) {
    for (let col = 0; col < HEX.cols; col += 1) {
      const k = keyOf(col, row);
      if (pathSet.has(k) || flowerSet.has(k)) continue;
      let n = 0;
      for (const [dc, dr] of neighbours) if (pathSet.has(keyOf(col + dc, row + dr))) n += 1;
      coverage.set(k, n);
    }
  }

  const state = {
    wave: 1, phase: PHASE_BUILD, honey: START_HONEY, hp: MAX_HP, maxHp: MAX_HP,
    score: 0, combo: 0, comboTimer: 0, kills: 0, leaked: 0,
    towers: [], enemies: [], projectiles: [], floaters: [], particles: [],
    spawnQueue: [], spawnTimer: 0, flowerTimer: 0, buildTimer: 0,
    elapsed: 0, speed: 1, waveKills: 0, waveHoney: 0, lastClear: null,
    flowerCells: FLOWER_CELLS.map(([c, r]) => ({ col: c, row: r })),
    pathCells: PATH_CELLS.map(([c, r]) => ({ col: c, row: r })),
    hive: hexCenter(HIVE_CELL[0], HIVE_CELL[1]),
    selectedType: 'worker', selectedTower: null,
  };

  function towerAt(col, row) {
    return state.towers.find((t) => t.col === col && t.row === row) || null;
  }
  function isBuildable(col, row) {
    const k = keyOf(col, row);
    return col >= 0 && col < HEX.cols && row >= 0 && row < HEX.rows
      && !pathSet.has(k) && !flowerSet.has(k) && !towerAt(col, row);
  }
  function towerStats(type, level) {
    const base = TOWERS[type];
    const mult = 1.7 ** (level - 1);
    return { dmg: Math.round(base.dmg * mult), rate: base.rate, range: base.range + 14 * (level - 1), splash: base.splash };
  }
  function upgradeCost(tower) {
    return Math.round(TOWERS[tower.type].cost * 0.9 * tower.level);
  }
  function sellValue(tower) {
    let spent = TOWERS[tower.type].cost;
    for (let l = 1; l < tower.level; l += 1) spent += Math.round(TOWERS[tower.type].cost * 0.9 * l);
    return Math.round(spent * SELL_RATE);
  }

  function placeTower(col, row, type) {
    if (!isBuildable(col, row)) return { ok: false, reason: 'That hex cannot hold a tower.' };
    if (state.honey < TOWERS[type].cost) return { ok: false, reason: 'Not enough honey.' };
    const c = hexCenter(col, row);
    state.honey -= TOWERS[type].cost;
    const tower = { type, col, row, x: c.x, y: c.y, level: 1, cooldown: 0, kills: 0, flash: 0 };
    state.towers.push(tower);
    state.selectedTower = tower;
    return { ok: true, tower };
  }
  function upgradeTower(tower) {
    if (!tower || tower.level >= MAX_TOWER_LEVEL) return { ok: false, reason: 'Already max level.' };
    const cost = upgradeCost(tower);
    if (state.honey < cost) return { ok: false, reason: 'Not enough honey to upgrade.' };
    state.honey -= cost;
    tower.level += 1;
    return { ok: true };
  }
  function sellTower(tower) {
    if (!tower) return { ok: false };
    const value = sellValue(tower);
    state.honey += value;
    state.towers = state.towers.filter((t) => t !== tower);
    if (state.selectedTower === tower) state.selectedTower = null;
    return { ok: true, value };
  }

  function startWave() {
    if (state.phase !== PHASE_BUILD) return false;
    const def = WAVE_DEFS[state.wave - 1];
    state.spawnQueue = [];
    for (const [type, count] of def) for (let i = 0; i < count; i += 1) state.spawnQueue.push(type);
    // Interleave types so the wave is a mixed stream, not blocks of one kind.
    for (let i = state.spawnQueue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [state.spawnQueue[i], state.spawnQueue[j]] = [state.spawnQueue[j], state.spawnQueue[i]];
    }
    state.spawnTimer = 0.5;
    state.phase = PHASE_WAVE;
    state.buildTimer = 0;
    state.waveKills = 0;
    state.waveHoney = 0;
    return true;
  }

  function spawnEnemy(type) {
    const def = ENEMIES[type];
    const hp = def.hp + def.hpPerWave * state.wave;
    const start = waypoints[0];
    state.enemies.push({
      type, x: start.x - 20 - random() * 10, y: start.y, hp, maxHp: hp,
      speed: def.speed * (1 + 0.02 * (state.wave - 1)), bounty: def.bounty,
      leak: def.leak, radius: def.radius, wp: 0, dist: 0, slow: 0, wobble: random() * Math.PI * 2,
    });
  }

  function enemyPos(e) {
    // Position along the waypoint polyline by distance travelled.
    let remaining = e.dist;
    for (let i = 0; i < waypoints.length - 1; i += 1) {
      const a = waypoints[i];
      const b = waypoints[i + 1];
      const seg = Math.hypot(b.x - a.x, b.y - a.y);
      if (remaining <= seg) {
        const t = seg === 0 ? 0 : remaining / seg;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
      remaining -= seg;
    }
    return { x: waypoints[waypoints.length - 1].x, y: waypoints[waypoints.length - 1].y };
  }
  function pathLength() {
    let total = 0;
    for (let i = 0; i < waypoints.length - 1; i += 1) total += Math.hypot(waypoints[i + 1].x - waypoints[i].x, waypoints[i + 1].y - waypoints[i].y);
    return total;
  }
  const PATH_LEN = pathLength();

  function addFloater(x, y, text, color) {
    state.floaters.push({ x, y, text, color, life: 1 });
  }
  function burst(x, y, color, n) {
    for (let i = 0; i < n; i += 1) {
      const a = random() * Math.PI * 2;
      const s = 30 + random() * 70;
      state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + random() * 0.3, color });
    }
  }

  function damageEnemy(enemy, dmg) {
    enemy.hp -= dmg;
    if (enemy.hp > 0) return false;
    // Kill: bounty, score, combo.
    state.kills += 1;
    state.waveKills += 1;
    state.honey += enemy.bounty;
    state.waveHoney += enemy.bounty;
    if (state.comboTimer > 0) state.combo += 1; else state.combo = 1;
    state.comboTimer = 1.5;
    const points = enemy.bounty * 10 + state.combo * 5;
    state.score += points;
    addFloater(enemy.x, enemy.y - 14, '+' + enemy.bounty + ' honey  +' + points, '#7a4a12');
    burst(enemy.x, enemy.y, ENEMIES[enemy.type].color, 8);
    return true;
  }

  function reset() {
    state.wave = 1; state.phase = PHASE_BUILD; state.honey = START_HONEY;
    state.hp = MAX_HP; state.score = 0; state.combo = 0; state.comboTimer = 0;
    state.kills = 0; state.leaked = 0; state.towers = []; state.enemies = [];
    state.projectiles = []; state.floaters = []; state.particles = [];
    state.spawnQueue = []; state.spawnTimer = 0; state.flowerTimer = 0;
    state.buildTimer = 0; state.elapsed = 0; state.speed = 1;
    state.waveKills = 0; state.waveHoney = 0; state.lastClear = null;
    state.selectedType = 'worker'; state.selectedTower = null;
  }

  function step(dt) {
    let events = EVENT_NONE;
    state.elapsed += dt;
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) state.combo = 0;
    }
    // Flowers drip honey.
    state.flowerTimer += dt;
    if (state.flowerTimer >= FLOWER_EVERY) {
      state.flowerTimer -= FLOWER_EVERY;
      state.honey += FLOWER_CELLS.length * FLOWER_RATE;
      events |= EVENT_COIN;
    }
    // Floaters and particles fade.
    for (let i = state.floaters.length - 1; i >= 0; i -= 1) {
      const f = state.floaters[i];
      f.life -= dt * 0.8; f.y -= 22 * dt;
      if (f.life <= 0) state.floaters.splice(i, 1);
    }
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const p = state.particles[i];
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.life <= 0) state.particles.splice(i, 1);
    }
    for (const t of state.towers) if (t.flash > 0) t.flash -= dt;

    if (state.phase === PHASE_BUILD) {
      state.buildTimer += dt;
      return events;
    }
    // --- wave running ---
    if (state.spawnQueue.length > 0) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        spawnEnemy(state.spawnQueue.shift());
        state.spawnTimer += SPAWN_INTERVAL[state.wave - 1];
      }
    }
    // Enemies advance along the path.
    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      const e = state.enemies[i];
      e.dist += e.speed * dt;
      const p = enemyPos(e);
      e.x = p.x; e.y = p.y;
      if (e.dist >= PATH_LEN) {
        state.enemies.splice(i, 1);
        state.hp -= e.leak;
        state.leaked += 1;
        state.combo = 0; state.comboTimer = 0;
        addFloater(state.hive.x, state.hive.y - 30, '-' + e.leak + ' hive HP!', '#d62828');
        burst(state.hive.x, state.hive.y, '#d62828', 10);
        events |= EVENT_LEAK;
        if (state.hp <= 0) {
          state.hp = 0;
          events |= EVENT_OVER;
          return events;
        }
      }
    }
    // Towers fire at the enemy furthest along the path within range.
    for (const t of state.towers) {
      t.cooldown -= dt;
      if (t.cooldown > 0) continue;
      const stats = towerStats(t.type, t.level);
      let target = null;
      for (const e of state.enemies) {
        if (Math.hypot(e.x - t.x, e.y - t.y) <= stats.range && (!target || e.dist > target.dist)) target = e;
      }
      if (!target) continue;
      t.cooldown = 1 / stats.rate;
      t.flash = 0.12;
      state.projectiles.push({ x: t.x, y: t.y - 6, target, tower: t, dmg: stats.dmg, splash: stats.splash, speed: 430, color: TOWERS[t.type].color });
      events |= EVENT_SHOOT;
    }
    // Projectiles home to their target.
    for (let i = state.projectiles.length - 1; i >= 0; i -= 1) {
      const p = state.projectiles[i];
      if (!state.enemies.includes(p.target)) { state.projectiles.splice(i, 1); continue; }
      const dx = p.target.x - p.x;
      const dy = p.target.y - p.y;
      const d = Math.hypot(dx, dy);
      const move = p.speed * dt;
      if (d <= move + 6) {
        state.projectiles.splice(i, 1);
        if (p.splash > 0) {
          const hit = state.enemies.filter((e) => Math.hypot(e.x - p.target.x, e.y - p.target.y) <= p.splash);
          burst(p.target.x, p.target.y, '#ff6b35', 6);
          for (const e of [...hit]) if (damageEnemy(e, p.dmg)) { p.tower.kills += 1; state.enemies.splice(state.enemies.indexOf(e), 1); events |= EVENT_KILL; }
        } else if (damageEnemy(p.target, p.dmg)) {
          p.tower.kills += 1;
          state.enemies.splice(state.enemies.indexOf(p.target), 1);
          events |= EVENT_KILL;
        }
      } else {
        p.x += (dx / d) * move;
        p.y += (dy / d) * move;
      }
    }
    // Wave cleared?
    if (state.spawnQueue.length === 0 && state.enemies.length === 0) {
      const bonus = 30 + 10 * state.wave;
      state.honey += bonus;
      state.score += bonus * 2;
      state.lastClear = { wave: state.wave, kills: state.waveKills, honey: state.waveHoney + bonus, bonus, score: state.score };
      if (state.wave >= WAVES) {
        events |= EVENT_WAVE_CLEAR | EVENT_WIN;
        return events;
      }
      state.wave += 1;
      state.phase = PHASE_BUILD;
      state.buildTimer = 0;
      events |= EVENT_WAVE_CLEAR;
    }
    return events;
  }

  // ---- Auto-player: greedy but honest — it only uses place/upgrade/startWave. ----
  function bestHex() {
    let best = null;
    let bestScore = -1;
    for (const [k, cov] of coverage.entries()) {
      const [col, row] = k.split(',').map(Number);
      if (!isBuildable(col, row)) continue;
      // Coverage first, then closeness to the path centre (shorter travel to range).
      const c = hexCenter(col, row);
      let near = 0;
      for (const wp of waypoints) if (Math.hypot(wp.x - c.x, wp.y - c.y) < 120) near += 1;
      const score = cov * 10 + near;
      if (score > bestScore) { bestScore = score; best = { col, row }; }
    }
    return best;
  }
  function bestAffordableType() {
    // Best damage-per-honey among affordable types, preferring range for coverage.
    let best = null;
    let bestScore = -1;
    for (const type of TOWER_ORDER) {
      const t = TOWERS[type];
      if (state.honey < t.cost) continue;
      const dps = t.dmg * t.rate * (t.splash > 0 ? 1.6 : 1);
      const score = (dps / t.cost) * (1 + t.range / 500);
      if (score > bestScore) { bestScore = score; best = type; }
    }
    return best;
  }
  function autoStep(dt) {
    if (state.phase === PHASE_BUILD) {
      // Spend down, then start the wave after a short build pause.
      let acted = true;
      let guard = 0;
      while (acted && guard < 20) {
        acted = false; guard += 1;
        const hex = bestHex();
        const type = bestAffordableType();
        if (hex && type && state.towers.length < 16) {
          // Early game: workers are the efficient buy; later prefer soldier/guard.
          const want = state.wave <= 2 ? 'worker' : type;
          const buyType = state.honey >= TOWERS[want].cost ? want : type;
          if (placeTower(hex.col, hex.row, buyType).ok) { acted = true; continue; }
        }
        // Upgrade the tower with the most kills if it is cheap enough.
        const up = [...state.towers].filter((t) => t.level < MAX_TOWER_LEVEL)
          .sort((a, b) => b.kills - a.kills || upgradeCost(a) - upgradeCost(b))[0];
        if (up && state.honey >= upgradeCost(up) && state.towers.length >= 6) {
          if (upgradeTower(up).ok) acted = true;
        }
      }
      if (state.buildTimer > 4 || state.honey < TOWERS.worker.cost) startWave();
      return step(dt);
    }
    // During a wave: upgrade whenever rich, buy a filler worker when very rich.
    if (state.honey >= 200) {
      const up = [...state.towers].filter((t) => t.level < MAX_TOWER_LEVEL)
        .sort((a, b) => b.kills - a.kills)[0];
      if (up && state.honey >= upgradeCost(up)) upgradeTower(up);
    }
    return step(dt);
  }
  function autoPlayToEnd(maxSteps) {
    const limit = maxSteps || 400000;
    let steps = 0;
    let events = EVENT_NONE;
    while (steps < limit) {
      events = autoStep(STEP);
      steps += 1;
      if (events & EVENT_OVER) return { result: 'over', wave: state.wave, score: state.score, hp: state.hp, kills: state.kills, steps };
      if (events & EVENT_WIN) return { result: 'win', wave: state.wave, score: state.score, hp: state.hp, kills: state.kills, steps };
    }
    return { result: 'timeout', wave: state.wave, score: state.score, hp: state.hp, kills: state.kills, steps };
  }

  reset();
  return {
    state, reset, step, startWave, placeTower, upgradeTower, sellTower,
    towerAt, isBuildable, towerStats, upgradeCost, sellValue, hexCenter,
    autoStep, autoPlayToEnd, bestHex, pathSet, flowerSet, waypoints, coverage,
  };
}
