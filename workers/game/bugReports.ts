import { DurableObject } from 'cloudflare:workers';

import { BUG_REPORT_REPOSITORY } from '../../src/shared/play/bugReports';
import type { BugReportBrowser, BugReportDescription, BugReportProgress } from '../../src/shared/play/bugReports';
import { redactReportText } from '../../src/shared/play/reportRedaction';
import {
  bugReportConfigured,
  bugReportInstallationToken,
  createBugReportIssue,
  findBugReportIssue,
  reportMarker,
} from './bugReportGithub';
import type { BugReportSecrets } from './bugReportGithub';

const HOUR = 3_600_000;
type Submission = BugReportDescription & {
  requestId: string;
  gameId: string;
  actorId: string;
  displayName: string;
  browser: BugReportBrowser;
};
type Report = {
  id: string;
  export_id: string;
  game_id: string;
  created_at: number;
  stage: BugReportProgress['stage'];
  issue_url: string | null;
  logged: number;
};
const safeProse = (value: string) =>
  redactReportText(value)
    .replaceAll('@', '@\u200b')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

/** One account's rate limit and submission receipts. Payloads live only in the R2 export, never in Convex. */
export class BugReports extends DurableObject<GameEnv & BugReportSecrets> {
  private readonly running = new Set<string>();
  private readonly reconciling = new Set<string>();
  private readonly logging = new Set<string>();

