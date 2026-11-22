import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'vite-plus/test';

import { importGraph } from './import-graph';

test.each(['?worker&url', '?url&worker'])(
  'tracks a Vite %s worker and its dependencies without requiring a default export',
  async (suffix) => {
    const root = await mkdtemp(join(tmpdir(), 'import-graph-worker-'));
    try {
      await Promise.all([
        writeFile(join(root, 'tsconfig.json'), '{}'),
        writeFile(join(root, 'entry.ts'), `import url from './capture.ts${suffix}'; console.log(url);`),
        writeFile(
          join(root, 'capture.ts'),
          "import { processor } from './dependency'; globalThis.processor = processor;"
        ),
        writeFile(join(root, 'dependency.ts'), "export const processor = 'capture';"),
      ]);
      const graph = await importGraph(root, ['entry.ts'], /^\//, 'out');
      expect([...graph]).toEqual([
        ['capture.ts', ['entry.ts']],
        ['dependency.ts', ['capture.ts']],
        ['entry.ts', []],
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
);
