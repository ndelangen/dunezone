import { ZodError } from 'zod';

import type { HomepageAction } from '../../src/shared/homepage/protocol';
import type { ClientMessage } from '../../src/shared/play/protocol';

type Operation =
  | 'provision'
  | 'confirmation'
  | 'battle-alarm'
  | 'directory'
  | 'fixture-deck'
  | 'account-deletion'
  | 'account-reconciliation'
  | 'admission'
  | 'authorization-watch'
  | 'authorization-renewal'
  | 'message'
  | 'socket-send'
  | 'socket-error'
  | 'authorization-close'
  | 'draft-catalogue'
  | 'assignment'
  | 'storage-sync'
  | 'load'
  | 'retire'
  | 'refresh';

const REPEAT_INTERVAL_MS = 60_000;

function errorKind(error: unknown) {
  if (error instanceof TypeError) {
    return 'TypeError';
  }
  if (error instanceof RangeError) {
    return 'RangeError';
  }
  if (error instanceof SyntaxError) {
    return 'SyntaxError';
  }
  return error instanceof Error ? 'Error' : 'unknown';
}

type FailureDetails = {
  failureCategory: 'timeout' | 'aborted' | 'network' | 'http';
  durationMs: number;
  httpStatus?: number;
};

/** Only fields constructed by the transport are eligible for diagnostics. */
export class DependencyFailure extends Error {
  constructor(
    message: string,
    readonly details: FailureDetails,
    options?: ErrorOptions
  ) {
    super(message, options);
  }
}

type Context = {
  roomClass?: 'GameRoom' | 'HomepageRoom';
  workerVersionId?: string;
  revision?: number;
  connections?: number;
};
type Attempt = {
  durationMs?: number;
  messageType?: ClientMessage['type'] | HomepageAction['type'] | 'authenticate' | 'anonymous' | 'act';
};

function failureDetails(error: unknown) {
  if (error instanceof DependencyFailure) {
    return error.details;
  }
  if (error instanceof ZodError || error instanceof SyntaxError) {
    return { failureCategory: 'invalid-response' };
  }
  if (error instanceof Error) {
    /* Match the platform's fixed wording, retaining only its opaque support reference. */
    const reset =
      /^Internal error in Durable Object storage caused object to be reset; reference = ([a-z0-9]{1,64})$/.exec(
        error.message
      );
    return {
      failureCategory: reset ? 'storage-reset' : 'exception',
      ...(reset ? { storageReference: reset[1] } : {}),
      ...('retryable' in error && typeof error.retryable === 'boolean' ? { retryable: error.retryable } : {}),
      ...('overloaded' in error && typeof error.overloaded === 'boolean' ? { overloaded: error.overloaded } : {}),
      ...('remote' in error && typeof error.remote === 'boolean' ? { remote: error.remote } : {}),
    };
  }
  return { failureCategory: 'unknown' };
}

/** Each room retains bounded entries per fixed operation, with no timers or storage writes. */
export class GameDiagnostics {
  private readonly startedAt = Date.now();
  private readonly failures = new Map<Operation, { emittedAt: number; suppressed: number }>();
  private readonly outages = new Map<Operation, { since: number; failures: number }>();
  private readonly recoveries = new Map<Operation, number>();
  private readonly counts = new Map<Operation, number>();

  constructor(
    private readonly roomId: string,
    private readonly gitSha: string,
    private readonly context: () => Context = () => ({})
  ) {}

  /** Every reported failure per operation, including suppressed reports, for accounting without logs. */
  summary() {
    return Object.fromEntries(this.counts);
  }

  private identity(now: number) {
    return {
      roomId: this.roomId,
      gitSha: this.gitSha,
      ...this.context(),
      uptimeMs: Math.max(0, now - this.startedAt),
    };
  }

  report(operation: Operation, error?: unknown, attempt: Attempt = {}) {
    const now = Date.now();
    this.counts.set(operation, (this.counts.get(operation) ?? 0) + 1);
    const outage = this.outages.get(operation) ?? { since: now, failures: 0 };
    outage.failures++;
    this.outages.set(operation, outage);
    const previous = this.failures.get(operation);
    if (previous && now - previous.emittedAt < REPEAT_INTERVAL_MS) {
      previous.suppressed++;
      return;
    }
    this.failures.set(operation, { emittedAt: now, suppressed: 0 });
    /* Error messages, causes and original stacks can contain credentials or player content. */
    console.error({
      event: 'game-operation-failed',
      operation,
      ...this.identity(now),
      errorKind: errorKind(error),
      ...failureDetails(error),
      ...attempt,
      suppressed: previous?.suppressed ?? 0,
      since: previous?.emittedAt ?? now,
    });
  }

  recovered(operation: Operation) {
    const outage = this.outages.get(operation);
    if (!outage) {
      return;
    }
    this.outages.delete(operation);
    const now = Date.now();
    const previous = this.recoveries.get(operation);
    if (previous !== undefined && now - previous < REPEAT_INTERVAL_MS) {
      return;
    }
    this.recoveries.set(operation, now);
    console.info({
      event: 'game-operation-recovered',
      operation,
      ...this.identity(now),
      failures: outage.failures,
      outageMs: Math.max(0, now - outage.since),
    });
  }

  /** Reports unexpected failures while preserving the handler's original rejection. */
  async run<T>(operation: Operation, action: () => Promise<T>, attempt: Attempt = {}): Promise<T> {
    const startedAt = Date.now();
    try {
      const result = await action();
      this.recovered(operation);
      return result;
    } catch (error) {
      this.report(operation, error, { ...attempt, durationMs: Math.max(0, Date.now() - startedAt) });
      throw error;
    }
  }
}
