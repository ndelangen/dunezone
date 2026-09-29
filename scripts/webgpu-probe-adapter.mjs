/*
 * Throwaway (#1322 probe): reports what WebGPU adapter full Chromium finds on this machine, before any flow runs.
 * It prints the adapter's info, the GPU devices Chromium lists and chrome://gpu's feature status, and writes chrome://gpu to the evidence folder.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

import { chromium } from 'playwright';

const out = path.resolve('test-results/hosted-play');
await mkdir(out, { recursive: true });
const server = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/html' });
  response.end('<!doctype html><title>probe</title>');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM });
try {
  const devtools = await browser.newBrowserCDPSession();
  const [{ product }, { gpu }] = await Promise.all([
    devtools.send('Browser.getVersion'),
    devtools.send('SystemInfo.getInfo'),
  ]);
  console.log(`PRODUCT ${product}`);
  console.log(`GPU_DEVICES ${JSON.stringify(gpu.devices)}`);
  console.log(`GPU_DRIVER_BUG_WORKAROUNDS ${JSON.stringify(gpu.driverBugWorkarounds ?? [])}`);
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${address.port}/`);
  const adapter = await page.evaluate(async () => {
    if (!('gpu' in navigator)) {
      return { error: 'navigator.gpu is missing' };
    }
    const found = await navigator.gpu.requestAdapter();
    if (!found) {
      return { error: 'requestAdapter() returned null' };
    }
    const { vendor, architecture, device, description } = found.info ?? {};
    return {
      info: { vendor, architecture, device, description },
      isFallbackAdapter: found.isFallbackAdapter ?? found.info?.isFallbackAdapter ?? null,
      features: [...found.features].sort(),
      preferredCanvasFormat: navigator.gpu.getPreferredCanvasFormat(),
    };
  });
  console.log(`WEBGPU_ADAPTER ${JSON.stringify(adapter)}`);
  const gpuPage = await browser.newPage();
  await gpuPage.goto('chrome://gpu');
  await gpuPage.waitForTimeout(3000);
  const text = await gpuPage.evaluate(() => {
    const host = document.querySelector('info-view');
    const root = host?.shadowRoot ?? document;
    return root.body?.innerText ?? root.textContent ?? document.body.innerText;
  });
  await writeFile(path.join(out, 'chrome-gpu.txt'), text);
  const status = text.match(/Graphics Feature Status[\s\S]*?(?=Driver Bug Workarounds|Problems Detected|$)/)?.[0] ?? '';
  console.log(status.slice(0, 2000));
} finally {
  await browser.close();
  server.close();
}
