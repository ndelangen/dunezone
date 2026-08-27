export const RETRYABLE_BROWSER_CHECK_STATUS = 75;

export type BrowserCheckProcess = {
  exited: Promise<number>;
  kill(signal?: number | NodeJS.Signals): void;
};

type BrowserCheckOutcome = { kind: 'exit'; status: number } | { kind: 'timeout' };

type BrowserCheckAttempt =
  | { kind: 'passed' }
  | { kind: 'retry'; reason: string; exhaustedMessage: string }
  | { kind: 'failed'; status: number };

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

async function runBrowserCheckAttempt(
  spawn: () => BrowserCheckProcess,
  timeoutMs: number,
  shutdownTimeoutMs: number
): Promise<BrowserCheckAttempt> {
  const process = spawn();
  const outcome = await waitForProcess(process, timeoutMs);
  if (outcome.kind === 'timeout') {
    await stopProcess(process, shutdownTimeoutMs);
    return {
      kind: 'retry',
      reason: `exceeded ${timeoutMs}ms`,
      exhaustedMessage: `Browser publication check exceeded ${timeoutMs}ms`,
    };
  }
  if (outcome.status === 0) {
    return { kind: 'passed' };
  }
  if (outcome.status === RETRYABLE_BROWSER_CHECK_STATUS) {
    return {
      kind: 'retry',
      reason: 'reported a navigation timeout',
      exhaustedMessage: 'Browser publication check reported a navigation timeout',
    };
  }
  return { kind: 'failed', status: outcome.status };
}

export async function runBrowserCheck({
  spawn,
  timeoutMs,
  shutdownTimeoutMs,
  attempts = 2,
  onRetry = () => undefined,
}: RunBrowserCheckOptions) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await runBrowserCheckAttempt(spawn, timeoutMs, shutdownTimeoutMs);
    if (result.kind === 'passed') {
      return;
    }
    if (result.kind === 'failed') {
      throw new Error(`Browser publication check exited with status ${result.status}.`);
    }
    if (attempt === attempts) {
      throw new Error(`${result.exhaustedMessage} on ${attempts} attempts.`);
    }
    onRetry(`attempt ${attempt} ${result.reason}`);
  }
}
