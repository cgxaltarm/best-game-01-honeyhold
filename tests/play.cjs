// Full gameplay test in headless Chromium: title -> PLAY -> place tower ->
// start wave -> wave clears -> upgrade -> pause/resume -> forced leak ->
// game over -> restart. Exits non-zero on failure.
const { chromium } = require('/home/hatch/workspace/makefun/best-game-01/tests/node_modules/playwright-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(label, cond, extra) {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + label + (extra !== undefined ? ' | ' + extra : ''));
  if (!cond) failures += 1;
}
(async () => {
  const browser = await chromium.launch({
    executablePath: '/home/hatch/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
    args: ['--no-sandbox', '--disable-gpu-sandbox', '--use-gl=swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  await page.goto('http://localhost:8082/index.html?seed=7', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__honey !== undefined, null, { timeout: 10000 });
  const state = () => page.evaluate(() => {
    const s = window.__honey.world.state;
    return {
      screen: window.__honey.screen, wave: s.wave, phase: s.phase,
      honey: Math.floor(s.honey), hp: s.hp, score: s.score, kills: s.kills,
      towers: s.towers.length, enemies: s.enemies.length,
      selTower: s.selectedTower ? { type: s.selectedTower.type, level: s.selectedTower.level } : null,
      selType: s.selectedType, speed: s.speed,
    };
  });

  let s = await state();
  check('title screen at boot', s.screen === 'title', JSON.stringify(s));

  // Click PLAY (centre of the play button).
  await page.mouse.click(640, 507); // PLAY button centre
  await sleep(300);
  s = await state();
  check('PLAY starts game -> play, wave 1 build', s.screen === 'play' && s.wave === 1 && s.phase === 'build', JSON.stringify(s));

  // Hotkey 2 selects Soldier, toolbar card 1 selects Worker.
  await page.keyboard.press('Digit2');
  await sleep(150);
  s = await state();
  check('hotkey 2 selects soldier', s.selType === 'soldier', s.selType);
  await page.mouse.click(116, 672); // worker card
  await sleep(150);
  s = await state();
  check('toolbar card selects worker', s.selType === 'worker', s.selType);

  // Place worker on hex (2,3): centre (374,242). Honey 160 -> 130.
  await page.mouse.click(374, 242);
  await sleep(200);
  s = await state();
  check('click hex places tower', s.towers === 1 && s.honey === 130, JSON.stringify(s));

  // Clicking a path hex must NOT place.
  await page.mouse.click(224, 292); // hex (0,4) is path
  await sleep(150);
  s = await state();
  check('path hex refuses placement', s.towers === 1, JSON.stringify(s));

  // Place a soldier on (4,2): centre (464,192). Then 2x speed and start wave.
  await page.keyboard.press('Digit2');
  await page.mouse.click(464, 192);
  await sleep(150);
  s = await state();
  check('second tower placed', s.towers === 2, JSON.stringify(s));
  await page.mouse.click(918, 672); // speed toggle
  await sleep(150);
  s = await state();
  check('speed toggle -> 2x', s.speed === 2, 'speed=' + s.speed);

  await page.keyboard.press('Space');
  await sleep(300);
  s = await state();
  check('Space starts wave 1', s.phase === 'wave', JSON.stringify(s));

  // Wait for the wave to clear (screen 'clear'), up to 90s at 2x speed.
  let waited = 0;
  while (s.screen === 'play' && waited < 90000) { await sleep(1000); waited += 1000; s = await state(); }
  check('wave 1 clears -> clear screen', s.screen === 'clear', `${JSON.stringify(s)} after ${waited}ms`);
  check('wave 1 killed enemies', s.kills > 0, 'kills=' + s.kills);

  // Space -> build phase wave 2.
  await page.keyboard.press('Space');
  await sleep(300);
  s = await state();
  check('Space on clear -> build wave 2', s.screen === 'play' && s.wave === 2 && s.phase === 'build', JSON.stringify(s));

  // Select the worker tower and upgrade it (cost 27, honey is plentiful).
  await page.mouse.click(374, 242);
  await sleep(150);
  s = await state();
  check('click tower selects it', s.selTower && s.selTower.type === 'worker', JSON.stringify(s.selTower));
  const honeyBefore = s.honey;
  await page.mouse.click(100, 448); // upgrade button
  await sleep(200);
  s = await state();
  check('upgrade raises level and spends honey', s.selTower && s.selTower.level === 2 && s.honey < honeyBefore, JSON.stringify(s));

  // Pause / resume with P.
  await page.keyboard.press('KeyP');
  await sleep(200);
  s = await state();
  check('P pauses', s.screen === 'paused', s.screen);
  await page.keyboard.press('KeyP');
  await sleep(200);
  s = await state();
  check('P resumes', s.screen === 'play', s.screen);

  // Sell the soldier: select it, click sell, honey rises.
  await page.mouse.click(464, 192);
  await sleep(150);
  const honeyPreSell = (await state()).honey;
  await page.mouse.click(100, 496); // sell button
  await sleep(200);
  s = await state();
  check('sell removes tower and refunds honey', s.towers === 1 && s.honey > honeyPreSell, JSON.stringify(s));

  // Force game over: 1 HP, no towers, start the wave, wait for leaks.
  await page.evaluate(() => {
    const w = window.__honey.world;
    w.state.hp = 1;
    w.state.towers = [];
    w.state.selectedTower = null;
  });
  await page.keyboard.press('Space');
  await sleep(300);
  s = await state();
  check('wave starts with 1 HP', s.phase === 'wave', JSON.stringify(s));
  waited = 0;
  while (s.screen === 'play' && waited < 90000) { await sleep(1000); waited += 1000; s = await state(); }
  check('leaks with 1 HP -> game over', s.screen === 'over', `${JSON.stringify(s)} after ${waited}ms`);

  await page.keyboard.press('Space');
  await sleep(300);
  s = await state();
  check('Space on game over restarts -> wave 1, full HP', s.screen === 'play' && s.wave === 1 && s.hp === 20, JSON.stringify(s));

  // Mute toggle must not error.
  await page.keyboard.press('KeyM');
  await sleep(150);
  await page.keyboard.press('KeyM');
  await sleep(150);

  console.log('console errors:', errors.length ? errors.join(' | ') : 'none');
  check('no console/page errors', errors.length === 0);
  await browser.close();
  console.log(failures === 0 ? 'ALL GAMEPLAY TESTS PASSED' : `${failures} TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})();
