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
    recordProcessFailure(result, logPath);
  }
  return result;
}

function currentBrowserReport(logPath: string): string | undefined {
  const reportLine = readFileSync(logPath, 'utf8')
    .split('\n')
    .findLast((line) => line.startsWith('REPORT '));
  if (!reportLine) {
    return undefined;
  }
  const reportPath = path.resolve(reportLine.slice('REPORT '.length));
  const reports = path.resolve(path.dirname(logPath), 'browser') + path.sep;
  if (!reportPath.startsWith(reports) || path.basename(reportPath) !== 'report.json') {
    throw new Error('The verifier reported a file outside its browser evidence.');
  }
  return reportPath;
}

function processFailureMessage(result: VerificationResult): string {
  return result.status === 'timed_out'
    ? `The verifier did not exit within its ${result.timeoutMs / 1000} s process limit.`
    : `The verifier exited with code ${result.exitCode ?? 'none'}, signal ${result.signal ?? 'none'}.`;
}

function recordProcessFailure(result: VerificationResult, logPath: string) {
  const reportPath = currentBrowserReport(logPath);
  if (!reportPath) {
    return;
  }
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const previousFailure = report.failure;
  if (previousFailure && result.status !== 'timed_out') {
    return;
  }
  const message = processFailureMessage(result);
  report.failure = previousFailure
    ? { ...previousFailure, message: `${message} Browser failure: ${previousFailure.message}` }
    : {
        name: result.status === 'timed_out' ? 'VerifierTimeout' : 'VerifierExit',
        message,
        afterCheck: report.checks?.at(-1)?.name ?? 'Startup',
      };
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
}
