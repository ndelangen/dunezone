import { tableProgressFor } from '../../src/shared/play/phases';
import type { CommitMessage, PieceAction } from '../../src/shared/play/protocol';
import type { ReviewCheckpoint } from '../../src/shared/play/review';
import { isSetupAction } from '../../src/shared/play/setup';
import type { ActorDirectory } from './actors';
import type { Patch } from './history';
import { applyPatch, applyPatchInPlace, diff } from './history';
import { logContext } from './log';
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
  /* Where the step is, as the log names it, so a review can offer it without restoring it. */
  context: string;
};

type RowInput = Pick<HistoryRow, 'kind' | 'data' | 'step' | 'base_revision'>;
/* Declaring a result and continuing past it are playback steps, as phase changes are. */
const boundaryActions = new Set(['phase', 'result-declare', 'result-continue']);
/* Ready is a playback step only while setup gates on it; phase is one everywhere. */
const setupReady = 'ready';

/* The turn a stored state is in, by the turn it plays; a game before play counts as Turn 1. */
const turnOf = (snapshot: StoredSnapshot) => tableProgressFor(snapshot.phase, snapshot.phases).turn;

/*
 * Kept whole: a reset replaces the table, Turn 1 opening ends setup, every later turn change starts a new stretch, and a
 * settled battle closes a run of playback steps, so no restore replays more than one turn of patches however long the
 * table plays without a battle.
 */
function requiresCheckpoint(action: PieceAction, before: StoredSnapshot, next: StoredSnapshot) {
  if (action.kind === 'reset' || (before.stage === 'setup' && next.stage !== 'setup')) {
    return true;
  }
  if (action.kind === 'phase' && turnOf(before) !== turnOf(next)) {
    return true;
  }
  /* A revealed battle settles by agreed outcome or by cancel; either is a checkpoint. */
  return before.battleState?.stage === 'revealed' && !next.battleState;
}

/* Setup steps change a few entries of the table each, so they are stored as their changes like any other playback step. */
function isPlaybackStep(action: PieceAction, before: StoredSnapshot) {
  return (
    boundaryActions.has(action.kind) ||
    isSetupAction(action) ||
    (before.stage === 'setup' && action.kind === setupReady)
  );
}

/** Reconstructs private history and prepares its rows; GameSession commits and accepts each boundary. */
export class SessionHistory {
  private boundary: StoredSnapshot | undefined;
  private step = 0;
  private recentSteps: { step: number; limit: number; checkpoints: ReviewCheckpoint[] } | undefined;

