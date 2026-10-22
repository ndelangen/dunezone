import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, test } from 'vite-plus/test';

const bun = execFileSync('/usr/bin/which', ['bun'], { encoding: 'utf8' }).trim();
function resolveAliases(directory: string) {
  const modulePath = path.join(import.meta.dirname, 'local-dev-publisher.ts');
  return spawnSync(
    bun,
    [
      '--no-env-file',
      '--eval',
      `import { resolveLocalServerAliases } from ${JSON.stringify(modulePath)}; process.stdout.write(JSON.stringify(await resolveLocalServerAliases(${JSON.stringify(directory)})));`,
    ],
    { encoding: 'utf8' }
  );
}

test('copied SSR imports resolve against the frozen checkout with browser/workerd conditions', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'local-ssr-'));
  try {
    writeFileSync(
      path.join(directory, 'server.js'),
      `import 'react'; import 'react-dom/server'; import './relative.js'; import 'node:fs'; import '/absolute.js';`
    );
    const result = resolveAliases(directory);
    expect(result.status, result.stderr).toBe(0);
    const aliases = JSON.parse(result.stdout) as Record<string, string>;
    expect(Object.keys(aliases).sort()).toEqual(['react', 'react-dom/server']);
    for (const resolved of Object.values(aliases)) {
      expect(path.isAbsolute(resolved)).toBe(true);
      expect(resolved).toContain('/node_modules/');
    }
    expect(aliases['react-dom/server']).toMatch(/server\.edge\.js$/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('an unresolved copied SSR dependency refuses the isolated build', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'local-ssr-'));
  try {
    writeFileSync(path.join(directory, 'server.js'), `import 'missing-local-ssr-dependency';`);
    const result = resolveAliases(directory);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Could not resolve');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
