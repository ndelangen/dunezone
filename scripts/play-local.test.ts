import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { expect, test } from 'vitest';

test.each([
  ['--convex-url', 'https://production.convex.cloud'],
  ['--convex-site-url', 'https://production.convex.site'],
  ['--game-convex-url', 'http://other-host:3210'],
  ['--convex-url', 'http://127.0.0.1:3210/path'],
  ['--convex-url', 'http://127.0.0.1:3210/?query'],
  ['--convex-url', 'http://127.0.0.1:3210/#fragment'],
  ['--convex-url', 'http://user:password@127.0.0.1:3210/'],
  ['--convex-url', 'http://127.0.0.1/'],
])('the isolated runner rejects a non-loopback %s before building or starting Workers', (option, value) => {
  const args = new Map([
    ['--convex-url', 'http://127.0.0.1:56823'],
    ['--convex-site-url', 'http://127.0.0.1:56824'],
    ['--game-convex-url', 'http://127.0.0.1:56823'],
  ]);
  args.set(option, value);
  const result = spawnSync('bun', [path.resolve('scripts/play-local.ts'), ...[...args].flat(), '--skip-build'], {
    encoding: 'utf8',
    timeout: 10_000,
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(`${option} must be an explicit http://127.0.0.1:PORT origin.`);
  expect(result.stdout).not.toContain('Isolated Play:');
});
