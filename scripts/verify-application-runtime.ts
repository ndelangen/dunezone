import assert from 'node:assert/strict';
import path from 'node:path';

import { unstable_dev } from 'wrangler';

import { jpegProfile, pngDimensions } from '../workers/publisher/image-inspection.ts';

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
  const robots = await worker.fetch('/robots.txt');
  assert.equal(robots.status, 200);
  assert.ok((await robots.text()).includes('Sitemap: https://dune.zone/sitemap.xml'));
  const sitemap = await worker.fetch('/sitemap.xml');
  assert.equal(sitemap.status, 200);
  assert.match(sitemap.headers.get('Content-Type') ?? '', /application\/xml/);
  assert.ok((await sitemap.text()).includes('https://dune.zone/sitemap-factions.xml'));
  assert.equal((await worker.fetch('/sitemap-missing.xml')).status, 404);
  const pages = ['/', '/factions', '/assets', '/assets/token-disc', '/rulesets'];
  for (const pathname of pages) {
    const response = await worker.fetch(pathname, { headers: { Cookie: 'private=must-not-reach-ssr' } });
    assert.equal(response.status, 200, pathname);
    assert.equal(response.headers.get('X-Application-Release'), health.application.release, pathname);
    assert.equal(response.headers.get('Cache-Control'), 'no-store', pathname);
    assert.equal(response.headers.get('Set-Cookie'), null, pathname);
    assert.equal(response.headers.get('X-Public-Cache'), 'miss', pathname);
    assert.equal(Number(response.headers.get('X-Public-Metadata-Queries') ?? 0), pathname === '/' ? 0 : 1, pathname);
    const html = await response.text();
    const hit = await worker.fetch(pathname);
    assert.equal(hit.headers.get('X-Public-Cache'), 'hit', pathname);
    assert.equal(hit.headers.get('X-Public-Metadata-Queries'), '0', pathname);
    assert.equal(await hit.text(), html, pathname);
    if (pathname === '/factions' || pathname === '/assets/token-disc' || pathname === '/rulesets') {
      const links = [...html.matchAll(/<a[^>]+href="([^"]+)"/g)].map((match) => match[1]!);
      const detail = links.find((href) =>
        pathname === '/factions'
          ? /^\/factions\/(?!create(?:\/|$))[^/?]+\/?$/.test(href)
          : pathname === '/rulesets'
            ? /^\/rulesets\/(?!create(?:\/|$))[^/?]+\/?$/.test(href)
            : /^\/assets\/token-disc\/(?!create(?:\/|$))[^/?]+\/?$/.test(href)
      );
      assert.ok(detail, `${pathname} has no ordinary detail link`);
      pages.push(detail);
    }
    if (/^\/rulesets\/[^/]+\/?$/.test(pathname)) {
      const rulebook = [...html.matchAll(/<a[^>]+href="([^"]+)"/g)]
        .map((match) => match[1]!)
        .find((href) => /^\/rulesets\/[^/]+\/rulebooks\/(?!create(?:\/|$))[^/?]+\/?$/.test(href));
      if (rulebook) {
        pages.push(rulebook, `${rulebook}?edition=1`);
      }
    }
    if (pathname !== '/') {
      assert.match(html, /<h1[\s>]/, `${pathname} has no rendered heading`);
    }
    assert.match(html, /rel="canonical"/, `${pathname} has no canonical URL`);
    assert.match(html, /property="og:title"/, `${pathname} has no social metadata`);
    assert.ok(html.endsWith('</html>'), `${pathname} returned a truncated document`);
    if (pathname === '/') {
      assert.match(html, /Dune Play is coming soon/i);
      const image = /property="og:image" content="([^"]+)"/.exec(html)?.[1];
      assert.ok(image, 'The homepage has no social image');
      assert.equal(new URL(image).origin, 'https://dune.zone');
      assert.match(html, /property="og:image:width" content="1200"/);
      assert.match(html, /property="og:image:height" content="630"/);
      assert.match(html, /name="twitter:card" content="summary_large_image"/);
      assert.ok(html.includes(`name="twitter:image" content="${image}"`));
      const jpeg = await worker.fetch(new URL(image).pathname);
      assert.equal(jpeg.status, 200);
      assert.match(jpeg.headers.get('Content-Type') ?? '', /image\/jpeg/);
      const profile = jpegProfile(new Uint8Array(await jpeg.arrayBuffer()));
      assert.equal(profile.widthPx, 1200);
      assert.equal(profile.heightPx, 630);
      const head = await worker.fetch('/', { method: 'HEAD', headers: { 'User-Agent': 'Twitterbot/1.0' } });
      assert.equal(head.status, 200);
      assert.equal(head.headers.get('X-Public-Cache'), 'hit');
      assert.equal(await head.text(), '');
    } else if (pathname !== '/factions' && pathname !== '/assets' && pathname !== '/assets/token-disc') {
      const image = /property="og:image" content="([^"]+)"/.exec(html)?.[1]?.replaceAll('&amp;', '&');
      assert.ok(image, `${pathname} has no social image URL`);
      const imageUrl = new URL(image);
      assert.equal(imageUrl.pathname, '/social/image.png');
      const png = await worker.fetch(imageUrl.pathname + imageUrl.search);
      assert.equal(png.status, 200);
      assert.equal(png.headers.get('Content-Type'), 'image/png');
      assert.deepEqual(pngDimensions(new Uint8Array(await png.arrayBuffer())), { widthPx: 1200, heightPx: 630 });
      const imageHit = await worker.fetch(imageUrl.pathname + imageUrl.search);
      assert.equal(imageHit.headers.get('X-Public-Cache'), 'hit');
      assert.equal(imageHit.headers.get('X-Public-Renders'), '0');
      assert.equal(imageHit.headers.get('X-Public-Artwork-Reads'), '0');
      await imageHit.arrayBuffer();
    }

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
    '/rulesets/create',
    '/rulesets/dreamrules/edit',
    '/rulesets/dreamrules/rulebooks/create',
    '/rulesets/dreamrules/rulebooks/dream-rulebook/edit',
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
    '/rulesets/__ssr_missing_ruleset__',
    '/rulesets/__ssr_missing_ruleset__/rulebooks/__ssr_missing_rulebook__',
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
