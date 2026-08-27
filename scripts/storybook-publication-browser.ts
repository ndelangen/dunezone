export const RETRYABLE_BROWSER_CHECK_STATUS = 75;

export type BrowserCheckProcess = {
  exited: Promise<number>;
  kill(signal?: number | NodeJS.Signals): void;
};

type BrowserCheckOutcome = { kind: 'exit'; status: number } | { kind: 'timeout' };

type RunBrowserCheckOptions = {
  spawn: () => BrowserCheckProcess;
  timeoutMs: number;
  shutdownTimeoutMs: number;
  attempts?: number;
  onRetry?: (reason: string) => void;
};

function waitForProcess(process: BrowserCheckProcess, timeoutMs: number): Promise<BrowserCheckOutcome> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve({ kind: 'timeout' }), timeoutMs);
    process.exited.then((status) => {
      clearTimeout(timeout);
      resolve({ kind: 'exit', status });
    });
  });
}

async function stopProcess(process: BrowserCheckProcess, shutdownTimeoutMs: number) {
  process.kill();
  if ((await waitForProcess(process, shutdownTimeoutMs)).kind === 'exit') {
    return;
  }

  process.kill('SIGKILL');
  if ((await waitForProcess(process, shutdownTimeoutMs)).kind === 'timeout') {
    throw new Error('The Storybook browser process did not stop after SIGKILL.');
  }
}

export async function runBrowserCheck({
  spawn,
  timeoutMs,
  shutdownTimeoutMs,
  attempts = 2,
  onRetry = () => undefined,
}: RunBrowserCheckOptions) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const process = spawn();
    const outcome = await waitForProcess(process, timeoutMs);
    if (outcome.kind === 'timeout') {
      await stopProcess(process, shutdownTimeoutMs);
      if (attempt < attempts) {
        onRetry(`attempt ${attempt} exceeded ${timeoutMs}ms`);
        continue;
      }
      throw new Error(`Browser publication check exceeded ${timeoutMs}ms on ${attempts} attempts.`);
    }
    if (outcome.status === 0) {
      return;
    }
    if (outcome.status === RETRYABLE_BROWSER_CHECK_STATUS && attempt < attempts) {
      onRetry(`attempt ${attempt} reported a navigation timeout`);
      continue;
    }
    throw new Error(`Browser publication check exited with status ${outcome.status}.`);
  }
}
