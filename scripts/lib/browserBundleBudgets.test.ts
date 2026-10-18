import { readFileSync } from 'node:fs';

import { createBuilder } from 'vite-plus';
import type { Rolldown } from 'vite-plus';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import { browserBundleBudgets, inspectBrowserJavaScript } from './browserBundleBudgets';

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

async function fixtureBuilder(minify?: false) {
  const entry = 'virtual:budget-build';
  return createBuilder({
    configFile: false,
    logLevel: 'silent',
    plugins: [
      browserBundleBudgets(),
      {
        name: 'budget-build-fixture',
        resolveId: (id) => (id === entry ? entry : undefined),
        load: (id) => (id === entry ? `globalThis.budgetFixture = ${JSON.stringify('x'.repeat(500_001))};` : undefined),
      },
    ],
    build: { write: false, sourcemap: true, minify, rolldownOptions: { input: entry } },
  });
}

describe('resolved build budget scope', () => {
  beforeEach(() => vi.stubEnv('NODE_ENV', 'production'));
  afterEach(() => vi.unstubAllEnvs());
  test('enforces the existing limit in a default minified production build', async () => {
    const builder = await fixtureBuilder();
    expect(builder.config.isProduction).toBe(true);
    expect(builder.environments.client.config.build.minify).not.toBe(false);
    await expect(builder.build(builder.environments.client)).rejects.toThrow('exceeds 500000 bytes');
  });

  test('accepts the same oversized fixture in an unminified coverage build', async () => {
    const builder = await fixtureBuilder(false);
    expect(builder.config.isProduction).toBe(true);
    expect(builder.environments.client.config.build.minify).toBe(false);
    await expect(builder.build(builder.environments.client)).resolves.toBeDefined();
  });
});
