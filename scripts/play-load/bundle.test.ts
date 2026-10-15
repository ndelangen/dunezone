import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import { expect, test } from 'vitest';

import { bundleRunner } from './bundle.ts';

/**
 * The coordinator runs under Node, so only a Node import of the bundle proves it still loads.
 * Without arguments the runner stops at its own argument assertion, which comes after every import.
 */
test('the bundled load runner loads under Node and stops at its argument check', { timeout: 30_000 }, async () => {
  expect(process.versions.bun, 'the guard must spawn Node').toBeUndefined();
  const bundle = await bundleRunner();
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `try { await import(${JSON.stringify(bundle)}); console.log('resolved'); } catch (error) { console.log(error.code ?? error.message, (error.stack ?? '').split('\\n').find((line) => line.includes(' at ')) ?? ''); }`,
    ],
    { cwd: path.resolve(import.meta.dirname, '../..'), timeout: 20_000 }
  );
  expect(stdout.trim()).toMatch(/^ERR_ASSERTION .*run\.bundle\.mjs:\d+/);
});
