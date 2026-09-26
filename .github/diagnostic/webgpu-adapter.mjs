/* Diagnostic (#1322, not for merge): reports the WebGPU adapter one Chromium executable exposes. */
import { writeFile } from 'node:fs/promises';

import { chromium } from 'playwright';

const [executablePath, output] = process.argv.slice(2);
const browser = await chromium.launch({ headless: true, executablePath });
try {
  const page = await browser.newPage();
  const result = await page.evaluate(async () => {
    const report = { isSecureContext: window.isSecureContext, navigatorGpu: 'gpu' in navigator };
    if (!report.navigatorGpu) {
      return report;
    }
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        return { ...report, adapter: null };
      }
      const { vendor, architecture, device, description, isFallbackAdapter } = adapter.info;
      const gpuDevice = await adapter.requestDevice();
      const deviceCreated = !!gpuDevice;
      gpuDevice?.destroy();
      return {
        ...report,
        adapter: { vendor, architecture, device, description, isFallbackAdapter },
        features: [...adapter.features],
        deviceCreated,
      };
    } catch (error) {
      return { ...report, error: String(error) };
    }
  });
  result.browserVersion = browser.version();
  console.log(JSON.stringify(result, null, 2));
  await writeFile(output, JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
