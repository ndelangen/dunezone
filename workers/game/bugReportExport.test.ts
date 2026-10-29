import { expect, test } from 'vite-plus/test';

import { redactReportData } from '../../src/shared/play/reportRedaction';
import { bugReportExport } from './bugReportExport';
import type { GameSession } from './session';

test('keeps game token definitions and artwork in the export while stripping authentication and account fields', () => {
  const token = { front: '/image/token/atreides', back: '/image/token/atreides-back' };
  const session = {
    currentSnapshot: () => ({ stage: 'drafting', token, secret: 'game-credential', userId: 'account' }),
    bugReportActivity: () => ({ carries: [{ token, userId: 'account' }] }),
    retainedCaptures: () => ({ factions: [{ definition: { token }, components: { token }, authToken: 'credential' }] }),
    bugReportConversations: () => ({ totalMessages: 0, messages: [], reads: [] }),
    logPage: () => ({ entries: [], more: false }),
  } as unknown as GameSession;
  const report = bugReportExport(session, { gameId: 'game', gitSha: 'revision', versionId: 'version' });
  expect(report).toMatchObject({
    state: { token },
    activity: { carries: [{ token }] },
    captures: { factions: [{ definition: { token }, components: { token } }] },
  });
  const json = JSON.stringify(report);
  expect(json).not.toContain('game-credential');
  expect(json).not.toContain('account');
  expect(json).not.toContain('authToken');
  expect(redactReportData({ token: 'opaque-browser-credential', components: { token: 'also-untrusted' } })).toEqual({
    components: {},
  });
});
