/**
 * Records how the local Worker's workerd process ends, so a Worker that stops mid-run says why (#1343).
 * `play-local.ts` loads this into Wrangler's Node processes with `--import`.
 * Miniflare starts workerd through `child_process.spawn`, and only Wrangler, as its parent, can read workerd's exit code or signal.
 * For each workerd it prints a line when it starts and one when it exits, with its code or signal, whether Wrangler asked it to stop, and the tail of its stderr.
 * It only listens: workerd's arguments, input and output, and lifetime stay as Miniflare set them.
 */
import childProcess from 'node:child_process';
import { writeSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import path from 'node:path';

const STDERR_TAIL_BYTES = 4096;
/** The workerd processes still running, with the signal Wrangler sent each one, if any. */
const running = new Map();

/* Written synchronously, so a line written while Wrangler exits still reaches the log. */
function report(pid, message) {
  writeSync(2, `[workerd ${pid}] ${message}\n`);
}

function watch(child) {
  const { pid } = child;
  const startedAt = Date.now();
  let stderr = '';
  running.set(child, undefined);
  report(pid, 'started; its exit is recorded here.');
  const kill = child.kill.bind(child);
  child.kill = (signal = 'SIGTERM') => {
    running.set(child, running.get(child) ?? signal);
    return kill(signal);
  };
  child.stderr?.on('data', (chunk) => {
    stderr = (stderr + chunk).slice(-STDERR_TAIL_BYTES);
  });
  child.once('exit', (code, signal) => {
    const requested = running.get(child);
    running.delete(child);
    const ending = signal ? `signal ${signal}` : `code ${code}`;
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    if (requested) {
      report(pid, `exited with ${ending} after Wrangler sent ${requested}, ${seconds} s after it started.`);
      return;
    }
    report(pid, `exited with ${ending} without Wrangler asking it to stop, ${seconds} s after it started.`);
    const tail = stderr.trimEnd();
    if (!tail) {
      report(pid, 'Its stderr was empty.');
      return;
    }
    report(pid, 'The end of its stderr follows.');
    for (const line of tail.split('\n')) {
      report(pid, `| ${line}`);
    }
  });
}

const spawn = childProcess.spawn;
childProcess.spawn = (command, ...rest) => {
  const child = spawn(command, ...rest);
  if (path.parse(String(command)).name === 'workerd' && child.pid !== undefined) {
    watch(child);
  }
  return child;
};
syncBuiltinESMExports();

process.on('exit', (code) => {
  for (const [child, requested] of running) {
    report(
      child.pid,
      requested
        ? `Wrangler exited with code ${code} after sending it ${requested}, before its exit arrived.`
        : `Wrangler exited with code ${code} while it was still running; nothing had asked it to stop.`
    );
  }
});
