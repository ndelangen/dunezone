import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import {
  PUBLISHER_RENDERER_CONTRACT,
  PUBLISHER_RENDERER_VERSION,
  PUBLISHER_SUPPORTED_RENDERER_VERSIONS,
} from './renderer-contract';
import {
  computeRendererManifestDigest,
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
    { path: 'workers/proof/pdf.ts', bytes: encoder.encode('pdf-inspector-source') },
  ].map((entry) => ({
    ...entry,
    bytes: encoder.encode(overrides[entry.path] ?? new TextDecoder().decode(entry.bytes)),
  }));
}

describe('immutable renderer manifest digest', () => {
  test('keeps the semantic Convex renderer version explicit in the hashed contract', () => {
    expect(PUBLISHER_RENDERER_VERSION).toBe('faction-sheet-v3');
    expect(PUBLISHER_RENDERER_CONTRACT.rendererVersion).toBe(PUBLISHER_RENDERER_VERSION);
    expect(PUBLISHER_RENDERER_CONTRACT.supportedRendererVersions).toEqual(['faction-sheet-v3']);
    expect(PUBLISHER_SUPPORTED_RENDERER_VERSIONS).toEqual(['faction-sheet-v3']);
  });

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
    'workers/proof/pdf.ts',
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

  test('changes when the semantic renderer version changes', () => {
    expect(
      computeRendererManifestDigest(entries(), {
        ...PUBLISHER_RENDERER_CONTRACT,
        rendererVersion: 'faction-sheet-v2',
      })
    ).not.toBe(computeRendererManifestDigest(entries()));
  });

  test('changes when the exact supported renderer set changes', () => {
    expect(
      computeRendererManifestDigest(entries(), {
        ...PUBLISHER_RENDERER_CONTRACT,
        supportedRendererVersions: ['faction-sheet-v2'],
      })
    ).not.toBe(computeRendererManifestDigest(entries()));
  });

  test.each(
    RENDERER_RUNTIME_CLOSURE_PATHS
  )('changes when renderer runtime closure input %s changes', (changedPath) => {
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
  });

  test('rejects ambiguous duplicate paths', () => {
    const duplicate = entries();
    duplicate.push(duplicate[0] as RendererManifestEntry);
    expect(() => computeRendererManifestDigest(duplicate)).toThrow(/unique/);
  });
});
