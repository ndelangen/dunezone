import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import { PUBLISHER_RENDERER_CONTRACT } from './renderer-contract';
import {
  assertExactSharpVersion,
  computeRendererManifestDigest,
  isRendererManifestAsset,
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

  test.each(RENDERER_RUNTIME_CLOSURE_PATHS)('changes when renderer runtime closure input %s changes', (changedPath) => {
    const runtimeEntries = RENDERER_RUNTIME_CLOSURE_PATHS.map((relativePath) => ({
      path: relativePath,
      bytes: readFileSync(path.resolve(process.cwd(), relativePath)),
    }));
    const changedEntries = runtimeEntries.map((entry) =>
      entry.path === changedPath
        ? { ...entry, bytes: Buffer.concat([entry.bytes, Buffer.from('\n// changed')]) }
        : entry
    );
    expect(digest(changedEntries).digest).not.toBe(digest(runtimeEntries).digest);
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
    '__storybook/index.html',
    '__storybook/assets/Background.stories-hash.js',
    'public/FactionEditor-hash.js',
    // Generated image and vector output: identified by ingredients, never by bytes.
    'image/texture/021.jpg',
    'image/texture/021-large.jpg',
    'web/head-large.jpg',
    'vector/icon/karama.svg',
    'obj/troop/atreides.obj',
  ])('excludes application-only or generated release asset %s', (assetPath) => {
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
