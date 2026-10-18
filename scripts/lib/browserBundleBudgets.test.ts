import { readFileSync } from 'node:fs';

import type { Rolldown } from 'vite-plus';
import { describe, expect, test } from 'vite-plus/test';

import { inspectBrowserJavaScript } from './browserBundleBudgets';

const chunk = (bytes: number, ids: string[] = ['/src/page.tsx']) =>
  ({
    type: 'chunk',
    fileName: 'public/page.js',
    code: 'x'.repeat(bytes),
    modules: Object.fromEntries(ids.map((id) => [id, {}])),
  }) as Rolldown.OutputChunk;
const three = ['core', 'webgpu', 'tsl'].map((name) => `/project/node_modules/three/build/three.${name}.js`);

describe('browser JavaScript budgets', () => {
  test('fails an unknown oversized chunk rather than granting it a vendor budget', () => {
    expect(() => inspectBrowserJavaScript({ page: chunk(500_001) })).toThrow('500001 bytes exceeds 500000');
  });

  test('permits only the three identified vendor modules within their measured budget', () => {
    expect(inspectBrowserJavaScript({ three: chunk(1_096_885, three) })[0]).toContain('1096885/1120000');
    expect(() => inspectBrowserJavaScript({ three: chunk(1_120_001, three) })).toThrow('1120000');
    expect(() => inspectBrowserJavaScript({ three: chunk(1_096_885, [...three, '/src/page.tsx']) })).toThrow('500000');
  });

  test('identifies the Draco asset by its bytes and rejects a substituted oversized asset', () => {
    const source = readFileSync(new URL('../examples/jsm/libs/draco/draco_decoder.js', import.meta.resolve('three')));
    const asset = { type: 'asset', fileName: 'public/draco_decoder.js', source } as unknown as Rolldown.OutputAsset;
    expect(inspectBrowserJavaScript({ draco: asset })[0]).toContain('740000');
    expect(() => inspectBrowserJavaScript({ draco: { ...asset, source: 'x'.repeat(719_410) } })).toThrow('500000');
  });
});
