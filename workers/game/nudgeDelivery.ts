import { api } from '../../convex/_generated/api';
import { playPublishNudgeResultSchema } from '../../src/shared/play/nudges';
import type { PlayNudge } from '../../src/shared/play/nudges';
import type { DirectoryRoom } from './directoryDelivery';

/** One attempt for an explicit nudge request. A failure never schedules another attempt. */
export function publishNudge(room: Omit<DirectoryRoom, 'scheduleAlarm'>, nudge: PlayNudge) {
  const metadata = room.session.info;
  if (!metadata?.confirmed) {
    return;
  }
  room.waitUntil(
    room
      .convex()
      .action(api.playDiscordNudges.sendNudge, {
        gameId: metadata.gameId,
        secret: metadata.secret,
        ...nudge,
      })
      .then((raw: unknown) => {
        if (!playPublishNudgeResultSchema.parse(raw).ok) {
          throw new Error('Nudge delivery refused.');
        }
      })
      .catch((error) => room.diagnostics.report('nudge', error))
  );
}
