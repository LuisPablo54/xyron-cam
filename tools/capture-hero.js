// Grabo los cuadros del video de portada desde tools/hero-capture.html (requiere el sitio en http://localhost:8000).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE_URL = 'http://localhost:8000/tools/hero-capture.html';
const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;
const LOOP_SECONDS = 24;

async function main(outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  await page.goto(BASE_URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.captureReady, null, { timeout: 120000 });
  for (let frame = 0; frame < FPS * LOOP_SECONDS; frame += 1) {
    await page.evaluate(([t, fps]) => window.renderAt(t, fps), [frame / FPS, FPS]);
    await page.screenshot({ path: path.join(outDir, `f${String(frame).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 95 });
  }
  await browser.close();
}

main(process.argv[2] || 'frames');
