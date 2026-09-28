import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';

/* The backend counts every request, so a refusal that comes after a network call fails the count. */
let requests = 0;
const backend = createServer((_, response) => {
  requests += 1;
  response.writeHead(500).end();
});
let port: number;
let directory: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => backend.listen(0, '127.0.0.1', resolve));
  const address = backend.address();
  if (!address || typeof address === 'string') {
    throw new Error('The counting backend did not bind a port.');
  }
  port = address.port;
  directory = mkdtempSync(path.join(tmpdir(), 'dunezone-play-protocol-guard-'));
});
beforeEach(() => {
  requests = 0;
});
afterAll(async () => {
  await new Promise((resolve) => backend.close(resolve));
  rmSync(directory, { recursive: true, force: true });
});

/*
 * The launcher runs the protocol verifier unbundled under Node, so the test does too.
 * PORT stands for the counting backend's port.
 */
test.each([
  ['--origin', 'a default port', 'http://127.0.0.1:PORT', 'http://127.0.0.1/'],
  ['--origin', 'a fragment', 'http://127.0.0.1:PORT', 'http://127.0.0.1:PORT/#fragment'],
  ['--origin', 'a password', 'http://127.0.0.1:PORT', 'http://:password@127.0.0.1:PORT/'],
  /* A password rather than a fragment, because parseEnv drops an unquoted # and the rest of the line. */
  ['CONVEX_SELF_HOSTED_URL', 'a password', 'http://:password@127.0.0.1:PORT/', 'http://127.0.0.1:PORT'],
])('the protocol verifier refuses %s with %s before any network call', async (label, _, selfHosted, origin) => {
  const envFile = path.join(directory, 'local.env');
  writeFileSync(
    envFile,
    `CONVEX_SELF_HOSTED_URL=${selfHosted.replace('PORT', String(port))}\nCONVEX_SELF_HOSTED_ADMIN_KEY=isolated-test-key\n`
  );
  const verifier = spawn(
    process.execPath,
    [
      path.resolve('scripts/verify-hosted-play.mjs'),
      '--env-file',
      envFile,
      '--origin',
      origin.replace('PORT', String(port)),
    ],
    { timeout: 10_000 }
  );
  let stderr = '';
  verifier.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  /* 'close' rather than 'exit', because 'close' waits for stderr to drain. */
  const [code] = await once(verifier, 'close');
  expect(code).toBe(1);
  expect(stderr).toContain(`${label} must be an explicit http://127.0.0.1:PORT origin.`);
  expect(requests).toBe(0);
});
