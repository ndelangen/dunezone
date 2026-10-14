import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { getPlatformProxy, unstable_dev } from 'wrangler';

import { BLOG_POST_PAGES, MEDIA_PUBLIC_PAGES, RECORDLESS_PUBLIC_PAGES } from '../src/shared/recordlessPublicPages.ts';
import { jpegProfile, pngDimensions } from '../workers/publisher/image-inspection.ts';

/* Exercise the assembled Worker, including Static Assets precedence and the real TanStack entry. */
process.chdir(path.resolve(import.meta.dirname, '../workers/publisher'));
type RuntimeFixture = {
  backendUrl: string;
  siteUrl: string;
  storageDirectory: string;
  artifactKey: string;
  html: string;
};
const fixture: RuntimeFixture | undefined = process.env.APPLICATION_RUNTIME_FIXTURE
  ? JSON.parse(readFileSync(process.env.APPLICATION_RUNTIME_FIXTURE, 'utf8'))
  : undefined;

function isEmptyArtifactStoreReader(pathname: string, html: string) {
  /* The deployed-backend rehearsal has empty local R2, so ready HTML needs a second query for renderer fallback. */
  return (
    !fixture &&
    /^\/rulesets\/[^/?]+\/rulebooks\/[^/?]+(?:\?edition=\d+)?$/.test(pathname) &&
    html.includes('data-rulebook-reader-document')
  );
}

/* Pages with no record behind them render without a metadata query. */
const RECORDLESS_PAGES = ['/', ...RECORDLESS_PUBLIC_PAGES, ...BLOG_POST_PAGES, ...MEDIA_PUBLIC_PAGES];

function assertPublicMetadataQueries(count: number, pathname: string, html: string, historicalFallback: boolean) {
  if (isEmptyArtifactStoreReader(pathname, html)) {
    assert.ok([1, 2].includes(count), `${pathname} has unexpected renderer query count ${count}`);
    return;
  }
  assert.equal(count, RECORDLESS_PAGES.includes(pathname) ? 0 : historicalFallback ? 2 : 1, pathname);
}

