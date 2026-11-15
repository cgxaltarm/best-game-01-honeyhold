// Takes the 4 staged screenshots (?shot=) into honeyhold/screenshots/ as JPEGs.
const { chromium } = require('/home/hatch/workspace/makefun/best-game-01/tests/node_modules/playwright-core');
(async () => {
  const browser = await chromium.launch({
    executablePath: '/home/hatch/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
    args: ['--no-sandbox', '--disable-gpu-sandbox', '--use-gl=swiftshader'],
  });
  const shots = [
    ['1-start.jpg', '?shot=start&seed=7'],
    ['2-play.jpg', '?shot=play&seed=7'],
    ['3-win.jpg', '?shot=win&seed=7'],
    ['4-over.jpg', '?shot=over&seed=7'],
  ];
  for (const [name, query] of shots) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
    await page.goto('http://localhost:8082/index.html' + query, { waitUntil: 'load' });
    try {
      await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 60000 });
    } catch {
      console.log(name, 'TIMEOUT waiting for __shotReady');
    }
    await page.waitForTimeout(200);
    await page.screenshot({ path: '/home/hatch/workspace/makefun/best-game-01/honeyhold/screenshots/' + name, type: 'jpeg', quality: 88 });
    console.log(name, 'errors:', errors.length ? errors.join(' | ') : 'none');
    await page.close();
  }
  await browser.close();
  console.log('done');
})();
