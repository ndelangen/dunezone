import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { expect, test } from 'vite-plus/test';

const run = promisify(execFile);
const recorder = fileURLToPath(new URL('./workerd-exit-record.ts', import.meta.url));

test.each([false, true])('records a workerd exit with requested termination %s', async (terminate) => {
  const directory = await mkdtemp(join(tmpdir(), 'workerd-exit-'));
  const executable = join(directory, 'workerd');
  try {
    await writeFile(
      executable,
      terminate
        ? `#!${process.execPath}\nsetInterval(() => {}, 1000);\n`
        : '#!/bin/sh\nprintf "fixture error\\n" >&2\nexit 7\n',
      { mode: 0o700 }
    );
    const script = `
      import { spawn } from 'node:child_process';
      const child = spawn(process.argv[1], { stdio: ['ignore', 'ignore', 'pipe'] });
      console.log(Boolean(child.stderr));
      ${terminate ? "setTimeout(() => child.kill('SIGTERM'), 20);" : ''}
      await new Promise(resolve => child.once('exit', resolve));
    `;
    const { stdout, stderr } = await run(process.execPath, [
      '--import',
      recorder,
      '--input-type=module',
      '--eval',
      script,
      executable,
    ]);
    expect(stdout.trim()).toBe('true');
    expect(stderr).toContain('started; its exit is recorded here.');
    if (terminate) {
      expect(stderr).toContain('exited with signal SIGTERM after Wrangler sent SIGTERM');
    } else {
      expect(stderr).toContain('exited with code 7 without Wrangler asking it to stop');
      expect(stderr).toContain('| fixture error');
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
