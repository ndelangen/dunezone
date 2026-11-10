import { api } from '../../convex/_generated/api';
import { PLAY_REQUEST_TIMEOUT_MS } from '../../src/shared/play/admission';
import {
  PLAY_NUDGE_RETRY_CEILING_MS,
  PLAY_NUDGE_RETRY_MS,
  playPublishNudgeResultSchema,
} from '../../src/shared/play/nudges';
import type { DirectoryRoom } from './directoryDelivery';

type NudgeRoom = DirectoryRoom & { ensureDirectory(): Promise<void> };

/** Delivers committed nudge events once at a time; refusal and expiry are terminal. */
export class NudgeDelivery {
  private running?: Promise<void>;
  private rerun = false;
  constructor(private readonly room: NudgeRoom) {}
  soon() {
    if (this.running) {
      this.rerun = true;
      return;
    }
    this.room.waitUntil(
      Promise.resolve()
        .then(() => this.deliver())
        .catch((error) => this.room.diagnostics.report('nudge', error))
    );
  }
  deliver(): Promise<void> {
    this.running ??= this.loop().finally(() => {
      this.running = undefined;
      /* A new message may stage work while the previous pass is awaiting its final alarm write. */
      if (this.rerun) {
        this.rerun = false;
        this.soon();
      }
    });
    return this.running;
  }
  private async loop() {
    const metadata = this.room.session.info;
    if (!metadata?.confirmed) {
      return;
    }
    let pending = this.room.session.pendingNudge();
    if (!pending) {
      return;
    }
    for (; pending; pending = this.room.session.pendingNudge()) {
      if (pending.retryAt > Date.now()) {
        break;
      }
      const { nudge } = pending;
      try {
        /* Cover both HTTP timeouts with a durable future deadline before making either call. */
        this.room.session.reserveNudge(nudge.nudgeId, Date.now() + 2 * PLAY_REQUEST_TIMEOUT_MS + PLAY_NUDGE_RETRY_MS);
        await this.room.scheduleAlarm();
        /* Publish current occupancy before asking Convex to address the player at this seat. */
        await this.room.ensureDirectory();
        if (this.room.session.pendingDirectory()) {
          throw new Error('Nudge is waiting for its directory summary.');
        }
        if (!this.room.session.nudgeCurrent(nudge)) {
          this.room.session.acknowledgeNudge(nudge.nudgeId);
          continue;
        }
        const raw: unknown = await this.room
          .convex()
          .mutation(api.playDiscordNudges.publishNudge, { gameId: metadata.gameId, secret: metadata.secret, ...nudge });
        const result = playPublishNudgeResultSchema.parse(raw);
        this.room.session.acknowledgeNudge(nudge.nudgeId);
        if (result.ok) {
          this.room.diagnostics.recovered('nudge');
        } else {
          this.room.diagnostics.report('nudge', new Error('Nudge delivery refused.'));
        }
      } catch (error) {
        this.room.diagnostics.report('nudge', error);
        const wait = Math.min(PLAY_NUDGE_RETRY_CEILING_MS, PLAY_NUDGE_RETRY_MS * 2 ** pending.attempts);
        this.room.session.deferNudge(nudge.nudgeId, Date.now() + wait);
      }
    }
    await this.room.scheduleAlarm();
  }
}
