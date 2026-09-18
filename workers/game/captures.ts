import { factionCaptureSchema, rulesetCaptureSchema } from '../../src/shared/play/capture';
import type { FactionCapture, RulesetCapture } from '../../src/shared/play/capture';
import { GameRejection } from '../../src/shared/play/rejection';

type Row = { data: string };

/**
 * What a game retained of the catalogue.
 * A record arrives once and never changes: the ruleset at creation, each faction at public assignment.
 * A retry reads the first record back, so source edits, deletion and repeated attempts cannot reach a game that has already captured.
 */
export class CaptureStore {
  constructor(private readonly storage: DurableObjectStorage) {
    storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS captures (kind TEXT NOT NULL, source_id TEXT NOT NULL, data TEXT NOT NULL, captured_at INTEGER NOT NULL, PRIMARY KEY (kind, source_id))'
    );
  }

  ruleset(): RulesetCapture | undefined {
    const row = this.storage.sql.exec<Row>("SELECT data FROM captures WHERE kind='ruleset' LIMIT 1").toArray()[0];
    return row ? rulesetCaptureSchema.parse(JSON.parse(row.data)) : undefined;
  }

  faction(factionId: string): FactionCapture | undefined {
    const row = this.storage.sql
      .exec<Row>("SELECT data FROM captures WHERE kind='faction' AND source_id=?", factionId)
      .toArray()[0];
    return row ? factionCaptureSchema.parse(JSON.parse(row.data)) : undefined;
  }

  factions(): FactionCapture[] {
    return this.storage.sql
      .exec<Row>("SELECT data FROM captures WHERE kind='faction' ORDER BY captured_at, source_id")
      .toArray()
      .map((row) => factionCaptureSchema.parse(JSON.parse(row.data)));
  }

  /**
   * A game has one ruleset, fixed at creation.
   * The record for this ruleset when it is the one retained, nothing when none is yet, and a refusal when another is.
   */
  expectRuleset(rulesetId: string): RulesetCapture | undefined {
    const existing = this.ruleset();
    if (existing && existing.ruleset.id !== rulesetId) {
      throw new GameRejection('This game already has its ruleset.');
    }
    return existing;
  }

  retainRuleset(capture: RulesetCapture): RulesetCapture {
    const existing = this.expectRuleset(capture.ruleset.id);
    if (existing) {
      return existing;
    }
    this.insert('ruleset', capture.ruleset.id, capture, capture.capturedAt);
    return capture;
  }

  retainFaction(capture: FactionCapture): FactionCapture {
    const existing = this.faction(capture.faction.id);
    if (existing) {
      return existing;
    }
    this.insert('faction', capture.faction.id, capture, capture.capturedAt);
    return capture;
  }

  private insert(kind: 'ruleset' | 'faction', sourceId: string, data: unknown, capturedAt: number) {
    this.storage.sql.exec(
      'INSERT INTO captures (kind, source_id, data, captured_at) VALUES(?,?,?,?)',
      kind,
      sourceId,
      JSON.stringify(data),
      capturedAt
    );
  }
}
