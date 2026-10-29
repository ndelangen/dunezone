import { spawnSync } from 'node:child_process';
import { isAbsolute } from 'node:path';

const executable = process.env.BUN_EXECUTABLE;
if (!executable || !isAbsolute(executable)) {
  throw new Error('The setup action must supply an absolute Bun executable path.');
}

/* A stalled install consumed 838 s of the unit job's 15-minute limit in #2593. */
const timeout = Number(process.env.BUN_CI_INSTALL_TIMEOUT_MS ?? 120_000);
if (!Number.isSafeInteger(timeout) || timeout <= 0) {
  throw new Error('The dependency install timeout must be a positive integer in milliseconds.');
}
for (let attempt = 1; attempt <= 3; attempt++) {
  console.log(`Frozen dependency install, attempt ${attempt} of 3, limit ${timeout} ms.`);
  const result = spawnSync(executable, ['install', '--frozen-lockfile', '--ignore-scripts'], {
    stdio: 'inherit',
    timeout,
    killSignal: 'SIGKILL',
  });
  if (!result.error || !('code' in result.error) || result.error.code !== 'ETIMEDOUT') {
    if (result.error) {
      console.error(result.error.message);
    }
    process.exit(result.status ?? 1);
  }
  if (attempt === 3) {
    process.exit(124);
  }
  console.log('Dependency install timed out; retrying with the packages already cached.');
}
