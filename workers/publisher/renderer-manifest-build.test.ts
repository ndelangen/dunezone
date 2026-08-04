import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import { PUBLISHER_RENDERER_CONTRACT } from './renderer-contract';
import {
  computeRendererManifestDigest,
  isRendererManifestAsset,
  RENDERER_RUNTIME_CLOSURE_PATHS,
  type RendererManifestEntry,
} from './renderer-manifest-build';

const encoder = new TextEncoder();

function entries(overrides: Partial<Record<string, string>> = {}): RendererManifestEntry[] {
  return [
    { path: 'workers/publisher/dist/publisher-capture.html', bytes: encoder.encode('<html/>') },
    { path: 'workers/publisher/dist/font/font.woff2', bytes: encoder.encode('font-bytes') },
    { path: 'workers/publisher/dist/generated/image.png', bytes: encoder.encode('image-bytes') },
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

describe('current Renderer manifest digest', () => {
  test('is deterministic independent of input order', () => {
    const forward = entries();
    expect(computeRendererManifestDigest(forward)).toBe(
      computeRendererManifestDigest([...forward].reverse())
    );
  });

  test.each([
    'workers/publisher/dist/publisher-capture.html',
    'workers/publisher/dist/font/font.woff2',
    'workers/publisher/dist/generated/image.png',
    'workers/publisher/dist/vector/icon.svg',
    'workers/publisher/browser.ts',
    'workers/publisher/pdf-inspection.ts',
  ])('changes when deployed closure entry %s changes', (changedPath) => {
    expect(computeRendererManifestDigest(entries({ [changedPath]: 'changed' }))).not.toBe(
      computeRendererManifestDigest(entries())
    );
  });

  test('changes when an explicit PDF contract value changes', () => {
    expect(
      computeRendererManifestDigest(entries(), {
        ...PUBLISHER_RENDERER_CONTRACT,
        pdf: { ...PUBLISHER_RENDERER_CONTRACT.pdf, pageWidthMm: 151 },
      })
    ).not.toBe(computeRendererManifestDigest(entries()));
  });

  test.each(RENDERER_RUNTIME_CLOSURE_PATHS)(
    'changes when renderer runtime closure input %s changes',
    (changedPath) => {
      const runtimeEntries = RENDERER_RUNTIME_CLOSURE_PATHS.map((relativePath) => ({
        path: relativePath,
        bytes: readFileSync(path.resolve(process.cwd(), relativePath)),
      }));
      const changedEntries = runtimeEntries.map((entry) =>
        entry.path === changedPath
          ? { ...entry, bytes: Buffer.concat([entry.bytes, Buffer.from('\n// changed')]) }
          : entry
      );
      expect(computeRendererManifestDigest(changedEntries)).not.toBe(
        computeRendererManifestDigest(runtimeEntries)
      );
    }
  );

  test('rejects ambiguous duplicate paths', () => {
    const duplicate = entries();
    duplicate.push(duplicate[0] as RendererManifestEntry);
    expect(() => computeRendererManifestDigest(duplicate)).toThrow(/unique/);
  });

  test.each([
    'publisher-capture.html',
    'publisher-capture/publisher-capture-hash.js',
    'font/font.woff2',
    'image/texture/021.jpg',
    'vector/icon/karama.svg',
    'generated/utils/background/special.jpg',
    'dice.svg',
  ])('includes Renderer release asset %s', (assetPath) => {
    expect(isRendererManifestAsset(assetPath)).toBe(true);
  });

  test.each([
    '_shell.html',
    'index.html',
    '__storybook/index.html',
    '__storybook/assets/Background.stories-hash.js',
    'public/FactionEditor-hash.js',
  ])('excludes application-only release asset %s', (assetPath) => {
    expect(isRendererManifestAsset(assetPath)).toBe(false);
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
        entry.path.startsWith('public/')
          ? { ...entry, bytes: encoder.encode('different platform chunk') }
          : entry
      )
      .filter((entry) => isRendererManifestAsset(entry.path));

    expect(computeRendererManifestDigest(changedApplicationEntries)).toBe(
      computeRendererManifestDigest(rendererEntries)
    );
  });
});
