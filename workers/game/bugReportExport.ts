import { redactReportData } from '../../src/shared/play/reportRedaction';
import type { GameSession } from './session';

export function bugReportExport(session: GameSession, identity: { gameId: string; gitSha: string; versionId: string }) {
  return {
    format: 'dunezone-game-report-v1',
    capturedAt: new Date().toISOString(),
    ...identity,
    state: redactReportData(session.currentSnapshot()),
    activity: redactReportData(session.bugReportActivity()),
    captures: redactReportData(session.retainedCaptures()),
    conversations: session.bugReportConversations(),
    events: {
      game: session.logPage('game', Number.MAX_SAFE_INTEGER),
      audit: session.logPage('audit', Number.MAX_SAFE_INTEGER),
    },
  };
}
