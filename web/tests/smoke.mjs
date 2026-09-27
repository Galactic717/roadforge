import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'vite.config.js', '--host', '127.0.0.1', '--port', '5187', '--strictPort'], { stdio: 'pipe' });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { const response = await fetch('http://127.0.0.1:5187/'); if (response.ok) { ready = true; break; } } catch { /* still starting */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error('Vite did not start');
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5187/');
  await page.locator('#globe canvas').waitFor();
  if (!await page.locator('.cesium-viewer').isVisible()) throw new Error('Globe is blank');
  await page.locator('[data-mission=kyiv]').click();
  await page.waitForTimeout(5000);
  const speed = Number(await page.locator('#speed').innerText());
  if (!(speed > 0)) throw new Error('Preset car did not move');
  if (!await page.locator('#remaining').innerText() || errors.length) throw new Error(`Drive error: ${errors.join('; ')}`);
  await page.keyboard.press('c');
  if (!await page.locator('[data-camera=CHASE]').evaluate(el => el.classList.contains('active'))) throw new Error('Camera did not cycle');
  console.log(`Browser smoke passed: Earth, cached Kyiv road, moving car (${speed} km/h), HUD, camera`);
} finally {
  if (browser) await browser.close();
  server.kill();
}