if (fixture) {
  for (const origin of [fixture.backendUrl, fixture.siteUrl]) {
    assert.equal(new URL(origin).hostname, '127.0.0.1', 'Runtime fixtures only accept an isolated loopback backend');
  }
  const platform = await getPlatformProxy<{ ASSET_BUCKET: { put(key: string, value: string): Promise<unknown> } }>({
    configPath: path.resolve('wrangler.jsonc'),
    persist: { path: path.join(fixture.storageDirectory, 'v3') },
    remoteBindings: false,
    envFiles: [],
  });
  try {
    await platform.env.ASSET_BUCKET.put(fixture.artifactKey, fixture.html);
  } finally {
    await platform.dispose();
  }
}
const worker = await unstable_dev('index.ts', {
  config: 'wrangler.jsonc',
  local: true,
  port: 0,
  persist: Boolean(fixture),
  ...(fixture
    ? {
        persistTo: fixture.storageDirectory,
        vars: {
          CONVEX_CLOUD_BASE_URL: fixture.backendUrl,
          CONVEX_EXECUTOR_BASE_URL: `${fixture.siteUrl}/asset-publishing/executor`,
          CONVEX_RENDER_URL: `${fixture.siteUrl}/asset-publishing/render`,
        },
      }
    : {}),
  logLevel: 'error',
  experimental: { disableExperimentalWarning: true, watch: false },
});
try {
  const bundledAssets = readdirSync('dist/public');
  const bandPoster = bundledAssets.find((name) => /^band_poster-[\w-]+\.jpg$/.test(name));
  const bandVideo = bundledAssets.find((name) => /^band-[\w-]+\.mp4$/.test(name));
  assert.ok(bandPoster, 'The header poster needs a content-hashed URL');
  assert.ok(bandVideo, 'The header video needs a content-hashed URL');
  for (const [name, source] of [
    [bandPoster, 'band-poster.jpg'],
    [bandVideo, 'band.mp4'],
  ]) {
    const response = await worker.fetch(`/public/${name}`);
    assert.equal(response.status, 200, name);
    assert.equal(response.headers.get('Cache-Control'), 'public, max-age=31536000, immutable', name);
    const original = readFileSync(`../../public/video/${source}`);
    assert.equal(Buffer.compare(Buffer.from(await response.arrayBuffer()), original), 0, name);
    const legacy = await worker.fetch(`/video/${source}`);
    assert.equal(legacy.status, 200, source);
    assert.equal(Buffer.compare(Buffer.from(await legacy.arrayBuffer()), original), 0, source);
  }
  const videoRange = await worker.fetch(`/public/${bandVideo}`, { headers: { Range: 'bytes=0-1023' } });
  /* Static Assets may answer a range request with the complete file, as the legacy video does. */
  assert.ok([200, 206].includes(videoRange.status));
  assert.equal(videoRange.headers.get('Cache-Control'), 'public, max-age=31536000, immutable');
  const originalVideo = readFileSync('../../public/video/band.mp4');
  assert.equal(
    Buffer.compare(
      Buffer.from(await videoRange.arrayBuffer()),
      videoRange.status === 206 ? originalVideo.subarray(0, 1024) : originalVideo
    ),
    0
  );
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
  const pages = [
    '/',
    '/factions',
    '/assets',
    '/assets/token-disc',
    '/rulesets',
    '/profiles',
    ...RECORDLESS_PUBLIC_PAGES,
    ...BLOG_POST_PAGES,
    ...MEDIA_PUBLIC_PAGES,
  ];
  let rulebookPage: string | undefined;
  let groupPage: string | undefined;
  let faqPage: string | undefined;
  let verifiedPages = 0;
  let nextSocialProbeAt = 0;
  /* Catalogues, profiles and the homepage can each link the same record; the first visit checks it, and a second would hit the cache. */
  const visited = new Set<string>();
  /* The homepage names showcase records by hand, so each must still answer at the address it links. */
  const editorialPages = new Set<string>();
  for (const pathname of pages) {
    if (visited.has(pathname) || (pathname.startsWith('/profiles/') && groupPage && faqPage)) {
      continue;
    }
    visited.add(pathname);
    verifiedPages += 1;
    const response = await worker.fetch(pathname, { headers: { Cookie: 'private=must-not-reach-ssr' } });
    assert.equal(response.status, 200, pathname);
    assert.equal(response.headers.get('X-Application-Release'), health.application.release, pathname);
    assert.equal(response.headers.get('Cache-Control'), 'no-store', pathname);
    assert.equal(response.headers.get('Set-Cookie'), null, pathname);
    assert.equal(response.headers.get('X-Public-Cache'), 'miss', pathname);
    /* A public page that says noindex silently drops out of search. */
    assert.equal(response.headers.get('X-Robots-Tag'), null, pathname);
    const historicalFallback = Boolean(fixture && pathname.endsWith('/runtime-manual?edition=1'));
    const html = await response.text();
    assert.ok(html.includes(`href="/public/${bandPoster}"`), `${pathname} does not preload the hashed poster`);
    assert.ok(html.includes(`src="/public/${bandPoster}"`), `${pathname} does not display the preloaded poster`);
    assert.doesNotMatch(html, /<meta\b[^>]*\bname=["']robots["']/i, pathname);
    assertPublicMetadataQueries(
      Number(response.headers.get('X-Public-Metadata-Queries') ?? 0),
      pathname,
      html,
      historicalFallback
    );
    if (fixture && pathname.endsWith('/runtime-manual')) {
      assert.match(html, /data-published-rulebook/);
      assert.match(html, /Rulebook page: Runtime Edition 2/);
    }
    if (historicalFallback) {
      assert.doesNotMatch(html, /data-published-rulebook/);
      assert.match(html, /Rulebook page: Runtime Edition 1/);
      assert.doesNotMatch(html, /Rulebook page: Runtime Edition 2/);
    }
    const hit = await worker.fetch(pathname);
    assert.equal(hit.headers.get('X-Public-Cache'), 'hit', pathname);
    assert.equal(hit.headers.get('X-Public-Metadata-Queries'), '0', pathname);
    assert.equal(await hit.text(), html, pathname);
    if (pathname === '/factions' || pathname === '/assets/token-disc' || pathname === '/rulesets') {
      const links = [...html.matchAll(/<a[^>]+href="([^"]+)"/g)].map((match) => match[1]!);
      if (pathname === '/rulesets') {
        const details = [...new Set(links.filter((href) => /^\/rulesets\/(?!create(?:\/|$))[^/?]+\/?$/.test(href)))];
        assert.ok(details.length, `${pathname} has no ordinary detail link`);
        pages.push(...details);
      } else {
        const detail = links.find((href) =>
          pathname === '/factions'
            ? /^\/factions\/(?!create(?:\/|$))[^/?]+\/?$/.test(href)
            : /^\/assets\/token-disc\/(?!create(?:\/|$))[^/?]+\/?$/.test(href)
        );
        assert.ok(detail, `${pathname} has no ordinary detail link`);
        pages.push(detail);
      }
    }
    if (/^\/rulesets\/[^/]+\/?$/.test(pathname) && !rulebookPage) {
      rulebookPage = [...html.matchAll(/<a[^>]+href="([^"]+)"/g)]
        .map((match) => match[1]!)
        .find((href) => /^\/rulesets\/[^/]+\/rulebooks\/(?!create(?:\/|$))[^/?]+\/?$/.test(href));
      if (rulebookPage) {
        pages.push(rulebookPage, `${rulebookPage}?edition=1`);
      }
    }
    const publicLinks = [...html.matchAll(/<a[^>]+href="([^"]+)"/g)].map((match) => match[1]!);
    if (pathname === '/profiles') {
      const profiles = [...new Set(publicLinks.filter((href) => /^\/profiles\/[^/?]+\/?$/.test(href)))];
      assert.ok(profiles.length, 'The profile directory has no profile links');
      pages.push(...profiles);
    }
    if (pathname.startsWith('/profiles/')) {
      if (!groupPage) {
        groupPage = publicLinks.find((href) => /^\/groups\/(?!create(?:\/|$))[^/?]+\/?$/.test(href));
        if (groupPage) {
          pages.push(groupPage);
        }
      }
      if (!faqPage) {
        faqPage = publicLinks.find((href) => /^\/rulesets\/[^/]+\/faq\/(?!create(?:\/|$))[^/?]+\/?$/.test(href));
        if (faqPage) {
          pages.push(faqPage);
        }
      }
    }
    if (editorialPages.has(pathname)) {
      assert.equal(response.redirected, false, `The homepage links to ${pathname}, which has moved`);
    }
    assert.match(html, /<h1[\s>]/, `${pathname} has no rendered heading`);
    assert.match(html, /rel="canonical"/, `${pathname} has no canonical URL`);
    assert.match(html, /property="og:title"/, `${pathname} has no social metadata`);
    assert.ok(html.endsWith('</html>'), `${pathname} returned a truncated document`);
    if (MEDIA_PUBLIC_PAGES.includes(pathname)) {
      /* The media layout builds each gallery's head from its child route's params, so check the canonical is the gallery's own. */
      assert.ok(
        html.includes(`rel="canonical" href="https://dune.zone${pathname}"`),
        `${pathname} has the wrong canonical URL`
      );
    }
    if (pathname === '/') {
      if (!fixture) {
        /* A deleted showcase record fails as a 404, and a renamed one as a redirect, so the homepage never links through either. */
        const editorial = publicLinks.filter((href) =>
          /^\/(?:(?:factions|groups|rulesets)|assets\/[^/?]+)\/(?!create(?:\/|$))[^/?]+\/?$/.test(href)
        );
        assert.ok(editorial.length, 'The homepage links to no showcase records');
        for (const href of editorial) {
          editorialPages.add(href);
        }
        pages.push(...editorial);
      }
      assert.match(html, /Dune Play is coming soon/i);
      assert.match(html, /Your rules\. Always within reach\./, 'The homepage chapters are not rendered on the server');
      assert.match(
        html,
        /<a[^>]+href="\/rulesets"[^>]*>(?:<[^>]+>)*Read the Rulesets/,
        'The homepage has no rendered Rulesets link'
      );
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
    } else if (
      !['/factions', '/assets', '/assets/token-disc'].includes(pathname) &&
      /* The galleries share one card template, and so do the blog posts, so one render covers each. */
      !(pathname.startsWith('/media/game/') && pathname !== MEDIA_PUBLIC_PAGES[1]) &&
      !(pathname.startsWith('/blog/') && pathname !== BLOG_POST_PAGES[0])
    ) {
      const image = /property="og:image" content="([^"]+)"/.exec(html)?.[1]?.replaceAll('&amp;', '&');
      assert.ok(image, `${pathname} has no social image URL`);
      const imageUrl = new URL(image);
      assert.equal(imageUrl.pathname, '/social/image.png');
      /* Cold renders share the global 20-per-10-second budget.
       * Pace them at one per second; repeated cache reads need no delay.
       */
      await delay(Math.max(0, nextSocialProbeAt - performance.now()));
      nextSocialProbeAt = performance.now() + 1000;
      const png = await worker.fetch(imageUrl.pathname + imageUrl.search);
      assert.equal(png.status, 200, pathname);
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
  assert.ok(rulebookPage, 'No Ruleset has a published Rulebook link');
  assert.ok(groupPage, 'No profile has a Group link');
  assert.ok(faqPage, 'No profile has a FAQ question link');
  const browserOnlyPages = [
    '/media/topics',
    '/groups/create',
    '/groups/dreamers/edit',
    '/profiles/central/edit',
    '/rulesets/dreamrules/faq/create',
    '/factions/create',
    '/factions/testfaction/edit',
    '/assets/token-disc/create',
    '/rulesets/create',
    '/rulesets/dreamrules/edit',
    '/rulesets/dreamrules/rulebooks/create',
    '/rulesets/dreamrules/rulebooks/dream-rulebook/edit',
    '/auth/login',
    '/play',
  ];
  for (const pathname of browserOnlyPages) {
    const response = await worker.fetch(pathname);
    assert.equal(response.status, 200, pathname);
    assert.equal(response.headers.get('X-Application-Release'), null, pathname);
    await response.body?.cancel();
  }
  for (const pathname of [
    `${rulebookPage}?edition=${Number.MAX_SAFE_INTEGER}`,
    '/assets/token-disc/__ssr_missing_asset__',
    '/rulesets/__ssr_missing_ruleset__',
    '/rulesets/__ssr_missing_ruleset__/rulebooks/__ssr_missing_rulebook__',
    '/factions/missing/extra',
    '/assets/unknown-type/missing/extra',
    '/glossary/missing',
    '/media/game/missing',
    '/blog/__ssr_missing_post__',
    '/media/game',
    '/media/missing',
  ]) {
    const missing = await worker.fetch(pathname);
    assert.equal(missing.status, 404, pathname);
    assert.match(await missing.text(), /Page not found/, pathname);
  }
  const capture = await worker.fetch('/publisher-capture.html');
  assert.equal(capture.status, 404);
  await capture.body?.cancel();
  console.log(
    JSON.stringify({
      ok: true,
      publicPages: verifiedPages,
      browserOnlyPages: browserOnlyPages.length,
      captureProtected: true,
      headerMedia: { poster: `/public/${bandPoster}`, video: `/public/${bandVideo}`, rangeStatus: videoRange.status },
    })
  );
} finally {
  await worker.stop();
}
