import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, it } from 'vite-plus/test';

import { claimAccount, claimOf, releaseAccount } from './claims';
import type { Stack } from './seat';

const stack = {
  origin: 'http://127.0.0.1:1',
  backendUrl: 'http://127.0.0.1:1',
  accounts: {
    bot: { email: 'alex@example.invalid', password: 'x' },
    bots: ['Alex', 'Sam', 'Robin'].map((name) => ({ name, email: `${name.toLowerCase()}@example.invalid`, password: 'x' })),
  },
} satisfies Stack;

it('gives each harness on the machine its own bot account', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'play-bot-claims-'));
  /* Another harness, a separate process that is still running, holds Alex. */
  mkdirSync(path.join(dir, 'alex'), { recursive: true });
  const other = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' });
  writeFileSync(path.join(dir, 'alex', 'harness.claim.json'), JSON.stringify({ pid: other.pid, page: 'http://127.0.0.1:4747', since: 0 }));

  expect(claimAccount(stack, 'http://127.0.0.1:5000', undefined, dir)).toEqual({ account: 2, id: 'sam' });
  expect(claimAccount(stack, 'http://127.0.0.1:5000', undefined, dir)).toEqual({ account: 3, id: 'robin' });
  expect(() => claimAccount(stack, 'http://127.0.0.1:5000', undefined, dir)).toThrow(/Every bot account is in use/u);
  expect(() => claimAccount(stack, 'http://127.0.0.1:5000', 1, dir)).toThrow(/held by another harness/u);
  expect(claimOf('alex', dir)?.page).toBe('http://127.0.0.1:4747');

  /* A released account is free again; so is one whose harness has ended. */
  releaseAccount('sam', dir);
  expect(claimAccount(stack, 'http://127.0.0.1:5000', undefined, dir).id).toBe('sam');
  other.kill();
  await new Promise((resolve) => other.once('exit', resolve));
  expect(claimOf('alex', dir)).toBeUndefined();
  expect(claimAccount(stack, 'http://127.0.0.1:6000', 1, dir).id).toBe('alex');
});