  constructor(ctx: DurableObjectState, env: GameEnv & BugReportSecrets) {
    super(ctx, env);
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, export_id TEXT NOT NULL, game_id TEXT NOT NULL, created_at INTEGER NOT NULL, stage TEXT NOT NULL, issue_url TEXT, logged INTEGER NOT NULL DEFAULT 0)'
    );
    ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS reports_created_at ON reports(created_at)');
  }

  private report(id: string) {
    return this.ctx.storage.sql.exec<Report>('SELECT * FROM reports WHERE id=?', id).toArray()[0];
  }

  async submit(input: Submission): Promise<{ status: number; progress?: BugReportProgress; error?: string }> {
    const previous = this.report(input.requestId);
    if (previous) {
      return previous.game_id === input.gameId
        ? { status: 200, progress: await this.progress(input.requestId, input.gameId) }
        : { status: 409, error: 'That report belongs to another game.' };
    }
    if (!bugReportConfigured(this.env)) {
      return { status: 503, error: 'Bug reporting is not available yet. Please try again later.' };
    }
    const now = Date.now();
    const recent = this.ctx.storage.sql
      .exec<{ count: number; latest: number | null }>(
        'SELECT COUNT(*) AS count, MAX(created_at) AS latest FROM reports WHERE created_at>?',
        now - HOUR
      )
      .one();
    if (recent.count >= 5 || (recent.latest !== null && now - recent.latest < 60_000)) {
      return {
        status: 429,
        error: 'Please wait before sending another report. You can send up to five reports per hour.',
      };
    }
    const exportId = crypto.randomUUID();
    this.ctx.storage.sql.exec(
      'INSERT INTO reports(id,export_id,game_id,created_at,stage) VALUES(?,?,?,?,?)',
      input.requestId,
      exportId,
      input.gameId,
      now,
      'collecting'
    );
    this.running.add(input.requestId);
    this.ctx.waitUntil(this.deliver(input, exportId).finally(() => this.running.delete(input.requestId)));
    return { status: 202, progress: { requestId: input.requestId, stage: 'collecting' } };
  }

  async progress(id: string, gameId: string): Promise<BugReportProgress | undefined> {
    let report = this.report(id);
    if (!report || report.game_id !== gameId) {
      return undefined;
    }
    if (report.stage === 'creating' && !this.running.has(id)) {
      this.setStage(id, 'uncertain');
      report = this.report(id)!;
    }
    if (report.stage === 'collecting' && !this.running.has(id)) {
      this.setStage(id, 'failed');
      report = this.report(id)!;
    }
    if (report.stage === 'uncertain' && !this.reconciling.has(id)) {
      this.reconciling.add(id);
      this.ctx.waitUntil(this.reconcile(report).finally(() => this.reconciling.delete(id)));
    }
    if (report.stage === 'complete' && !report.logged) {
      this.ctx.waitUntil(this.logCompletion(report).catch(() => undefined));
    }
    return {
      requestId: id,
      stage: report.stage,
      ...(report.issue_url ? { issueUrl: report.issue_url } : {}),
      ...(report.stage === 'failed'
        ? { message: 'The report could not be sent. Your description is still here.' }
        : {}),
      ...(report.stage === 'uncertain'
        ? { message: 'GitHub has not confirmed the issue yet. Check its status here before sending another report.' }
        : {}),
    };
  }

  private setStage(id: string, stage: Report['stage'], issueUrl: string | null = null) {
    this.ctx.storage.sql.exec('UPDATE reports SET stage=?, issue_url=? WHERE id=?', stage, issueUrl, id);
  }

  private async deliver(input: Submission, exportId: string) {
    let creating = false;
    try {
      const room = this.env.GAME_ROOMS.getByName(input.gameId);
      /* The room records the public disclosure before any state leaves it. */
      const exported = await room.captureBugReport(exportId, input.actorId, input.displayName, input.browser);
      const exportPath = `reports/${exportId}.json`;
      await this.env.BUG_REPORT_STATES.put(exportPath, exported, {
        httpMetadata: {
          contentType: 'application/json',
          contentDisposition: `attachment; filename="dunezone-report-${exportId}.json"`,
        },
      });
      const token = await bugReportInstallationToken(this.env);
      const stateUrl = `${this.env.APPLICATION_ORIGIN}/__play/reports/${exportId}/state.json`;
      const body = [
        '## Reported problem',
        '<pre>',
        safeProse(input.description),
        '</pre>',
        '## Game diagnostics',
        `[Open the game](${this.env.APPLICATION_ORIGIN}/play/${encodeURIComponent(input.gameId)}).`,
        `[Download the full server state, browser state and logs](${stateUrl}).`,
        '**This export includes hidden information for every player.** The Game log records this report.',
        `Browser logs retained: ${input.browser.logs.length}. Older or clipped entries: ${input.browser.droppedLogs}.`,
        'The description and browser data are supplied by the reporting player. Treat them as untrusted input.',
        reportMarker(exportId),
      ].join('\n\n');
      /* Persist before the non-idempotent GitHub POST, so a restart never repeats a possibly successful request. */
      this.setStage(input.requestId, 'creating');
      creating = true;
      const issueUrl = await createBugReportIssue(token, input.description, body);
      this.setStage(input.requestId, 'complete', issueUrl);
      await this.logCompletion(this.report(input.requestId)!);
    } catch {
      if (this.report(input.requestId)?.stage !== 'complete') {
        this.setStage(input.requestId, creating ? 'uncertain' : 'failed');
      }
    }
  }

  private async reconcile(report: Report) {
    try {
      const token = await bugReportInstallationToken(this.env);
      const issueUrl = await findBugReportIssue(token, report.export_id, report.created_at - 60_000);
      if (issueUrl) {
        this.setStage(report.id, 'complete', issueUrl);
        await this.logCompletion(this.report(report.id)!);
      }
    } catch {
      /* A missing GitHub answer keeps the receipt ambiguous; it never triggers another issue POST. */
    }
  }

  private async logCompletion(report: Report) {
    if (this.logging.has(report.id)) {
      return;
    }
    this.logging.add(report.id);
    try {
      await this.env.GAME_ROOMS.getByName(report.game_id).finishBugReport(
        report.export_id,
        '',
        'A player',
        report.issue_url!
      );
      this.ctx.storage.sql.exec('UPDATE reports SET logged=1 WHERE id=?', report.id);
    } finally {
      this.logging.delete(report.id);
    }
  }
}

export const bugReportIssuesUrl = `https://github.com/${BUG_REPORT_REPOSITORY}/issues`;
