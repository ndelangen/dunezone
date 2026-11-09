import type { ChildProcess } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export type VerificationResult = {
  status: 'passed' | 'failed' | 'timed_out';
  timeoutMs: number;
  elapsedMs: number;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
};

/** The process deadline owns the result, even when the child writes a clean report before it stops. */
export async function verifyProcess(
  child: ChildProcess,
  logPath: string,
  timeoutMs: number
): Promise<VerificationResult> {
  const started = performance.now();
  let timedOut = false;
  await new Promise<void>((resolve) => {
    const finished = () => {
      clearTimeout(timeout);
      child.removeListener('exit', finished);
      child.removeListener('error', finished);
      resolve();
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);
    child.once('exit', finished);
    child.once('error', finished);
  });
  const result: VerificationResult = {
    status: timedOut ? 'timed_out' : child.exitCode === 0 ? 'passed' : 'failed',
    timeoutMs,
    elapsedMs: Math.round(performance.now() - started),
    exitCode: child.exitCode,
    signal: child.signalCode,
  };
  if (result.status !== 'passed') {
    const reportLine = readFileSync(logPath, 'utf8')
      .split('\n')
      .findLast((line) => line.startsWith('REPORT '));
    if (reportLine) {
      const reportPath = path.resolve(reportLine.slice('REPORT '.length));
      const reports = path.resolve(path.dirname(logPath), 'browser') + path.sep;
      if (!reportPath.startsWith(reports) || path.basename(reportPath) !== 'report.json') {
        throw new Error('The verifier reported a file outside its browser evidence.');
      }
      const report = JSON.parse(readFileSync(reportPath, 'utf8'));
      if (result.status === 'timed_out' || !report.failure) {
        const previousFailure = report.failure;
        report.failure = {
          ...previousFailure,
          name: previousFailure?.name ?? (result.status === 'timed_out' ? 'VerifierTimeout' : 'VerifierExit'),
          message:
            result.status === 'timed_out'
              ? `The verifier did not exit within its ${timeoutMs / 1000} s process limit.${previousFailure ? ` Browser failure: ${previousFailure.message}` : ''}`
              : `The verifier exited with code ${result.exitCode ?? 'none'}, signal ${result.signal ?? 'none'}.`,
          afterCheck: previousFailure?.afterCheck ?? report.checks?.at(-1)?.name ?? 'Startup',
        };
        writeFileSync(reportPath, JSON.stringify(report, null, 2));
      }
    }
  }
  return result;
}
