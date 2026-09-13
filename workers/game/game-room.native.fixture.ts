const realNow = Date.now;
let clockOffset = 0;
Date.now = () => realNow() + clockOffset;

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
    if (new URL(request.url).pathname !== '/native-test/alarm') {
      return super.fetch(request);
    }
    const scheduledAt = await this.ctx.storage.getAlarm();
    const observedAt = Date.now();
    if (request.method === 'POST' && scheduledAt !== null) {
      /* Advance only an existing alarm; native workerd still delivers the real handler. */
      await this.ctx.storage.setAlarm(observedAt);
    }
    return Response.json({ scheduledAt, observedAt });
  }
}

export default worker;
