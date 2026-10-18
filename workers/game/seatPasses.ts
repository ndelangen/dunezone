import type { SeatPassPayload } from '../../src/shared/play/seatPass';
import { verifySeatPass } from '../../src/shared/play/seatPass';

/** What a connection keeps of the pass it entered with, or its latest renewal. */
export type HeldPass = Pick<SeatPassPayload, 'actorId' | 'principalId' | 'sessionId' | 'sessionCreatedAt' | 'exp'>;

export type PassCheck = { ok: true; pass: SeatPassPayload } | { ok: false; reason: 'invalid' | 'expired' | 'revoked' };

/**
 * The room's side of seat passes: it checks a pass against its own secret, clock and stored cutoffs, and never asks Convex.
 * Cutoffs live in the room's SQLite and are cached here, since every send to every socket asks whether its pass still holds.
 */
export class SeatPasses {
  private cutoffs: Map<string, number> | undefined;

  constructor(
    private readonly sql: SqlStorage,
    private readonly now: () => number = Date.now
  ) {}

  private loaded() {
    if (this.cutoffs) {
      return this.cutoffs;
    }
    /* Account-wide sign-outs Convex pushed: a pass of the account from a session created at or before `through` no longer enters or plays. */
    this.sql.exec(
      'CREATE TABLE IF NOT EXISTS principal_cutoffs (principal_id TEXT PRIMARY KEY, through INTEGER NOT NULL)'
    );
    this.cutoffs = new Map(
      this.sql
        .exec<{ principal_id: string; through: number }>('SELECT principal_id, through FROM principal_cutoffs')
        .toArray()
        .map((row) => [row.principal_id, row.through])
    );
    return this.cutoffs;
  }

  async check(secret: string, gameId: string, raw: string): Promise<PassCheck> {
    const pass = await verifySeatPass(secret, raw);
    if (pass?.gameId !== gameId) {
      return { ok: false, reason: 'invalid' };
    }
    if (this.revoked(pass)) {
      return { ok: false, reason: 'revoked' };
    }
    return this.now() < pass.exp ? { ok: true, pass } : { ok: false, reason: 'expired' };
  }

  revoked(pass: Pick<HeldPass, 'principalId' | 'sessionCreatedAt'>) {
    return pass.sessionCreatedAt <= (this.loaded().get(pass.principalId) ?? -1);
  }

  current(pass: HeldPass) {
    return this.now() < pass.exp && !this.revoked(pass);
  }

  /** Stores an account-wide cutoff before it is acknowledged; an older one arriving late never lowers it. Answers the cutoff now held. */
  raise(principalId: string, through: number) {
    const held = Math.max(through, this.loaded().get(principalId) ?? -1);
    this.sql.exec(
      'INSERT INTO principal_cutoffs (principal_id, through) VALUES (?, ?) ON CONFLICT(principal_id) DO UPDATE SET through=MAX(through, excluded.through)',
      principalId,
      held
    );
    this.loaded().set(principalId, held);
    return held;
  }
}

export function heldPass(pass: SeatPassPayload): HeldPass {
  return {
    actorId: pass.actorId,
    principalId: pass.principalId,
    sessionId: pass.sessionId,
    sessionCreatedAt: pass.sessionCreatedAt,
    exp: pass.exp,
  };
}
