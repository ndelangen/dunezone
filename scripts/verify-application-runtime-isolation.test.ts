import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, test } from 'vite-plus/test';

const script = path.resolve(import.meta.dirname, 'verify-application-runtime.ts');

test('a rehearsal without an explicit fixture refuses before starting the Worker', () => {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', script], {
    env: { ...process.env, APPLICATION_RUNTIME_FIXTURE: '' },
    encoding: 'utf8',
    timeout: 10_000,
  });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('Runtime rehearsal requires APPLICATION_RUNTIME_FIXTURE');
});

test.each(['backendUrl', 'siteUrl'])('a cloud %s is refused before opening the artifact store', (field) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'runtime-isolation-'));
  try {
    const fixture = path.join(directory, 'fixture.json');
    writeFileSync(
      fixture,
      JSON.stringify({
        backendUrl: 'http://127.0.0.1:9',
        siteUrl: 'http://127.0.0.1:9',
        [field]: 'https://exuberant-finch-263.eu-west-1.convex.cloud',
      })
    );
    const result = spawnSync(process.execPath, ['--experimental-strip-types', script], {
      env: { ...process.env, APPLICATION_RUNTIME_FIXTURE: fixture },
      encoding: 'utf8',
      timeout: 10_000,
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Runtime fixtures only accept an isolated loopback backend');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
