import type { ClientMessage } from '../../src/shared/play/protocol';
import { isSetupAction } from '../../src/shared/play/setup';
import type { ActorDirectory } from './actors';
import type { Patch } from './history';
import { applyPatch, diff } from './history';
import type { SpiceLedger } from './spiceLedger';
import type { StoredSnapshot } from './state';
import { storedSnapshotSchema } from './state';

export type HistoryRow = {
  step: number;
  base_revision: number;
  revision: number;
  phase: number;
  kind: string;
  data: string;
  bytes: number;
};

type CommitMessage = Extract<ClientMessage, { type: 'drop' | 'command' }>;
type RowInput = Pick<HistoryRow, 'kind' | 'data' | 'step' | 'base_revision'>;
const boundaryActions = new Set(['phase', 'turn']);
const setupActions = new Set(['ready', 'phase']);

function requiresCheckpoint(
  action: Extract<CommitMessage, { type: 'command' }>['action'],
  before: StoredSnapshot,
  next: StoredSnapshot
) {
  if (isSetupAction(action) || action.kind === 'reset') {
    return true;
  }
  if (before.stage === 'setup' && setupActions.has(action.kind)) {
    return true;
  }
  return action.kind === 'battle-outcome' && !next.battleState;
}

/** Reconstructs private history and prepares its rows; GameSession commits and accepts each boundary. */
export class SessionHistory {
  private boundary: StoredSnapshot | undefined;
  private step = 0;

  constructor(
    private readonly storage: DurableObjectStorage,
    private readonly actors: ActorDirectory,
    private readonly spiceLedger: SpiceLedger
  ) {
    storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS history (step INTEGER PRIMARY KEY, base_revision INTEGER NOT NULL, revision INTEGER NOT NULL, phase INTEGER NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL, bytes INTEGER NOT NULL)'
    );
  }

  get steps() {
    return this.step;
  }

  restoreBoundary() {
    const step = this.storage.sql.exec<{ step: number }>('SELECT MAX(step) AS step FROM history').one().step;
    this.accept(step, this.restore(step));
  }

  seed(snapshot: StoredSnapshot) {
    this.write(this.row(snapshot, { kind: 'checkpoint', data: JSON.stringify(snapshot), step: 0, base_revision: 0 }));
  }

  accept(step: number, snapshot: StoredSnapshot) {
    this.step = step;
    this.boundary = snapshot;
  }

  checkpoint(next: StoredSnapshot, after?: HistoryRow): HistoryRow {
    return this.row(next, {
      kind: 'checkpoint',
      data: JSON.stringify(next),
      step: (after?.step ?? this.step) + 1,
      base_revision: after?.revision ?? this.boundary!.revision,
    });
  }

  entry(message: CommitMessage, before: StoredSnapshot, next: StoredSnapshot): HistoryRow | undefined {
    if (next.revision === before.revision || message.type !== 'command') {
      return;
    }
    if (requiresCheckpoint(message.action, before, next)) {
      return this.checkpoint(next);
    }
    if (boundaryActions.has(message.action.kind)) {
      return this.row(next, {
        kind: 'patch',
        data: JSON.stringify(diff(this.boundary!, next)),
        step: this.step + 1,
        base_revision: this.boundary!.revision,
      });
    }
  }

  private row(next: StoredSnapshot, input: RowInput): HistoryRow {
    return {
      ...input,
      revision: next.revision,
      phase: next.phase,
      bytes: new TextEncoder().encode(input.data).byteLength,
    };
  }

  write(history: HistoryRow) {
    this.storage.sql.exec(
      'INSERT INTO history VALUES(?,?,?,?,?,?,?)',
      history.step,
      history.base_revision,
      history.revision,
      history.phase,
      history.kind,
      history.data,
      history.bytes
    );
  }

  restore(step: number): StoredSnapshot {
    const checkpoint = this.storage.sql
      .exec<HistoryRow>("SELECT * FROM history WHERE kind='checkpoint' AND step<=? ORDER BY step DESC LIMIT 1", step)
      .one();
    let snapshot = storedSnapshotSchema.parse(JSON.parse(checkpoint.data));
    let restoredStep = checkpoint.step;
    for (const row of this.storage.sql.exec<HistoryRow>(
      'SELECT * FROM history WHERE step>? AND step<=? ORDER BY step',
      checkpoint.step,
      step
    )) {
      if (row.step !== restoredStep + 1 || row.base_revision !== snapshot.revision) {
        throw new Error('History is incomplete.');
      }
      snapshot = this.restorePatch(snapshot, row);
      restoredStep = row.step;
    }
    if (restoredStep !== step) {
      throw new Error('History is incomplete.');
    }
    /* A patch row written before the seat-named requester replays the old key; the parse strips it. */
    return this.spiceLedger.project(this.actors.publicSnapshot(storedSnapshotSchema.parse(snapshot)));
  }

  private restorePatch(snapshot: StoredSnapshot, row: HistoryRow): StoredSnapshot {
    const next = storedSnapshotSchema.parse(applyPatch(snapshot, JSON.parse(row.data) as Patch[]));
    if (next.revision !== row.revision) {
      throw new Error('History is incomplete.');
    }
    return next;
  }
}