  constructor(
    private readonly storage: DurableObjectStorage,
    private readonly actors: ActorDirectory,
    private readonly spiceLedger: SpiceLedger
  ) {
    storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS history (step INTEGER PRIMARY KEY, base_revision INTEGER NOT NULL, revision INTEGER NOT NULL, phase INTEGER NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL, bytes INTEGER NOT NULL)'
    );
    /* Older steps have no recorded clock, so they stay unknown instead of borrowing today's time. */
    storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS history_clocks (step INTEGER PRIMARY KEY, recorded_at INTEGER NOT NULL)'
    );
    storage.sql.exec('CREATE TABLE IF NOT EXISTS history_contexts (step INTEGER PRIMARY KEY, context TEXT NOT NULL)');
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
    if (isPlaybackStep(message.action, before)) {
      return this.patch(next);
    }
  }

  /** A playback step stored as its change from the last recorded step; restore replays it onto the checkpoint before it. */
  patch(next: StoredSnapshot): HistoryRow {
    return this.row(next, {
      kind: 'patch',
      data: JSON.stringify(diff(this.boundary!, next)),
      step: this.step + 1,
      base_revision: this.boundary!.revision,
    });
  }

  private row(next: StoredSnapshot, input: RowInput): HistoryRow {
    return {
      ...input,
      revision: next.revision,
      phase: next.phase,
      bytes: new TextEncoder().encode(input.data).byteLength,
      context: logContext(next),
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
    this.storage.sql.exec('INSERT INTO history_clocks VALUES(?,?)', history.step, Date.now());
    this.storage.sql.exec('INSERT INTO history_contexts VALUES(?,?)', history.step, history.context);
  }

  /** The newest steps a review can show, oldest first; every frame carries them, so they are read again only once a step is added. */
  recent(limit: number): ReviewCheckpoint[] {
    if (this.recentSteps?.step !== this.step || this.recentSteps.limit !== limit) {
      const checkpoints = this.storage.sql
        .exec<ReviewCheckpoint>('SELECT step, context FROM history_contexts ORDER BY step DESC LIMIT ?', limit)
        .toArray()
        .reverse()
        .map(({ step, context }) => ({ step, context }));
      this.recentSteps = { step: this.step, limit, checkpoints };
    }
    return this.recentSteps.checkpoints;
  }

  recordedAt(step: number): number | undefined {
    return this.storage.sql
      .exec<{ recorded_at: number }>('SELECT recorded_at FROM history_clocks WHERE step=?', step)
      .toArray()[0]?.recorded_at;
  }

  restore(step: number): StoredSnapshot {
    const checkpoint = this.storage.sql
      .exec<HistoryRow>("SELECT * FROM history WHERE kind='checkpoint' AND step<=? ORDER BY step DESC LIMIT 1", step)
      .one();
    const rows = this.storage.sql
      .exec<HistoryRow>('SELECT * FROM history WHERE step>? AND step<=? ORDER BY step', checkpoint.step, step)
      .toArray();
    let restoredStep = checkpoint.step;
    for (const row of rows) {
      if (row.step !== restoredStep + 1) {
        throw new Error('History is incomplete.');
      }
      restoredStep = row.step;
    }
    if (restoredStep !== step) {
      throw new Error('History is incomplete.');
    }
    return this.spiceLedger.project(this.actors.publicSnapshot(this.replay(checkpoint, rows)));
  }

  /**
   * The checkpoint with every patch row after it applied in turn to one copy, read through the schema once at the end.
   * A patch written across a release that added a default can reach into a part only a read fills in;
   * such a chain is replayed by reading each step through the schema, as every restore once did.
   */
  private replay(checkpoint: HistoryRow, rows: HistoryRow[]): StoredSnapshot {
    try {
      return this.replayInPlace(checkpoint, rows);
    } catch {
      return this.replayPerStep(checkpoint, rows);
    }
  }

  private replayInPlace(checkpoint: HistoryRow, rows: HistoryRow[]): StoredSnapshot {
    let snapshot = storedSnapshotSchema.parse(JSON.parse(checkpoint.data));
    for (const row of rows) {
      assertBase(snapshot, row);
      /* The parsed checkpoint and the freshly read rows belong to this restore alone, so they change in place. */
      snapshot = applyPatchInPlace(snapshot, JSON.parse(row.data) as Patch[]);
      if (snapshot.revision !== row.revision) {
        throw new Error('History is incomplete.');
      }
    }
    return storedSnapshotSchema.parse(snapshot);
  }

  private replayPerStep(checkpoint: HistoryRow, rows: HistoryRow[]): StoredSnapshot {
    let snapshot = storedSnapshotSchema.parse(JSON.parse(checkpoint.data));
    for (const row of rows) {
      assertBase(snapshot, row);
      snapshot = this.restorePatch(snapshot, row);
    }
    return snapshot;
  }

  private restorePatch(snapshot: StoredSnapshot, row: HistoryRow): StoredSnapshot {
    const next = storedSnapshotSchema.parse(applyPatch(snapshot, JSON.parse(row.data) as Patch[]));
    if (next.revision !== row.revision) {
      throw new Error('History is incomplete.');
    }
    return next;
  }
}

function assertBase(snapshot: StoredSnapshot, row: HistoryRow) {
  if (row.base_revision !== snapshot.revision) {
    throw new Error('History is incomplete.');
  }
}
