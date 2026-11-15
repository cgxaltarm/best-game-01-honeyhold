// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. Screens: title, play, wave-clear, game over, victory,
// paused.
//
// ?seed=N fixes the game. ?shot=start|play|win|over (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, FIELD, STEP, TOWERS, TOWER_ORDER } from './config.js';
import { createRandom } from './random.js';
import {
  EVENT_COIN, EVENT_KILL, EVENT_LEAK, EVENT_OVER, EVENT_SHOOT,
  EVENT_WAVE_CLEAR, EVENT_WIN, PHASE_BUILD, createWorld, hexAt,
} from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import {
  SCREEN_CLEAR, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE,
  SCREEN_WIN, UI, createRenderer, overlayButton,
} from './render.js';
import { createSound } from './sound.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas, seed);
const sound = createSound();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}
function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}
function toField(clientX, clientY, rectWidth, rectHeight) {
  const scale = Math.min(rectWidth / FIELD.width, rectHeight / FIELD.height);
  const offsetX = (rectWidth - FIELD.width * scale) / 2;
  const offsetY = (rectHeight - FIELD.height * scale) / 2;
  return { x: (clientX - offsetX) / scale, y: (clientY - offsetY) / scale };
}
function inRect(p, r) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, 3.2, {
      selectedType: world.state.selectedType,
      selectedTower: world.state.selectedTower,
      hoverHex: null,
      towerStats: world.towerStats,
      upgradeCost: world.upgradeCost,
      sellValue: world.sellValue,
      muted: false,
      message: null,
      screen: scene.screen,
    });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas, toField);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let savedScreen = SCREEN_TITLE;
  let message = null;
  let messageTimer = 0;

  window.__honey = {
    world,
    input,
    get screen() { return screen; },
    get best() { return best; },
  };

  function announce(text) { status.textContent = text; }
  function flash(text) { message = text; messageTimer = 2; }

  function startGame() {
    world.reset();
    screen = SCREEN_PLAY;
    sound.click();
    announce('Wave 1. Place bees, then press Space to start the wave.');
  }
  function endGame() {
    screen = SCREEN_OVER;
    if (world.state.score > best) { best = world.state.score; saveBest(best); }
    announce(`The hive has fallen. Score ${world.state.score}. Best ${best}.`);
  }
  function endWin() {
    screen = SCREEN_WIN;
    if (world.state.score > best) { best = world.state.score; saveBest(best); }
    announce(`Victory! All 10 waves defeated. Final score ${world.state.score}. Best ${best}.`);
  }
  function nextWave() {
    screen = SCREEN_PLAY;
    announce(`Wave ${world.state.wave}. Place bees, then press Space.`);
  }

  function handleClick(p) {
    sound.unlock();
    const btn = overlayButton();
    if (screen === SCREEN_TITLE) {
      if (btn && inRect(p, btn)) startGame();
      return;
    }
    if (screen === SCREEN_CLEAR) {
      if (btn && inRect(p, btn)) { sound.click(); nextWave(); }
      return;
    }
    if (screen === SCREEN_OVER || screen === SCREEN_WIN) {
      if (btn && inRect(p, btn)) startGame();
      return;
    }
    if (screen === SCREEN_PAUSED) {
      screen = savedScreen;
      announce('Playing.');
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    // Toolbar cards pick a tower type.
    for (let i = 0; i < TOWER_ORDER.length; i += 1) {
      if (inRect(p, UI.toolbarCards[i])) {
        world.state.selectedType = TOWER_ORDER[i];
        world.state.selectedTower = null;
        sound.click();
        return;
      }
    }
    if (inRect(p, UI.speedBtn)) {
      world.state.speed = world.state.speed === 1 ? 2 : 1;
      sound.click();
      return;
    }
    if (inRect(p, UI.startBtn)) {
      if (world.state.phase === PHASE_BUILD) {
        if (world.startWave()) { sound.click(); announce(`Wave ${world.state.wave} attacking!`); }
      }
      return;
    }
    // Left-panel upgrade / sell.
    const sel = world.state.selectedTower;
    if (sel && inRect(p, UI.upgradeBtn)) {
      const r = world.upgradeTower(sel);
      if (r.ok) { sound.upgrade(); announce(`${TOWERS[sel.type].name} upgraded to level ${sel.level}.`); }
      else flash(r.reason || 'Cannot upgrade.');
      return;
    }
    if (sel && inRect(p, UI.sellBtn)) {
      const r = world.sellTower(sel);
      if (r.ok) { sound.click(); flash('Sold for +' + r.value + ' honey.'); }
      return;
    }
    // Board: select a tower, or place the selected type.
    const hex = hexAt(p.x, p.y);
    if (!hex) return;
    const existing = world.towerAt(hex.col, hex.row);
    if (existing) {
      world.state.selectedTower = existing;
      sound.click();
      return;
    }
    const r = world.placeTower(hex.col, hex.row, world.state.selectedType);
    if (r.ok) {
      sound.place();
      announce(`${TOWERS[world.state.selectedType].name} placed.`);
    } else {
      flash(r.reason);
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = sound.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    const hotkey = input.takeHotkey();
    if (hotkey && screen === SCREEN_PLAY) {
      world.state.selectedType = hotkey;
      world.state.selectedTower = null;
      sound.click();
    }
    if (actions & ACTION_CONFIRM) {
      sound.unlock();
      if (screen === SCREEN_TITLE) startGame();
      else if (screen === SCREEN_PLAY) {
        if (world.state.phase === PHASE_BUILD && world.startWave()) {
          sound.click();
          announce(`Wave ${world.state.wave} attacking!`);
        }
      } else if (screen === SCREEN_CLEAR) nextWave();
      else if (screen === SCREEN_OVER || screen === SCREEN_WIN) startGame();
      else if (screen === SCREEN_PAUSED) { screen = savedScreen; announce('Playing.'); }
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY || screen === SCREEN_CLEAR) {
        savedScreen = screen;
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = savedScreen;
        announce('Playing.');
      }
    }
    for (const p of input.takeClicks()) handleClick(p);
  }

  function handleWorldEvents(events) {
    if (events & EVENT_SHOOT) sound.shoot(performance.now());
    if (events & EVENT_KILL) sound.kill();
    if (events & EVENT_COIN) sound.coin();
    if (events & EVENT_LEAK) sound.leak();
    if (events & EVENT_WIN) { sound.win(); endWin(); }
    else if (events & EVENT_WAVE_CLEAR) { sound.waveClear(); screen = SCREEN_CLEAR; announce(`Wave cleared! Score ${world.state.score}.`); }
    else if (events & EVENT_OVER) { sound.lose(); endGame(); }
  }

  function step(dt) {
    if (screen === SCREEN_TITLE) return;
    if (screen !== SCREEN_PLAY) return;
    handleWorldEvents(world.step(dt));
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME) * world.state.speed;
    last = now;
    handleActions();
    if (messageTimer > 0) {
      messageTimer -= 1 / 60;
      if (messageTimer <= 0) message = null;
    }
    while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
      step(STEP);
      accumulator -= STEP;
    }
    if (screen !== SCREEN_TITLE && screen !== SCREEN_PLAY) accumulator = 0;
    const hover = input.hover();
    renderer.draw(world.state, screen, best, now / 1000, {
      selectedType: world.state.selectedType,
      selectedTower: world.state.selectedTower,
      hoverHex: hover ? hexAt(hover.x, hover.y) : null,
      towerStats: world.towerStats,
      upgradeCost: world.upgradeCost,
      sellValue: world.sellValue,
      muted: sound.isMuted(),
      message,
      screen,
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (screen === SCREEN_PLAY || screen === SCREEN_CLEAR)) {
      savedScreen = screen;
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('HONEYHOLD: Defend the Hive. Press Space or click PLAY to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
