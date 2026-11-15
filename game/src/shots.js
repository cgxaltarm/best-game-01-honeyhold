// The screenshot scenes behind ?shot=start|play|win|over. Each one plays the
// real rules forward from a fresh world, so the frame is what a real game
// looks like and the same seed always gives the same frame. The win scene is
// the auto-player's genuine 10-wave victory; the play scene is a real wave 3
// mid-fight; the over scene is a real hive breach.
import { STEP } from './config.js';
import {
  EVENT_OVER, EVENT_WIN, EVENT_WAVE_CLEAR, PHASE_BUILD,
} from './world.js';
import {
  SCREEN_CLEAR, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN,
} from './render.js';

/** Position along the waypoint polyline at a given travelled distance. */
function posAt(waypoints, dist) {
  let remaining = dist;
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
function pathLength(waypoints) {
  let total = 0;
  for (let i = 0; i < waypoints.length - 1; i += 1) total += Math.hypot(waypoints[i + 1].x - waypoints[i].x, waypoints[i + 1].y - waypoints[i].y);
  return total;
}
function stageEnemy(world, type, dist, hp) {
  const p = posAt(world.waypoints, dist);
  world.state.enemies.push({
    type, x: p.x, y: p.y, hp, maxHp: hp, speed: 40, bounty: 5, leak: 1,
    radius: 12, wp: 0, dist, slow: 0, wobble: 0.5,
  });
}

export function stageShot(name, world) {
  const state = world.state;
  if (name === 'play') {
    // Auto-play waves 1-2, then fight wave 3 for real for 8 seconds.
    let steps = 0;
    while (state.wave < 3 && steps < 200000) { world.autoStep(STEP); steps += 1; }
    if (state.phase === PHASE_BUILD) world.startWave();
    for (let i = 0; i < 8 / STEP; i += 1) world.autoStep(STEP);
    return { screen: SCREEN_PLAY, best: state.score };
  }
  if (name === 'win') {
    const result = world.autoPlayToEnd();
    if (result.result !== 'win') return { screen: SCREEN_PLAY, best: state.score };
    return { screen: SCREEN_WIN, best: state.score };
  }
  if (name === 'over') {
    world.reset();
    world.placeTower(2, 3, 'soldier');
    world.placeTower(6, 2, 'worker');
    world.placeTower(8, 6, 'bomber');
    world.placeTower(9, 4, 'worker');
    state.honey = 45;
    state.score = 1830;
    state.kills = 47;
    state.wave = 6;
    state.hp = 1;
    state.phase = 'wave';
    const len = pathLength(world.waypoints);
    stageEnemy(world, 'beetle', len - 40, 120);
    stageEnemy(world, 'wasp', len - 120, 60);
    stageEnemy(world, 'spider', len - 200, 50);
    stageEnemy(world, 'ant', len - 280, 40);
    let events = EVENT_OVER;
    for (let i = 0; i < 6 / STEP; i += 1) {
      events = world.step(STEP);
      if (events & EVENT_OVER) break;
    }
    return { screen: (events & EVENT_OVER) || state.hp <= 0 ? SCREEN_OVER : SCREEN_PLAY, best: state.score };
  }
  // start (default): a lively title backdrop — towers placed, enemies on the path.
  world.reset();
  world.placeTower(2, 3, 'soldier');
  world.placeTower(4, 2, 'worker');
  world.placeTower(6, 2, 'guard');
  world.placeTower(8, 6, 'bomber');
  world.placeTower(9, 4, 'worker');
  world.placeTower(5, 5, 'soldier');
  state.honey = 240;
  state.score = 1250;
  state.wave = 2;
  const len = pathLength(world.waypoints);
  stageEnemy(world, 'ant', len * 0.25, 40);
  stageEnemy(world, 'ant', len * 0.35, 40);
  stageEnemy(world, 'wasp', len * 0.5, 60);
  stageEnemy(world, 'ant', len * 0.65, 40);
  stageEnemy(world, 'beetle', len * 0.8, 120);
  state.selectedTower = null;
  return { screen: SCREEN_TITLE, best: 1250 };
}
