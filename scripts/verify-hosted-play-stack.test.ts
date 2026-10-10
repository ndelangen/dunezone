import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, test } from 'vitest';

test('a backend startup failure retains diagnostics after removing its temporary runtime', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'dunezone-backend-evidence-'));
  const root = path.resolve(import.meta.dirname, '..');
  const binary = path.join(directory, 'failed-backend');
  try {
    cpSync(path.join(root, 'scripts'), path.join(directory, 'scripts'), { recursive: true });
    symlinkSync(path.join(root, 'src'), path.join(directory, 'src'), 'dir');
    symlinkSync(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), 'dir');
    writeFileSync(
      binary,
      `#!/bin/sh
if [ "$1" = "keygen" ]; then
  printf 'synthetic-admin-key\\n'
  exit 0
fi
for argument do
  database="$argument"
done
printf 'backend stdout diagnostic\\n'
printf 'backend database: %s\\n' "$database"
printf 'backend stderr diagnostic\\n' >&2
exit 23
`,
      { mode: 0o700 }
    );
    const result = spawnSync(
      'bun',
      ['--no-env-file', path.join(directory, 'scripts/verify-hosted-play-stack.ts'), '--backend-binary', binary],
      { cwd: directory, encoding: 'utf8', timeout: 10_000 }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Local service exited before');
    const log = readFileSync(path.join(directory, 'test-results/hosted-play/backend.log'), 'utf8');
    expect(log).toContain('backend stdout diagnostic');
    expect(log).toContain('backend stderr diagnostic');
    const databasePrefix = 'backend database: ';
    const database = log
      .split('\n')
      .find((line) => line.startsWith(databasePrefix))!
      .slice(databasePrefix.length);
    expect(path.basename(database)).toBe('backend.sqlite3');
    expect(existsSync(path.dirname(database))).toBe(false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
