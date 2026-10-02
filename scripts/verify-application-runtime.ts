import assert from 'node:assert/strict';
import path from 'node:path';

import { unstable_dev } from 'wrangler';

/* Exercise the assembled Worker, including Static Assets precedence and the real TanStack entry. */
process.chdir(path.resolve(import.meta.dirname, '../workers/publisher'));
const worker = await unstable_dev('index.ts', {
  config: 'wrangler.jsonc',
  local: true,
  port: 0,
  persist: false,
  logLevel: 'error',
  experimental: { disableExperimentalWarning: true, watch: false },
});
try {
  const healthResponse = await worker.fetch('/__asset-publisher/health');
  assert.equal(healthResponse.status, 200);
  const health = (await healthResponse.json()) as { application: { release: string } };
  const pages = ['/factions', '/assets', '/assets/token-disc'];
  for (const pathname of pages) {
    const response = await worker.fetch(pathname, { headers: { Cookie: 'private=must-not-reach-ssr' } });
    assert.equal(response.status, 200, pathname);
    assert.equal(response.headers.get('X-Application-Release'), health.application.release, pathname);
    assert.equal(response.headers.get('Cache-Control'), 'no-store', pathname);
    assert.equal(response.headers.get('Set-Cookie'), null, pathname);
    const html = await response.text();
    if (pathname === '/factions' || pathname === '/assets/token-disc') {
      const links = [...html.matchAll(/<a[^>]+href="([^"]+)"/g)].map((match) => match[1]!);
      const detail = links.find((href) =>
        pathname === '/factions'
          ? /^\/factions\/(?!create(?:\/|$))[^/?]+\/?$/.test(href)
          : /^\/assets\/token-disc\/(?!create(?:\/|$))[^/?]+\/?$/.test(href)
      );
      assert.ok(detail, `${pathname} has no ordinary detail link`);
      pages.push(detail);
    }
    assert.match(html, /<h1[\s>]/, `${pathname} has no rendered heading`);
    assert.match(html, /rel="canonical"/, `${pathname} has no canonical URL`);
    assert.match(html, /property="og:title"/, `${pathname} has no social metadata`);
    assert.ok(html.endsWith('</html>'), `${pathname} returned a truncated document`);
    const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]!);
    assert.ok(scripts.length > 0, `${pathname} has no hydration entry`);
    for (const script of scripts) {
      const asset = await worker.fetch(script);
      assert.equal(asset.status, 200, script);
      assert.match(asset.headers.get('Content-Type') ?? '', /javascript/, script);
      await asset.body?.cancel();
    }
  }
  for (const pathname of [
    '/factions/create',
    '/factions/testfaction/edit',
    '/assets/token-disc/create',
    '/auth/login',
    '/play',
  ]) {
    const response = await worker.fetch(pathname);
    assert.equal(response.status, 200, pathname);
    assert.equal(response.headers.get('X-Application-Release'), null, pathname);
    await response.body?.cancel();
  }
  for (const pathname of [
    '/assets/token-disc/__ssr_missing_asset__',
    '/factions/missing/extra',
    '/assets/unknown-type/missing/extra',
  ]) {
    const missing = await worker.fetch(pathname);
    assert.equal(missing.status, 404, pathname);
    assert.match(await missing.text(), /Page not found/, pathname);
  }
  const capture = await worker.fetch('/publisher-capture.html');
  assert.equal(capture.status, 404);
  await capture.body?.cancel();
  console.log(JSON.stringify({ ok: true, publicPages: pages.length, browserOnlyPages: 5, captureProtected: true }));
} finally {
  await worker.stop();
}
