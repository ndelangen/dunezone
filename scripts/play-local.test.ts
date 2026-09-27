import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { expect, test } from 'vitest';

/* scripts/lib/isolated-stack.test.ts covers the rule; this case covers the process boundary. */
test('the isolated runner refuses a remote game backend before building or starting Workers', () => {
  const result = spawnSync(
    'bun',
    [
      path.resolve('scripts/play-local.ts'),
      '--convex-url',
      'http://127.0.0.1:56823',
      '--convex-site-url',
      'http://127.0.0.1:56824',
      '--game-convex-url',
      'https://production.convex.cloud',
      '--skip-build',
    ],
    { encoding: 'utf8', timeout: 10_000 }
  );
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('--game-convex-url must be an explicit http://127.0.0.1:PORT origin.');
  expect(result.stdout).not.toContain('Isolated Play:');
});
