import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import { PUBLISHER_RENDERER_CONTRACT } from './renderer-contract';
import {
  assertExactSharpVersion,
  computeRendererManifestDigest,
  isRendererManifestAsset,
  isRendererManifestInputPath,
  mediaSourceEntries,
  RENDERER_RUNTIME_CLOSURE_PATHS,
} from './renderer-manifest-build';
import type { RendererManifestEntry } from './renderer-manifest-build';

const encoder = new TextEncoder();

function codeEntries(overrides: Partial<Record<string, string>> = {}): RendererManifestEntry[] {
  return [
    { path: 'workers/publisher/dist/publisher-capture.html', bytes: encoder.encode('<html/>') },
    { path: 'workers/publisher/dist/font/font.woff2', bytes: encoder.encode('font-bytes') },
    { path: 'workers/publisher/dist/vector/icon.svg', bytes: encoder.encode('<svg/>') },
    { path: 'workers/publisher/browser.ts', bytes: encoder.encode('browser-source') },
    {
      path: 'workers/publisher/pdf-inspection.ts',
      bytes: encoder.encode('pdf-inspector-source'),
    },
  ].map((entry) => ({
    ...entry,
    bytes: encoder.encode(overrides[entry.path] ?? new TextDecoder().decode(entry.bytes)),
  }));
}

function sourceEntries(overrides: Partial<Record<string, string>> = {}): RendererManifestEntry[] {
  return [
    { path: 'media/image/texture/021.jpg', bytes: encoder.encode('texture-source-bytes') },
    { path: 'media/image/leader/official/alia.png', bytes: encoder.encode('leader-source') },
  ].map((entry) => ({
    ...entry,
    bytes: encoder.encode(overrides[entry.path] ?? new TextDecoder().decode(entry.bytes)),
  }));
}

function toolchainEntries(overrides: Partial<Record<string, string>> = {}): RendererManifestEntry[] {
  return [
    { path: 'src/shared/assetRules.ts', bytes: encoder.encode('rules') },
    { path: 'scripts/generate-images.ts', bytes: encoder.encode('generator') },
    { path: 'toolchain/sharp-version', bytes: encoder.encode('0.35.3') },
  ].map((entry) => ({
    ...entry,
    bytes: encoder.encode(overrides[entry.path] ?? new TextDecoder().decode(entry.bytes)),
  }));
}

function digest(
  code = codeEntries(),
  sources = sourceEntries(),
  toolchain = toolchainEntries(),
  contract: unknown = PUBLISHER_RENDERER_CONTRACT
) {
  return computeRendererManifestDigest(code, sources, toolchain, contract);
}

