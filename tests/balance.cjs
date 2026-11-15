// Balance proof, run in the real browser: the auto-player plays the real rules
// and must WIN all 10 waves, on several seeds. Exits non-zero on failure.
const { chromium } = require('/home/hatch/workspace/makefun/best-game-01/tests/node_modules/playwright-core');
(async () => {
  const browser = await chromium.launch({
    executablePath: '/home/hatch/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
    args: ['--no-sandbox', '--disable-gpu-sandbox', '--use-gl=swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  let failures = 0;
  for (const seed of [1, 7, 42, 99, 1234]) {
    await page.goto('http://localhost:8082/index.html?seed=' + seed, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__honey !== undefined, null, { timeout: 10000 });
    const r = await page.evaluate(() => window.__honey.world.autoPlayToEnd());
    const ok = r.result === 'win' && r.wave === 10 && r.kills === 244;
    console.log((ok ? 'PASS' : 'FAIL') + ' balance seed=' + seed + ' ' + JSON.stringify(r));
    if (!ok) failures += 1;
  }
  console.log('console errors:', errors.length ? errors.join(' | ') : 'none');
  if (errors.length) failures += 1;
  await browser.close();
  console.log(failures === 0 ? 'BALANCE PROOF PASSED (5/5 seeds win all 10 waves)' : failures + ' BALANCE CHECK(S) FAILED');
  process.exit(failures === 0 ? 0 : 1);
})();
