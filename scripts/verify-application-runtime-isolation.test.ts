import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, test } from 'vite-plus/test';

const script = path.resolve(import.meta.dirname, 'verify-application-runtime.ts');

function assertRuntimeRefusal(fixtureValue: object | null, expected: string, reachedWrangler = false) {
  const directory = mkdtempSync(path.join(tmpdir(), 'runtime-isolation-'));
  try {
    const fixture = path.join(directory, 'fixture.json');
    const marker = path.join(directory, 'wrangler-reached');
    if (fixtureValue) {
      writeFileSync(fixture, JSON.stringify(fixtureValue));
    }
    const stub = `import { writeFileSync } from 'node:fs';
      function reached() { writeFileSync(${JSON.stringify(marker)}, 'called'); throw new Error('Wrangler reached'); }
      export const getPlatformProxy = reached;
      export const unstable_dev = reached;`;
    const stubUrl = `data:text/javascript,${encodeURIComponent(stub)}`;
    const hook = `import { registerHooks } from 'node:module';
      registerHooks({ resolve(specifier, context, next) {
        return specifier === 'wrangler' ? { url: ${JSON.stringify(stubUrl)}, shortCircuit: true } : next(specifier, context);
      }});`;
    const result = spawnSync(
      process.execPath,
      [`--import=data:text/javascript,${encodeURIComponent(hook)}`, '--experimental-strip-types', script],
      {
        env: { ...process.env, APPLICATION_RUNTIME_FIXTURE: fixtureValue ? fixture : '' },
        encoding: 'utf8',
        timeout: 10_000,
      }
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(expected);
    expect(existsSync(marker)).toBe(reachedWrangler);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('a rehearsal without an explicit fixture refuses before starting the Worker', () => {
  assertRuntimeRefusal(null, 'Runtime rehearsal requires APPLICATION_RUNTIME_FIXTURE');
});

test('an accepted loopback fixture reaches the instrumented artifact store', () => {
  assertRuntimeRefusal(
    { backendUrl: 'http://127.0.0.1:9', siteUrl: 'http://127.0.0.1:9', storageDirectory: '/tmp/runtime-isolation' },
    'Wrangler reached',
    true
  );
});

test.each(['backendUrl', 'siteUrl'])('a cloud %s is refused before opening the artifact store', (field) => {
  assertRuntimeRefusal(
    {
      backendUrl: 'http://127.0.0.1:9',
      siteUrl: 'http://127.0.0.1:9',
      [field]: 'https://exuberant-finch-263.eu-west-1.convex.cloud',
    },
    'Runtime fixtures only accept an isolated loopback backend'
  );
});
