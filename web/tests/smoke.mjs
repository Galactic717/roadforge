import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const origin = 'http://127.0.0.1:5187';
// Exercise the public first-run path even if a developer has local credentials.
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'vite.config.js', '--host', '127.0.0.1', '--port', '5187', '--strictPort'], {
  stdio: 'pipe', env: { ...process.env, VITE_CESIUM_ION_TOKEN: '', VITE_GOOGLE_MAPS_API_KEY: '' },
});
let serverLog = '', browser;
server.stdout.on('data', data => { serverLog += data; });
server.stderr.on('data', data => { serverLog += data; });
server.on('error', error => { serverLog += error.message; });

async function sceneFrame(page) {
  return page.locator('#globe canvas').evaluate(canvas => {
    const sample = document.createElement('canvas'); sample.width = 64; sample.height = 36;
    const context = sample.getContext('2d', { willReadFrequently: true });
    context.drawImage(canvas, 0, 0, 64, 36);
    const pixels = Array.from(context.getImageData(0, 0, 64, 36).data);
    const colors = new Set();
    for (let i = 0; i < pixels.length; i += 4) colors.add(`${pixels[i] >> 4},${pixels[i + 1] >> 4},${pixels[i + 2] >> 4}`);
    return { pixels, colors: colors.size, width: canvas.clientWidth, height: canvas.clientHeight };
  });
}

async function drive(page, viewport) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /rendering has stopped|error occurred while rendering|DeveloperError|RuntimeError/i.test(message.text())) errors.push(message.text());
  });
  await page.goto(origin);
  await page.locator('#globe canvas').waitFor();
  await page.waitForFunction(() => Boolean(window.roadforge), null, { timeout: 60000 });
  const entry = page.locator('#route-query');
  assert.ok(await entry.isVisible(), 'The primary route field must be visible on arrival');
  const entryBounds = await page.locator('#route-form').boundingBox();
  assert.ok(entryBounds.x >= 0 && entryBounds.x + entryBounds.width <= viewport.width, 'Route entry must fit the viewport');
  await entry.fill('Київ');
  await page.locator('#route-submit').click();
  await page.waitForFunction(() => document.getElementById('route-error').textContent.length > 0, null, { timeout: 5000 });
  assert.ok(await page.locator('#route-submit').isEnabled(), 'An incomplete route must leave the form usable');
  assert.equal(await page.evaluate(() => window.roadforge.state.loading), false, 'Invalid input must release the loading screen');
  assert.equal(await page.locator('[data-mission]').count(), 4, 'There should be four city chips');
  await page.locator('[data-mission="kyiv"]').click();
  await page.waitForFunction(() => !window.roadforge?.state.loading && window.roadforge?.state.city === 'kyiv', null, { timeout: 90000 });
  const start = await page.evaluate(() => window.roadforge.state.pose.progress);
  await page.waitForFunction(progress => window.roadforge.state.pose.progress > progress + 20 && window.roadforge.state.elapsed > 6, start, { timeout: 60000 }).catch(async error => {
    throw new Error(`${error.message}\nScene state: ${JSON.stringify(await page.evaluate(() => window.roadforge.state))}\nErrors: ${errors.join('; ')}`);
  });
  const first = await sceneFrame(page);
  assert.equal(first.width, viewport.width, 'Scene must fill the viewport width');
  assert.equal(first.height, viewport.height, 'Scene must fill the viewport height');
  assert.ok(first.colors > 15, 'Rendered Earth must not be a blank frame');
  await page.waitForTimeout(1500);
  const second = await sceneFrame(page);
  assert.ok(second.pixels.some((value, i) => Math.abs(value - first.pixels[i]) > 12), 'Driving should change the rendered frame');

  await page.keyboard.press('c');
  assert.equal(await page.evaluate(() => window.roadforge.state.camera), 'cockpit');
  assert.ok(await page.locator('.cockpit').isVisible(), 'Cockpit silhouette should be visible');
  await page.keyboard.press('c');
  await page.keyboard.down('w');
  await page.waitForFunction(() => window.roadforge.state.mode === 'manual');
  await page.keyboard.up('w');
  await page.keyboard.press('p');
  await page.waitForFunction(() => window.roadforge.state.mode === 'pilot');
  await page.keyboard.press('Space');
  const paused = await page.evaluate(() => window.roadforge.state);
  assert.ok(paused.paused, 'Space should pause the drive');
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => window.roadforge.state.pose.progress), paused.pose.progress, 'Paused car should stay in place');
  await page.keyboard.press('Space');

  // Keep a real drive running long enough to catch delayed render failures.
  await page.waitForFunction(() => window.roadforge.state.elapsed >= 20, null, { timeout: 60000 });

  await page.keyboard.press('r');
  await page.waitForFunction(() => document.body.classList.contains('capture') && !window.roadforge.state.loading && window.roadforge.state.elapsed > 5, null, { timeout: 90000 });
  const chromeHidden = await page.locator('.chrome').evaluateAll(elements => elements.every(element => getComputedStyle(element).opacity === '0'));
  assert.ok(chromeHidden, 'Capture must hide all app chrome');
  const credits = page.locator('.cesium-viewer-bottom');
  assert.ok(await credits.isVisible(), 'Capture must preserve provider attribution');
  assert.ok(await credits.evaluate(element => getComputedStyle(element).opacity !== '0'), 'Credits must not fade with the controls');
  assert.ok((await sceneFrame(page)).colors > 15, 'Capture must still render the world');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.body.classList.contains('capture'));
  await page.waitForTimeout(700);
  assert.ok(await page.locator('.drive-controls').evaluate(element => Number(getComputedStyle(element).opacity) > .9), 'Esc must restore driving controls');
  assert.deepEqual(errors, [], 'No application or Cesium rendering exceptions');
  const progress = await page.evaluate(() => window.roadforge.state.pose.progress);
  console.log(`Browser smoke passed at ${viewport.width}×${viewport.height}: route validation, real Kyiv drive, ${Math.round(progress)}m, chase/cockpit, manual/pilot, pause, clean capture with credits.`);
  await page.close();
}

try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null) throw new Error(`Vite exited: ${serverLog}`);
    try { const response = await fetch(origin); if (response.ok) { ready = true; break; } } catch { /* Vite is starting. */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error(`Vite did not start: ${serverLog}`);
  browser = await chromium.launch({ headless: true });
  for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    await drive(page, viewport);
  }
} finally {
  if (browser) await browser.close();
  server.kill();
}
