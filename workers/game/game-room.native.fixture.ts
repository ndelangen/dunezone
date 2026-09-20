const realNow = Date.now;
let clockOffset = 0;
Date.now = () => realNow() + clockOffset;

import type { ExtraReference } from '../../src/shared/play/capture';
import worker, { GameRoom as ProductionGameRoom } from './index';

export class GameRoom extends ProductionGameRoom {
  override async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname === '/native-test/audit') {
      return Response.json(this.ctx.storage.sql.exec('SELECT * FROM public_action_history').toArray());
    }
    if (new URL(request.url).pathname === '/native-test/clock') {
      clockOffset = Number(new URL(request.url).searchParams.get('offset'));
      return Response.json({ now: Date.now() });
    }
    if (new URL(request.url).pathname === '/native-test/fail-storage' && request.method === 'POST') {
      this.ctx.storage.sql.exec('DROP TABLE receipts');
      return new Response(null, { status: 204 });
    }
    if (new URL(request.url).pathname === '/native-test/exec' && request.method === 'POST') {
      /* Seeds rows a previous release wrote, so a test can prove how the current one reads them. */
      const { statement, params } = (await request.json()) as { statement: string; params: unknown[] };
      return Response.json(this.ctx.storage.sql.exec(statement, ...(params as SqlStorageValue[])).toArray());
    }
    if (new URL(request.url).pathname === '/native-test/capture' && request.method === 'POST') {
      /* Drives the capture seams creation and assignment will call, on the isolated fixture only. */
      const body = (await request.json()) as {
        kind: 'ruleset' | 'faction';
        id: string;
        extras?: ExtraReference[];
        provisional?: boolean;
      };
      try {
        const record =
          body.kind === 'ruleset'
            ? await this.retainRulesetCapture(body.id, { provisional: body.provisional })
            : await this.retainFactionCapture(body.id, body.extras ?? [], { provisional: body.provisional });
        return Response.json({ ok: true, record });
      } catch (error) {
        return Response.json(
          { ok: false, message: error instanceof Error ? error.message : 'failed' },
          { status: 409 }
        );
      }
    }
    if (new URL(request.url).pathname === '/native-test/captures') {
      return Response.json(this.retainedCaptures());
    }
    if (new URL(request.url).pathname !== '/native-test/alarm') {
      return super.fetch(request);
    }
    const scheduledAt = await this.ctx.storage.getAlarm();
    const observedAt = Date.now();
    if (request.method === 'POST' && scheduledAt !== null) {
      /* Native workerd schedules against the real clock; the handler observes the test clock offset. */
      await this.ctx.storage.setAlarm(realNow());
    }
    return Response.json({ scheduledAt, observedAt });
  }
}

export default worker;
