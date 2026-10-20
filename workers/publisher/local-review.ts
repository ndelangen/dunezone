/** Local entry point only. The production configuration never references this file. */
import { CAPTURE_PROTOCOL } from '../../src/shared/asset-publishing/capture-protocol';
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
    const cookies = request.headers.get('Cookie');
    if (cookies) {
      const names = [
        CAPTURE_PROTOCOL.credentials.jobCookie,
        CAPTURE_PROTOCOL.credentials.deadlineCookie,
        CAPTURE_PROTOCOL.credentials.rulebookPdfCookie,
      ];
      const headers = new Headers(request.headers);
      headers.set(
        'Cookie',
        cookies
          .split(';')
          .map((part) => {
            const value = part.trim();
            const name = names.find((candidate) => value.startsWith(`${candidate.replace('__Host-', 'local-')}=`));
            return name ? `${name}=${value.slice(value.indexOf('=') + 1)}` : value;
          })
          .join('; ')
      );
      request = new Request(request, { headers });
    }
    return publisherWorker.fetch(request, env, ctx);
  },
  async scheduled(controller: ScheduledController, env: Env) {
    assertLocalReviewEnvironment(env);
    return publisherWorker.scheduled(controller, env);
  },
};
