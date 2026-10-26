import { api } from '../../convex/_generated/api';
import {
  PLAY_DIRECTORY_RETRY_CEILING_MS,
  PLAY_DIRECTORY_RETRY_MS,
  playPublishSummaryResultSchema,
} from '../../src/shared/play/directory';
import type { GameDiagnostics } from './diagnostics';
import type { gameHttpClient } from './gameHttpClient';
import type { GameSession } from './session';

/** What delivering the room's directory summary needs from its room. */
export type DirectoryRoom = {
  readonly session: GameSession;
  readonly diagnostics: GameDiagnostics;
  convex(): ReturnType<typeof gameHttpClient>;
  /** Arms the alarm for the room's next deadline, a deferred delivery's retry included. */
  scheduleAlarm(): Promise<void>;
  waitUntil(work: Promise<unknown>): void;
};

/** Sends the room's summary to the Convex directory, one delivery at a time. */
export class DirectoryDelivery {
  private running?: Promise<void>;

  constructor(private readonly room: DirectoryRoom) {}

  /** Delivery starts after the current transaction has committed, never from inside it. */
  soon() {
    this.room.waitUntil(
      Promise.resolve()
        .then(() => this.deliver())
        .catch((error) => this.room.diagnostics.report('directory', error))
    );
  }

  /*
   * Sends the pending summary until Convex holds the newest one. An acknowledgment clears only the
   * sequence it names, so newer work staged meanwhile stays owed; a transport failure defers with
   * backoff and the alarm retries it with no player connected; a refusal is terminal, since no
   * retry cures a wrong credential or a game Convex no longer lists. The loop stays single-flight
   * because its only awaits are the delivery and a storage call: a stage that lands between the
   * last `pending()` read and the loop's end would otherwise wait for the next event.
   */
  deliver(): Promise<void> {
    this.running ??= this.loop().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  private async loop() {
    const metadata = this.room.session.info;
    /* Until confirmation settles, its recovery owns the alarm and the opening summary stays queued. */
    if (!metadata?.confirmed) {
      return;
    }
    for (let pending = this.room.session.pendingDirectory(); pending; pending = this.room.session.pendingDirectory()) {
      const now = Date.now();
      if (pending.retryAt > now) {
        break;
      }
      try {
        const raw: unknown = await this.room.convex().mutation(api.playDirectory.publishSummary, {
          gameId: metadata.gameId,
          secret: metadata.secret,
          sequence: pending.sequence,
          summary: pending.summary,
        });
        const result = playPublishSummaryResultSchema.parse(raw);
        if (!result.ok) {
          this.room.session.acknowledgeDirectory(pending.sequence);
          this.room.diagnostics.report('directory', new Error('Directory delivery refused.'));
        } else if (result.sequence > pending.sequence) {
          this.room.session.advanceDirectory(result.sequence);
        } else {
          this.room.session.acknowledgeDirectory(pending.sequence);
        }
        if (result.ok) {
          this.room.diagnostics.recovered('directory');
        }
      } catch (error) {
        this.room.diagnostics.report('directory', error);
        const wait = Math.min(PLAY_DIRECTORY_RETRY_CEILING_MS, PLAY_DIRECTORY_RETRY_MS * 2 ** pending.attempts);
        this.room.session.deferDirectory(pending.sequence, Date.now() + wait);
        break;
      }
    }
    await this.room.scheduleAlarm();
  }
}
