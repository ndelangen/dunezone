import { readdirSync } from 'node:fs';
import path from 'node:path';

import { chromium } from 'playwright';
import type { Page } from 'playwright';

import {
  assertPublisherFontFaces,
  assertRequiredPublisherFonts,
} from '../../src/shared/asset-publishing/publisher-fonts';
import type { PublisherFontFaceSet } from '../../src/shared/asset-publishing/publisher-fonts';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');
const publisherDist = path.join(repositoryRoot, 'workers/publisher/dist');

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function browserFontSet(page: Page): PublisherFontFaceSet {
  let lastCheck = false;
  return {
    async load(font, text) {
      const result = await page.evaluate(
        async ({ font, text }) => {
          const faces = await document.fonts.load(font, text);
          return {
            check: document.fonts.check(font, text),
            faces: faces.map((face) => ({
              family: face.family,
              weight: face.weight,
              style: face.style,
              status: face.status,
            })),
          };
        },
        { font, text: text ?? 'Publisher font readiness' }
      );
      lastCheck = result.check;
      return result.faces;
    },
    check() {
      return lastCheck;
    },
  };
}

const cssFile = readdirSync(path.join(publisherDist, 'publisher-capture')).find((file) => file.endsWith('.css'));
invariant(cssFile, 'Publisher capture CSS is missing; run publisher:assets first');

/*
 * The built filename is content-hashed, so serve it under a stable alias in the same
 * directory: relative url() references inside the CSS still resolve, and the discovered
 * filename never reaches the HTML.
 */
const cssHref = '/publisher-capture/font-regression.css';

const server = Bun.serve({
  port: 0,
  async fetch(request) {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    if (pathname === '/font-regression.html') {
      return new Response(
        `<!doctype html><html><head><link rel="stylesheet" href="${cssHref}">
        <style>
          @font-face { font-family: "StyleSubstitution"; src: url("/font/advokat-modern.woff2") format("woff2"); font-weight: 400; font-style: italic; }
          @font-face { font-family: "BrokenRequired"; src: url("/broken-required.woff2") format("woff2"); font-weight: 400; font-style: normal; }
        </style></head><body>Publisher font regression</body></html>`,
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }
    if (pathname === cssHref) {
      return new Response(Bun.file(path.join(publisherDist, 'publisher-capture', cssFile)));
    }
    if (pathname === '/broken-required.woff2') {
      return new Response('not a woff2', { headers: { 'Content-Type': 'font/woff2' } });
    }
    const relative = pathname.replace(/^\/+/, '');
    if (relative.split('/').includes('..')) {
      return new Response('Not found', { status: 404 });
    }
    const file = Bun.file(path.join(publisherDist, relative));
    return (await file.exists()) ? new Response(file) : new Response('Not found', { status: 404 });
  },
});

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.port}/font-regression.html`, {
    waitUntil: 'domcontentloaded',
  });
  const fonts = browserFontSet(page);
  await assertRequiredPublisherFonts(fonts);

  const substitutionProbe = await page.evaluate(async () => {
    const shorthand = 'normal 400 16px "StyleSubstitution"';
    const faces = await document.fonts.load(shorthand, 'Publisher font readiness');
    return {
      check: document.fonts.check(shorthand, 'Publisher font readiness'),
      styles: faces.map((face) => face.style),
    };
  });
  invariant(substitutionProbe.check, 'Chromium substitution probe did not reproduce check=true');
  invariant(
    substitutionProbe.styles.includes('italic'),
    'Chromium substitution probe did not return the declared italic FontFace'
  );

  let substitutionRejected = false;
  try {
    await assertPublisherFontFaces(fonts, [{ family: 'StyleSubstitution', weight: '400', style: 'normal' }]);
  } catch {
    substitutionRejected = true;
  }
  invariant(substitutionRejected, 'Exact font validation accepted Chromium style substitution');

  let brokenRejected = false;
  try {
    await assertPublisherFontFaces(fonts, [{ family: 'BrokenRequired', weight: '400', style: 'normal' }]);
  } catch {
    brokenRejected = true;
  }
  invariant(brokenRejected, 'Exact font validation accepted a corrupt required WOFF2');
  console.log('Publisher exact-font Chromium regression passed: production, substitution, corrupt');
} finally {
  await browser.close();
  server.stop(true);
}
