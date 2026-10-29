import { bugReportDownload } from './bugReportHttp';

/** Service responses do not open a room or invoke its authenticated callbacks. */
export async function gameServiceResponse(request: Request, env: GameEnv): Promise<Response | undefined> {
  if (new URL(request.url).pathname === '/__play/health' && request.method === 'GET') {
    return Response.json(
      {
        ok: true,
        identity: {
          gitSha: env.GIT_SHA,
          workerVersionId: env.CF_VERSION_METADATA.id,
          workerVersionTag: env.CF_VERSION_METADATA.tag,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }
  return await bugReportDownload(request, env);
}