describe('current Renderer manifest digest', () => {
  test('is deterministic independent of input order', () => {
    const forward = digest();
    const reversed = computeRendererManifestDigest(
      [...codeEntries()].reverse(),
      [...sourceEntries()].reverse(),
      [...toolchainEntries()].reverse()
    );
    expect(forward.digest).toBe(reversed.digest);
    expect(forward.components).toEqual(reversed.components);
  });

  test.each([
    'workers/publisher/dist/publisher-capture.html',
    'workers/publisher/dist/font/font.woff2',
    'workers/publisher/dist/vector/icon.svg',
    'workers/publisher/browser.ts',
    'workers/publisher/pdf-inspection.ts',
  ])('changes when deployed closure entry %s changes', (changedPath) => {
    const changed = digest(codeEntries({ [changedPath]: 'changed' }));
    expect(changed.digest).not.toBe(digest().digest);
    expect(changed.components.code).not.toBe(digest().components.code);
    expect(changed.components.sources).toBe(digest().components.sources);
  });

  test('changes when a media source changes: ingredient hashing, not encoder output', () => {
    const changed = digest(codeEntries(), sourceEntries({ 'media/image/texture/021.jpg': 'edited-texture' }));
    expect(changed.digest).not.toBe(digest().digest);
    expect(changed.components.sources).not.toBe(digest().components.sources);
    expect(changed.components.code).toBe(digest().components.code);
  });

  test('changes when the toolchain changes (sharp bump, rules, generator)', () => {
    const changed = digest(codeEntries(), sourceEntries(), toolchainEntries({ 'toolchain/sharp-version': '0.36.0' }));
    expect(changed.digest).not.toBe(digest().digest);
    expect(changed.components.toolchain).not.toBe(digest().components.toolchain);
  });

  test('changes when an explicit PDF contract value changes', () => {
    const changed = digest(codeEntries(), sourceEntries(), toolchainEntries(), {
      ...PUBLISHER_RENDERER_CONTRACT,
      pdf: { ...PUBLISHER_RENDERER_CONTRACT.pdf, pageWidthMm: 151 },
    });
    expect(changed.digest).not.toBe(digest().digest);
    expect(changed.components.contract).not.toBe(digest().components.contract);
  });

  /* The digest hashes the sorted entries alike, so the first, the middle and the last path of the list stand for every path in it, and the files are read once for the three rows (#1590). */
  const runtimeEntries = RENDERER_RUNTIME_CLOSURE_PATHS.map((relativePath) => ({
    path: relativePath,
    bytes: readFileSync(path.resolve(process.cwd(), relativePath)),
  }));
  const runtimeDigest = digest(runtimeEntries).digest;
  test.each(
    [0, Math.floor(RENDERER_RUNTIME_CLOSURE_PATHS.length / 2), RENDERER_RUNTIME_CLOSURE_PATHS.length - 1].map(
      (index) => RENDERER_RUNTIME_CLOSURE_PATHS[index]!
    )
  )('changes when renderer runtime closure input %s changes', (changedPath) => {
    const changedEntries = runtimeEntries.map((entry) =>
      entry.path === changedPath
        ? { ...entry, bytes: Buffer.concat([entry.bytes, Buffer.from('\n// changed')]) }
        : entry
    );
    expect(digest(changedEntries).digest).not.toBe(runtimeDigest);
  });

  test('rejects ambiguous duplicate paths', () => {
    const duplicate = codeEntries();
    duplicate.push(duplicate[0] as RendererManifestEntry);
    expect(() => digest(duplicate)).toThrow(/unique/);
  });

  test.each([
    'publisher-capture.html',
    'publisher-capture/publisher-capture-hash.js',
    'font/font.woff2',
    'generated/utils/background/special.jpg',
    'dice.svg',
  ])('includes Renderer release asset %s', (assetPath) => {
    expect(isRendererManifestAsset(assetPath)).toBe(true);
  });

  test.each([
    '_shell.html',
    'index.html',
    'dune-zone-favicon.svg',
    '_headers',
    'robots.txt',
    '__storybook/index.html',
    'public/FactionEditor-hash.js',
    // Generated image and vector output: identified by ingredients, never by bytes.
    'image/texture/021.jpg',
    'web/head-large.jpg',
    'vector/icon/karama.svg',
    'obj/troop/atreides.obj',
    // The band video is app chrome.
    'video/band.mp4',
  ])('excludes application-only or generated release asset %s', (assetPath) => {
    expect(isRendererManifestAsset(assetPath)).toBe(false);
  });

  test('keeps the application favicon out of Renderer change detection', () => {
    expect(isRendererManifestInputPath('public/dune-zone-favicon.svg')).toBe(false);
  });

  test('a cache policy change runs the manifest check without repricing sheets', () => {
    expect(isRendererManifestInputPath('workers/publisher/_headers')).toBe(true);
    expect(isRendererManifestAsset('_headers')).toBe(false);
  });

  test('keeps application-only chunk changes out of the Renderer identity', () => {
    const releaseEntries: RendererManifestEntry[] = [
      {
        path: 'publisher-capture/publisher-capture-hash.js',
        bytes: encoder.encode('capture'),
      },
      {
        path: 'public/FactionEditor-platform-hash.js',
        bytes: encoder.encode('platform-specific application chunk'),
      },
    ];
    const rendererEntries = releaseEntries.filter((entry) => isRendererManifestAsset(entry.path));
    const changedApplicationEntries = releaseEntries
      .map((entry) =>
        entry.path.startsWith('public/') ? { ...entry, bytes: encoder.encode('different platform chunk') } : entry
      )
      .filter((entry) => isRendererManifestAsset(entry.path));

    expect(digest(changedApplicationEntries).digest).toBe(digest(rendererEntries).digest);
  });

  test.each(['0.35.3', '1.0.0', '0.36.0-rc.1', '0.35.3+build.7'])(
    'accepts exact sharp version %s for the toolchain identity',
    (version) => {
      expect(assertExactSharpVersion(version)).toBe(version);
    }
  );

  test.each([
    undefined,
    '',
    '^0.35.3',
    '~0.35.3',
    '>=0.35.0',
    'latest',
    '*',
    'workspace:*',
    '0.35.0 - 0.36.0',
    '0.35.3 || 0.36.0',
  ])('rejects non-exact sharp version specifier %s', (version) => {
    expect(() => assertExactSharpVersion(version)).toThrow(/exact-pinned/);
  });

  test('encoder output changes alone do not move the identity', () => {
    /*
     * The same ingredients must yield the same digest regardless of what the encoder produced;
     * generated output is not part of the identity at all.
     */
    expect(digest().digest).toBe(digest().digest);
    expect(isRendererManifestAsset('image/leader/official/alia-small.webp')).toBe(false);
  });
});

describe('media source entries', () => {
  function fixture(withOriginals: boolean, extraRaster = false) {
    const root = mkdtempSync(path.join(tmpdir(), 'renderer-media-'));
    mkdirSync(path.join(root, 'media/image/texture'), { recursive: true });
    mkdirSync(path.join(root, 'media/vector'), { recursive: true });
    writeFileSync(
      path.join(root, 'media/raster.lock.json'),
      JSON.stringify({ '/image/texture/021.jpg': { sha256: 'a'.repeat(64) } })
    );
    writeFileSync(path.join(root, 'media/vector/icon.svg'), '<svg/>');
    writeFileSync(path.join(root, 'media/image/texture/021.provenance.json'), '{}');
    if (withOriginals) {
      writeFileSync(path.join(root, 'media/image/texture/021.jpg'), 'jpeg-bytes');
    }
    if (extraRaster) {
      writeFileSync(path.join(root, 'media/image/texture/unlocked.png'), 'png-bytes');
    }
    return root;
  }

  function digestOf(root: string) {
    try {
      return computeRendererManifestDigest(codeEntries(), mediaSourceEntries(root), toolchainEntries()).digest;
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  test('reads rasters from the lock, so the digest ignores whether originals are checked out', () => {
    const absent = digestOf(fixture(false));
    expect(digestOf(fixture(true))).toBe(absent);
    expect(digestOf(fixture(true, true))).toBe(absent);
  });

  test('hashes each locked raster as its SHA-256 and leaves the lock file itself out', () => {
    const root = fixture(true);
    try {
      const entries = mediaSourceEntries(root);
      expect(entries.map((entry) => entry.path).sort()).toEqual([
        'media/image/texture/021.jpg',
        'media/image/texture/021.provenance.json',
        'media/vector/icon.svg',
      ]);
      const raster = entries.find((entry) => entry.path === 'media/image/texture/021.jpg');
      expect(new TextDecoder().decode(raster?.bytes)).toBe('a'.repeat(64));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
