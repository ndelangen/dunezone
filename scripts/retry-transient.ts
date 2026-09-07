/*
 * A fail-closed network gate refuses on a transient transport error exactly as it refuses on the
 * finding it exists for, and someone then re-runs the job by hand (#1053).
 * This helper retries an attempt a stated number of times while the failure is a TransientError,
 * and refuses with the subject and the attempt count named, so a log distinguishes "unreachable
 * after N attempts" from "advisory found" or "drift found".
 * Every other error is rethrown unchanged by the attempt that raised it, so a finding never retries.
 */

export class TransientError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'TransientError';
  }
}

export type RetryTransientOptions = {
  /** What the attempts reach, named in every retry line and in the refusal. */
  subject: string;
  /** One pause per retry, so the attempt count is the length plus one. */
  delaysMs: readonly number[];
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
};

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logToStderr(line: string) {
  console.error(line);
}

export async function retryTransient<T>(attempt: () => Promise<T> | T, options: RetryTransientOptions): Promise<T> {
  const attempts = options.delaysMs.length + 1;
  const sleep = options.sleep ?? pause;
  const log = options.log ?? logToStderr;
  for (let index = 0; ; index += 1) {
    try {
      return await attempt();
    } catch (error) {
      if (!(error instanceof TransientError)) {
        throw error;
      }
      const delayMs = options.delaysMs[index];
      if (delayMs === undefined) {
        throw new Error(`${options.subject} unreachable after ${attempts} attempts; last: ${error.message}`, {
          cause: error,
        });
      }
      log(
        `${options.subject}: attempt ${index + 1} of ${attempts} failed (${error.message}); retrying in ${delayMs / 1000} s`
      );
      await sleep(delayMs);
    }
  }
}
