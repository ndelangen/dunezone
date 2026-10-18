import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, test } from 'vite-plus/test';

import {
  assemblePublisherAssets,
  inspectPublisherAssets,
  omitStaticRasters,
  WORKERS_STATIC_ASSET_FILE_LIMIT_BYTES,
} from './lib/publisher-assets';

const temporaryDirectories: string[] = [];

function temporaryDirectory(name: string) {
  const directory = mkdtempSync(path.join(tmpdir(), `${name}-`));
  temporaryDirectories.push(directory);
  return directory;
}

function fixture() {
  const root = temporaryDirectory('publisher-assets');
  const app = path.join(root, 'app');
  const publisher = path.join(root, 'publisher');
  mkdirSync(path.join(app, 'public'), { recursive: true });
  mkdirSync(path.join(publisher, 'publisher-capture'), { recursive: true });
  writeFileSync(path.join(app, '_shell.html'), '<html><head></head>spa shell</html>');
  writeFileSync(path.join(app, 'public', 'app-hash.js'), 'application');
  writeFileSync(path.join(publisher, 'publisher-capture.html'), '<html>capture</html>');
  writeFileSync(path.join(publisher, 'publisher-capture', 'entry-hash.js'), 'capture');
  const headers = path.join(root, '_headers');
  writeFileSync(headers, '/public/*\n  Cache-Control: public, max-age=31536000, immutable\n');
  return { root, app, publisher, headers };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('publisher Static Assets assembly', () => {
  test('hashes normalized inline scripts and limits connections to the configured backend', () => {
    const { app, publisher, headers } = fixture();
    writeFileSync(headers, readFileSync(path.resolve(import.meta.dirname, '../workers/publisher/_headers')));
    writeFileSync(
      path.join(app, '_shell.html'),
      '<head></head><script>window.start=1\r\nwindow.text="x\0y"</script ><script src="/public/app-hash.js"></script>'
    );
    assemblePublisherAssets(app, publisher, headers, 'https://test.eu-west-1.convex.cloud');
    const policy = readFileSync(path.join(publisher, '_headers'), 'utf8');
    expect(policy).toContain(
      `'sha256-${createHash('sha256').update('window.start=1\nwindow.text="x\uFFFDy"').digest('base64')}'`
    );
    expect(policy).toContain(
      "connect-src 'self' https://test.eu-west-1.convex.cloud wss://test.eu-west-1.convex.cloud"
    );
    expect(policy).not.toMatch(/unsafe-eval|script-src[^;]*unsafe-inline|__APPLICATION_CSP__/);
    expect(policy).toContain("script-src-attr 'none'");
  });

  test('omits the generated raster trees and keeps the committed web files', () => {
    const { app, publisher, headers } = fixture();
    for (const file of [
      'm/abc.def.webp',
      'image/texture/021-small.jpg',
      'web/head.png',
      'web/logo.svg',
      'font/a.woff2',
    ]) {
      mkdirSync(path.dirname(path.join(app, file)), { recursive: true });
      writeFileSync(path.join(app, file), file);
    }
    assemblePublisherAssets(app, publisher, headers);

    expect(omitStaticRasters(publisher)).toBe(3);
    expect(existsSync(path.join(publisher, 'm'))).toBe(false);
    expect(existsSync(path.join(publisher, 'image'))).toBe(false);
    expect(existsSync(path.join(publisher, 'web/head.png'))).toBe(false);
    expect(existsSync(path.join(publisher, 'web/logo.svg'))).toBe(true);
    expect(existsSync(path.join(publisher, 'font/a.woff2'))).toBe(true);
  });

  test('combines the SPA and capture outputs for Cloudflare Static Assets', () => {
    const { app, publisher, headers } = fixture();
    const report = assemblePublisherAssets(app, publisher, headers);

    expect(report.assetCount).toBe(6);
    expect(readFileSync(path.join(publisher, '_headers'), 'utf8')).toContain('immutable');
    const shell = '<html><head><meta name="robots" content="noindex"/></head>spa shell</html>';
    expect(readFileSync(path.join(publisher, 'index.html'), 'utf8')).toBe(shell);
    expect(readFileSync(path.join(publisher, '_shell.html'), 'utf8')).toBe(shell);
    expect(report.largestAsset.bytes).toBeGreaterThan(0);
  });

  test('canonicalizes only the volatile TanStack root hydration timestamp', () => {
    const { app, publisher, headers } = fixture();
    writeFileSync(
      path.join(app, '_shell.html'),
      '<head></head><script>before;i:"__root__\0",u:1784218854699,s:"success",ssr:!0;after</script>'
    );

    assemblePublisherAssets(app, publisher, headers);

    const expected =
      '<head><meta name="robots" content="noindex"/></head><script>before;i:"__root__\0",u:0,s:"success",ssr:!0;after</script>';
    expect(readFileSync(path.join(publisher, '_shell.html'), 'utf8')).toBe(expected);
    expect(readFileSync(path.join(publisher, 'index.html'), 'utf8')).toBe(expected);
  });

  test.each([
    '<link rel="canonical" href="https://dune.zone/"/>',
    '<meta property="og:url" content="https://dune.zone/"/>',
    '<meta name="description" content="Homepage"/>',
  ])('rejects a shell that names one page: %s', (tag) => {
    const { app, publisher, headers } = fixture();
    writeFileSync(path.join(app, '_shell.html'), `<html><head>${tag}</head></html>`);

    expect(() => assemblePublisherAssets(app, publisher, headers)).toThrow('must not carry a page identity');
  });

  test.each([
    ['already in the head', '<html><head><meta name="robots" content="noindex"/></head>spa shell</html>', 1],
    ['only in the body', '<html><head></head><meta name="robots" content="noindex"/></html>', 2],
  ])('marks a shell whose robots noindex is %s once in its head', (_case, input, count) => {
    const { app, publisher, headers } = fixture();
    writeFileSync(path.join(app, '_shell.html'), input);

    assemblePublisherAssets(app, publisher, headers);

    const shell = readFileSync(path.join(publisher, '_shell.html'), 'utf8');
    expect(shell.startsWith('<html><head><meta name="robots" content="noindex"/>')).toBe(true);
    expect(shell.split('name="robots"').length - 1).toBe(count);
  });

  test('refuses a shell with no head to carry its noindex', () => {
    const { app, publisher, headers } = fixture();
    writeFileSync(path.join(app, '_shell.html'), '<html>spa shell</html>');

    expect(() => assemblePublisherAssets(app, publisher, headers)).toThrow('no <head>');
  });

  test('removes stale assembled assets while preserving the fresh capture build', () => {
    const { app, publisher, headers } = fixture();
    mkdirSync(path.join(publisher, '__storybook'));
    writeFileSync(path.join(publisher, '__storybook', 'index.html'), 'stale Storybook');
    writeFileSync(path.join(publisher, 'old-application.js'), 'stale application');

    assemblePublisherAssets(app, publisher, headers);

    expect(existsSync(path.join(publisher, '__storybook'))).toBe(false);
    expect(existsSync(path.join(publisher, 'old-application.js'))).toBe(false);
    expect(readFileSync(path.join(publisher, 'publisher-capture.html'), 'utf8')).toBe('<html>capture</html>');
  });

  test('fails closed for oversized files and symbolic links', () => {
    const oversized = fixture();
    writeFileSync(
      path.join(oversized.publisher, 'publisher-capture', 'too-large.bin'),
      new Uint8Array(WORKERS_STATIC_ASSET_FILE_LIMIT_BYTES + 1)
    );
    expect(() => assemblePublisherAssets(oversized.app, oversized.publisher, oversized.headers)).toThrow(
      'exceeds 25 MiB'
    );

    const linked = fixture();
    symlinkSync(
      path.join(linked.publisher, 'publisher-capture.html'),
      path.join(linked.publisher, 'publisher-capture', 'linked.html')
    );
    expect(() => inspectPublisherAssets(linked.publisher)).toThrow('symbolic link');
  });
});
