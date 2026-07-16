import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import {
  assemblePublisherAssets,
  inspectPublisherAssets,
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
  writeFileSync(path.join(app, '_shell.html'), '<html>spa shell</html>');
  writeFileSync(path.join(app, '_redirects'), '/* /_shell.html 200');
  writeFileSync(path.join(app, 'public', 'app-hash.js'), 'application');
  writeFileSync(path.join(publisher, 'publisher-capture.html'), '<html>capture</html>');
  writeFileSync(path.join(publisher, 'publisher-capture', 'entry-hash.js'), 'capture');
  return { root, app, publisher };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('publisher Static Assets assembly', () => {
  test('combines the SPA and capture outputs without Netlify routing metadata', () => {
    const { app, publisher } = fixture();
    const report = assemblePublisherAssets(app, publisher);

    expect(report.assetCount).toBe(5);
    expect(readFileSync(path.join(publisher, 'index.html'), 'utf8')).toBe('<html>spa shell</html>');
    expect(readFileSync(path.join(publisher, '_shell.html'), 'utf8')).toBe(
      '<html>spa shell</html>'
    );
    expect(() => readFileSync(path.join(publisher, '_redirects'))).toThrow();
    expect(report.largestAsset.bytes).toBeGreaterThan(0);
  });

  test('fails closed for oversized files and symbolic links', () => {
    const oversized = fixture();
    writeFileSync(
      path.join(oversized.publisher, 'too-large.bin'),
      new Uint8Array(WORKERS_STATIC_ASSET_FILE_LIMIT_BYTES + 1)
    );
    expect(() => assemblePublisherAssets(oversized.app, oversized.publisher)).toThrow(
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
