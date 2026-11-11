const realNow = Date.now;
let clockOffset = 0;
Date.now = () => realNow() + clockOffset;

import { ActorDirectory } from './actors';
import worker, { GameRoom as ProductionGameRoom } from './index';
import { RemovalVotes } from './removal';

/* Lets a runtime bind the real report coordinator beside the real room. */
export { BugReports } from './index';

/** Counts the public vote projections and the roster reads they request. */
function observeRemovalVotes() {
  const counts = { projections: 0, rosterReads: 0 };
  const current = RemovalVotes.prototype.current;
  const occupants = ActorDirectory.prototype.occupants;
  RemovalVotes.prototype.current = function () {
    counts.projections++;
    ActorDirectory.prototype.occupants = function () {
      counts.rosterReads++;
      return occupants.call(this);
    };
    try {
      return current.call(this);
    } finally {
      ActorDirectory.prototype.occupants = occupants;
    }
  };
  return () => {
    RemovalVotes.prototype.current = current;
    return counts;
  };
}

export class GameRoom extends ProductionGameRoom {
  private finishRemovalVoteObservation?: ReturnType<typeof observeRemovalVotes>;

  override async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname === '/native-test/removal-vote-reads') {
      const counts = this.finishRemovalVoteObservation?.();
      this.finishRemovalVoteObservation = request.method === 'POST' ? observeRemovalVotes() : undefined;
      return counts ? Response.json(counts) : new Response(null, { status: 204 });
    }
    if (new URL(request.url).pathname === '/native-test/audit') {
      return Response.json(this.ctx.storage.sql.exec('SELECT * FROM public_action_history').toArray());
    }
    if (new URL(request.url).pathname === '/native-test/clock') {
      clockOffset = Number(new URL(request.url).searchParams.get('offset'));
      return Response.json({ now: Date.now() });
    }
    if (new URL(request.url).pathname === '/native-test/sweeping') {
      return Response.json({ sweeping: this.sweeping });
    }
    if (new URL(request.url).pathname === '/native-test/socket-protocol' && request.method === 'POST') {
      /* Models attachments saved by a different Worker release before hibernation. */
      const protocol = new URL(request.url).searchParams.get('version');
      for (const socket of this.ctx.getWebSockets()) {
        const attachment = socket.deserializeAttachment() as Record<string, unknown>;
        if (protocol === null) {
          delete attachment.protocol;
        } else {
          attachment.protocol = Number(protocol);
        }
        socket.serializeAttachment(attachment);
      }
      return new Response(null, { status: 204 });
    }
    if (new URL(request.url).pathname === '/native-test/forget-quiet' && request.method === 'POST') {
      /* Stands in for a restart while the sweep ran, which a forced eviction with a live timer cannot model. */
      this.ctx.storage.kv.delete('quiet');
      return new Response(null, { status: 204 });
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
      /* Drives the capture seams provisioning and assignment call, on the isolated fixture only. */
      const body = (await request.json()) as {
        kind: 'ruleset' | 'faction';
        id: string;
        provisional?: boolean;
      };
      try {
        const record =
          body.kind === 'ruleset'
            ? await this.retainRulesetCapture(body.id, { provisional: body.provisional })
            : await this.retainFactionCapture(body.id, { provisional: body.provisional });
        return Response.json({ ok: true, record });
      } catch (error) {
        return Response.json(
          { ok: false, message: error instanceof Error ? error.message : 'failed' },
          { status: 409 }
        );
      }
    }
    if (new URL(request.url).pathname === '/native-test/report-rpc' && request.method === 'POST') {
      /* Calls a report RPC on the named room over a real Durable Object stub, as the report coordinator does, and reports what crossed back. */
      const call = (await request.json()) as {
        room: string;
        method: 'captureBugReport' | 'finishBugReport';
        args: [string, string, string, never];
      };
      const room = this.env.GAME_ROOMS.getByName(call.room);
      try {
        const result =
          call.method === 'captureBugReport'
            ? await room.captureBugReport(...call.args)
            : await room.finishBugReport(...call.args);
        return Response.json({ ok: true, result: result ?? null });
      } catch (error) {
        return Response.json({ ok: false, message: error instanceof Error ? error.message : String(error) });
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
    return Response.json({ scheduledAt, observedAt, directoryRetryAt: this.directoryRetryAt });
  }
}

export default worker;
