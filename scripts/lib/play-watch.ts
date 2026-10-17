/*
 * Reads `wrangler tail --format json` output for the game Worker and keeps only Play's own log records:
 * room summaries, operation failures and recoveries, and refused admissions. Every record is one the
 * Worker already writes to Workers Logs, so watching a session adds nothing to what is collected.
 */

const WATCHED = new Set([
  'game-room-summary',
  'game-operation-failed',
  'game-operation-recovered',
  'game-admission-refused',
]);

export type PlayRecord = { event: string; at: number } & Record<string, unknown>;

/** Splits a stream of concatenated JSON values, pretty-printed or not, into whole values as they complete. */
export class JsonStream {
  private buffer = '';
  private depth = 0;
  private inString = false;
  private escaped = false;
  private start = -1;

  push(chunk: string): unknown[] {
    const values: unknown[] = [];
    const offset = this.buffer.length;
    this.buffer += chunk;
    for (let index = offset; index < this.buffer.length; index++) {
      const character = this.buffer[index];
      if (this.inString) {
        if (this.escaped) {
          this.escaped = false;
        } else if (character === '\\') {
          this.escaped = true;
        } else if (character === '"') {
          this.inString = false;
        }
        continue;
      }
      if (character === '"' && this.depth > 0) {
        this.inString = true;
      } else if (character === '{') {
        if (this.depth++ === 0) {
          this.start = index;
        }
      } else if (character === '}' && this.depth > 0 && --this.depth === 0) {
        try {
          values.push(JSON.parse(this.buffer.slice(this.start, index + 1)));
        } catch {
          /* A torn or non-JSON banner line is skipped; the next object starts clean. */
        }
        this.buffer = this.buffer.slice(index + 1);
        index = -1;
        this.start = -1;
      }
    }
    if (this.depth === 0) {
      this.buffer = '';
    }
    return values;
  }
}

/** The Play records inside one tail event: each log line's first argument, when it names a watched event. */
export function playRecords(event: unknown): PlayRecord[] {
  const logs = (event as { logs?: unknown } | null)?.logs;
  if (!Array.isArray(logs)) {
    return [];
  }
  return logs.flatMap((log: { message?: unknown; timestamp?: unknown }) => {
    const first: unknown = Array.isArray(log?.message) ? log.message[0] : undefined;
    if (!first || typeof first !== 'object' || !WATCHED.has(String((first as { event?: unknown }).event))) {
      return [];
    }
    return [{ ...(first as Record<string, unknown>), at: typeof log.timestamp === 'number' ? log.timestamp : Date.now() } as PlayRecord];
  });
}

function short(roomId: unknown) {
  return typeof roomId === 'string' ? roomId.slice(0, 8) : '?';
}

/** One readable line per record, with failures marked so a watcher can grep for them. */
export function describe(record: PlayRecord): string {
  const time = new Date(record.at).toISOString().slice(11, 19);
  const room = short(record.roomId);
  switch (record.event) {
    case 'game-room-summary': {
      const commands = record.commands as { count: number; p95Ms: number; maxMs: number } | undefined;
      const clients = record.clients as { worstActionP95Ms: number; worstLongTaskMs: number } | undefined;
      const convex = Object.values((record.convex ?? {}) as Record<string, { calls: number }>).reduce(
        (total, call) => total + call.calls,
        0
      );
      return `${time} room ${room} ${String(record.reason)}: ${String(record.peakConnections)} peak, ${commands?.count ?? 0} saves (p95 ${commands?.p95Ms ?? 0} ms, max ${commands?.maxMs ?? 0} ms), players' p95 ${clients?.worstActionP95Ms ?? 0} ms, long task ${clients?.worstLongTaskMs ?? 0} ms, ${String(record.stalls)} stalls, ${String(record.motionDropped)} motion dropped, ${convex} Convex calls`;
    }
    case 'game-operation-failed':
      return `${time} ALERT room ${room}: ${String(record.operation)} failed (${String(record.failureCategory)}), ${String(record.suppressed)} suppressed`;
    case 'game-operation-recovered':
      return `${time} room ${room}: ${String(record.operation)} recovered after ${String(record.failures)} failures, ${String(record.outageMs)} ms`;
    default:
      return `${time} room ${room}: admission refused (${String(record.reason)})`;
  }
}
