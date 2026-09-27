/* Diagnostic (#1343, not for merge): records chrome://gpu's feature status for one Chromium executable and switch set. */
import { writeFile } from 'node:fs/promises';

import { chromium } from 'playwright';

const [executablePath, output, ...args] = process.argv.slice(2);
const browser = await chromium.launch({ headless: true, executablePath, args });
try {
  const page = await browser.newPage();
  await page.goto('chrome://gpu');
  await page.waitForTimeout(2000);
  const text = await page.evaluate(() => {
    const walk = (node) =>
      (node.shadowRoot ? walk(node.shadowRoot) : '') +
      [...node.childNodes]
        .map((child) => (child.nodeType === 3 ? child.textContent : child.nodeType === 1 ? `${walk(child)}\n` : ''))
        .join('');
    return walk(document.body);
  });
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const status = {};
  for (const name of ['Canvas:', 'Compositing:', 'Rasterization:', 'WebGL:', 'WebGL2:', 'WebGPU:']) {
    const index = lines.indexOf(name);
    if (index >= 0) {
      status[name.slice(0, -1)] = lines[index + 1];
    }
  }
  const result = { args, status, glRenderer: lines.find((line) => line.startsWith('GL_RENDERER')) };
  console.log(JSON.stringify(result, null, 2));
  await writeFile(output, `${JSON.stringify({ ...result, lines }, null, 2)}\n`);
} finally {
  await browser.close();
}
