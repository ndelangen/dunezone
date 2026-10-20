/** Local entry point only. The production configuration never references this file. */
import { publisherTransportUrl } from './config';
import publisherWorker from './index';

function assertLocalReviewEnvironment(env: Env & { LOCAL_REVIEW?: string }) {
  if (env.LOCAL_REVIEW !== 'isolated-local-v1') {
    throw new Error('The local publisher requires its isolated review configuration');
  }
  for (const name of [
    'PUBLIC_BASE_URL',
    'USER_IMAGE_PUBLIC_BASE_URL',
    'CAPTURE_BASE_URL',
    'CONVEX_EXECUTOR_BASE_URL',
    'CONVEX_AUTH_BASE_URL',
    'CONVEX_RENDER_URL',
    'CONVEX_CLOUD_BASE_URL',
  ] as const) {
    publisherTransportUrl(name, env[name], env);
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    assertLocalReviewEnvironment(env);
    const pathname = new URL(request.url).pathname;
    if (pathname === '/__play' || pathname.startsWith('/__play/')) {
      return new Response('Play is unavailable in the isolated review runtime', { status: 404 });
    }
    return publisherWorker.fetch(request, env, ctx);
  },
  async scheduled(controller: ScheduledController, env: Env) {
    assertLocalReviewEnvironment(env);
    return publisherWorker.scheduled(controller, env);
  },
};
