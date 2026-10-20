/** Local entry point only. The production configuration never references this file. */
import publisherWorker from './index';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/__play' || pathname.startsWith('/__play/')) {
      return new Response('Play is unavailable in the isolated review runtime', { status: 404 });
    }
    return publisherWorker.fetch(request, env, ctx);
  },
  async scheduled(controller: ScheduledController, env: Env) {
    return publisherWorker.scheduled(controller, env);
  },
};
