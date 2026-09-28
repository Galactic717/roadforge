import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const url = process.env.ROADFORGE_URL || 'http://127.0.0.1:5180/';
const city = process.env.ROADFORGE_CITY || 'tokyo-bay';
const mobile = process.argv.includes('--mobile');
const viewport = mobile ? { width: 390, height: 844 } : { width: 1280, height: 720 };
const tag = mobile ? 'portrait' : 'landscape';
const output = path.resolve('docs/captures');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: !process.argv.includes('--headed'), args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [], warnings = [], samples = [], failedRequests = [];
page.on('response', response => { if (response.status() >= 400) failedRequests.push({ status: response.status(), url: response.url().split('?')[0] }); });
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); if (message.type() === 'warning') warnings.push(message.text()); });
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.roadforge?.state.world.ready, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${output}/idle-${tag}.png` });
  console.log('Earth ready; loading city.');
  await page.getByRole('button', { name: city === 'tokyo-bay' ? 'Tokyo' : city === 'golden-gate' ? 'Golden Gate' : city === 'kyiv' ? 'Kyiv' : 'Amalfi', exact: true }).click();
  await page.waitForFunction(() => window.roadforge?.state.elapsed > 0 && !window.roadforge.state.loading, null, { timeout: 120000 });
  for (const [second, name] of [[1,'space'],[3.2,'descent'],[6,'drive'],[10,'street'],[15.5,'endcard'],[20,'after']]) {
    await page.waitForFunction(t => window.roadforge.state.elapsed >= t, second, { timeout: 60000 });
    await page.screenshot({ path: `${output}/${name}-${tag}.png` });
    samples.push(await page.evaluate(() => window.roadforge.state));
    console.log(`Verified ${name} at ${samples.at(-1).elapsed.toFixed(1)}s`);
  }
  const before = samples[2].pose;
  const after = samples.at(-1).pose;
  if (Math.hypot(after.x - before.x, after.y - before.y) < 20) errors.push('Car did not drive at least 20 metres.');
  await page.keyboard.press('c');
  await page.screenshot({ path: `${output}/cockpit-${tag}.png` });
  if (await page.locator('body').getAttribute('data-camera') !== 'cockpit') errors.push('Cockpit switch failed.');
  await page.keyboard.press('w');
  await page.waitForFunction(() => window.roadforge.state.mode === 'manual', null, { timeout: 3000 });
  await page.keyboard.press('p');
  await page.waitForFunction(() => window.roadforge.state.mode === 'pilot', null, { timeout: 3000 });
  await page.keyboard.press('r');
  await page.waitForFunction(() => window.roadforge.state.elapsed < 2 && !window.roadforge.state.loading, null, { timeout: 120000 });
  await page.waitForFunction(() => window.roadforge.state.elapsed >= 8, null, { timeout: 60000 });
  await page.screenshot({ path: `${output}/capture-${tag}.png` });
  const final = await page.evaluate(() => window.roadforge.state);
  await context.close();
  await fs.writeFile(`${output}/verification-${tag}.json`, JSON.stringify({ viewport, city, errors, warnings, failedRequests, samples, final }, null, 2));
  console.log(JSON.stringify({ viewport, city, errors, warningCount: warnings.length, failedRequests: [...new Set(failedRequests.map(x => x.url))].slice(0, 10), final }, null, 2));
  if (errors.length) process.exitCode = 1;
} finally { await browser.close(); }
