/**
 * Diagnostic for #1343: records the dev-environment error event that makes Wrangler exit, with the cause Wrangler prints as an empty `✘ [ERROR]`.
 * `play-local.ts` loads this into Wrangler's Node processes with `--import`, next to `workerd-exit-record.mjs`.
 * Wrangler's `DevEnv` emits `error` with `{ type, source, reason, cause }`; a report from the ProxyWorker arrives as a plain object that Wrangler wraps in a message-less `Error`, so the text only survives in `cause.cause`.
 * It also keeps the times of the last request-log lines, so the record shows how long the proxy had been quiet before the failing burst.
 * It only listens: every `emit` and every `stdout` write goes through unchanged.
 */
import { EventEmitter } from 'node:events';
import { writeSync } from 'node:fs';

const startedAt = performance.now();
/** Milliseconds since this process started, of the last request-log lines Wrangler wrote. */
const requestTimes = [];
const REQUEST_TIMES_KEPT = 60;

function report(message) {
  writeSync(2, `[wrangler dev-error] ${message}\n`);
}

function describe(value, depth = 0) {
  if (depth > 3 || value === undefined || value === null) {
    return String(value);
  }
  if (typeof value !== 'object') {
    return JSON.stringify(value);
  }
  const { name, message, code, stack, cause } = value;
  const parts = [`name=${JSON.stringify(name)}`, `message=${JSON.stringify(message)}`];
  if (code !== undefined) {
    parts.push(`code=${JSON.stringify(code)}`);
  }
  if (!(value instanceof Error) && typeof stack === 'string') {
    parts.push(`stack=${JSON.stringify(stack.split('\n').slice(0, 6).join(' | '))}`);
  }
  if (cause !== undefined) {
    parts.push(`cause={${describe(cause, depth + 1)}}`);
  }
  return parts.join(' ');
}

const write = process.stdout.write;
process.stdout.write = function (chunk, ...rest) {
  if (String(chunk).includes('[wrangler:info] ')) {
    requestTimes.push(performance.now() - startedAt);
    if (requestTimes.length > REQUEST_TIMES_KEPT) {
      requestTimes.shift();
    }
  }
  return write.call(this, chunk, ...rest);
};

const emit = EventEmitter.prototype.emit;
EventEmitter.prototype.emit = function (name, ...args) {
  const event = args[0];
  if (name === 'error' && event && typeof event === 'object' && event.type === 'error' && 'source' in event) {
    const now = performance.now() - startedAt;
    report(`${new Date().toISOString()} ${event.source}: ${event.reason}`);
    report(`cause: ${describe(event.cause)}`);
    const offsets = requestTimes.map((time) => Math.round(time - now));
    report(`request-log lines before it, ms relative to the error: ${offsets.join(' ')}`);
    const gaps = requestTimes.slice(1).map((time, index) => Math.round(time - requestTimes[index]));
    report(`longest quiet gap among them: ${gaps.length > 0 ? Math.max(...gaps) : 'n/a'} ms`);
  }
  return emit.call(this, name, ...args);
};
