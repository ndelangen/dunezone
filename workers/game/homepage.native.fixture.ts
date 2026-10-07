import { HomepageRoom as ProductionHomepageRoom } from './homepage';
import worker from './index';

const realNow = Date.now;
let offset = 0;
let fixedNow: number | undefined;
Date.now = () => fixedNow ?? realNow() + offset;

export class HomepageRoom extends ProductionHomepageRoom {
  override async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname === '/native-test/clock') {
      fixedNow = url.searchParams.has('now') ? Number(url.searchParams.get('now')) : undefined;
      offset = Number(url.searchParams.get('offset'));
      await this.alarm();
      return Response.json({ now: Date.now() });
    }
    return super.fetch(request);
  }
}

export default {
  fetch(request: Parameters<typeof worker.fetch>[0], env: GameEnv) {
    if (new URL(request.url).pathname.startsWith('/native-test/')) {
      return env.HOMEPAGE_ROOMS.getByName('public-homepage').fetch(request);
    }
    return worker.fetch(request, env);
  },
};
