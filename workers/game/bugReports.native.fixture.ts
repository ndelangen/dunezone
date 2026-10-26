import { DurableObject } from 'cloudflare:workers';

import type { BugReportBrowser } from '../../src/shared/play/bugReports';
export { BugReports } from './bugReports';

/** Test-only game boundary for exercising real report storage, R2 and GitHub requests in workerd. */
export class ReportGame extends DurableObject {
  captureBugReport(requestId: string, _actorId: string, _displayName: string, browser: BugReportBrowser) {
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS log (event TEXT)');
    this.ctx.storage.sql.exec('INSERT INTO log VALUES (?)', `requested:${requestId}`);
    return JSON.stringify({
      server: { state: { privatePredictions: { fremen: 'atreides' }, deck: ['Lasgun', 'Snooper'] } },
      browser,
    });
  }
  finishBugReport(requestId: string, _actorId: string, _displayName: string, issueUrl: string) {
    this.ctx.storage.sql.exec('INSERT INTO log VALUES (?)', `complete:${requestId}:${issueUrl}`);
  }
  entries() {
    return this.ctx.storage.sql.exec<{ event: string }>('SELECT event FROM log').toArray();
  }
}

type TestEnv = Omit<GameEnv, 'GAME_ROOMS'> & { GAME_ROOMS: DurableObjectNamespace<ReportGame> };
export default {
  async fetch(request, env) {
    const input = (await request.json()) as {
      operation: string;
      account: string;
      requestId: string;
      gameId: string;
      description: string;
      browser: BugReportBrowser;
    };
    if (input.operation === 'status') {
      return Response.json(
        (await env.BUG_REPORTS.getByName(input.account).progress(input.requestId, input.gameId)) ?? null
      );
    }
    if (input.operation === 'state') {
      const state = await env.BUG_REPORT_STATES.get(`reports/${input.requestId}.json`);
      return new Response(state?.body ?? null);
    }
    if (input.operation === 'log') {
      return Response.json(await env.GAME_ROOMS.getByName(input.gameId).entries());
    }
    return Response.json(
      await env.BUG_REPORTS.getByName(input.account).submit({
        requestId: input.requestId,
        gameId: input.gameId,
        description: input.description,
        browser: input.browser,
        actorId: input.account,
        displayName: 'Reporter',
      })
    );
  },
} satisfies ExportedHandler<TestEnv>;
