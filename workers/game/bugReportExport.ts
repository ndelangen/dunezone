import { redactReportData } from '../../src/shared/play/reportRedaction';
import type { GameSession } from './session';

export function bugReportExport(session: GameSession, identity: { gameId: string; gitSha: string; versionId: string }) {
  return {
    format: 'dunezone-game-report-v1',
    capturedAt: new Date().toISOString(),
    ...identity,
    state: redactReportData(session.currentSnapshot(), 'game'),
    activity: redactReportData(session.bugReportActivity(), 'game'),
    captures: redactReportData(session.retainedCaptures(), 'game'),
    conversations: session.bugReportConversations(),
    events: {
      game: session.logPage('game', Number.MAX_SAFE_INTEGER),
      audit: session.logPage('audit', Number.MAX_SAFE_INTEGER),
    },
  };
}
