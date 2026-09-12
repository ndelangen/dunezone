type Operation =
  | 'provision'
  | 'confirmation'
  | 'account-deletion'
  | 'account-reconciliation'
  | 'admission'
  | 'authorization-watch'
  | 'authorization-renewal'
  | 'message'
  | 'socket-send'
  | 'socket-error'
  | 'authorization-close';

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

/** Each room retains at most one entry per fixed operation, with no timers or storage writes. */
export class GameDiagnostics {
  private readonly failures = new Map<Operation, { emittedAt: number; suppressed: number }>();

  constructor(
    private readonly roomId: string,
    private readonly gitSha: string
  ) {}

  report(operation: Operation, error?: unknown) {
    const now = Date.now();
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
      roomId: this.roomId,
      gitSha: this.gitSha,
      errorKind: errorKind(error),
      suppressed: previous?.suppressed ?? 0,
      since: previous?.emittedAt ?? now,
    });
  }
}
