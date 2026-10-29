export { default } from './game-room.native.fixture';
import { GameRoom as NativeGameRoom } from './game-room.native.fixture';
import { failNextLoad, loadFailure } from './sqlite-recovery-session.native.fixture';

export class GameRoom extends NativeGameRoom {
  override async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === '/native-test/fail-next-load' && request.method === 'POST') {
      failNextLoad();
      return new Response(null, { status: 204 });
    }
    if (path === '/native-test/load-failure') {
      return Response.json({ message: loadFailure() });
    }
    return super.fetch(request);
  }
}
