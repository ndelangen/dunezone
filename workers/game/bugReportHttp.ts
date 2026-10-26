import { bugReportIdSchema } from '../../src/shared/play/bugReports';

export const bugReportGamePathPattern = /^\/__play\/games\/([a-zA-Z0-9_-]{1,128})\/(reports)$/u;

export function isBugReportRequest(request: Request, applicationOrigin: string) {
  if (request.method !== 'POST') {
    return false;
  }
  if (request.headers.get('Origin') !== applicationOrigin) {
    return false;
  }
  const url = new URL(request.url);
  if (url.origin !== applicationOrigin || url.search) {
    return false;
  }
  return request.headers.get('Content-Type')?.split(';')[0] === 'application/json';
}

export async function bugReportDownload(request: Request, env: GameEnv): Promise<Response | undefined> {
  if (request.method !== 'GET') {
    return;
  }
  const route = /^\/__play\/reports\/([a-f0-9-]{36})\/state\.json$/u.exec(new URL(request.url).pathname);
  if (!route) {
    return;
  }
  const parsed = bugReportIdSchema.safeParse(route[1]);
  if (!parsed.success) {
    return;
  }
  const object = await env.BUG_REPORT_STATES.get(`reports/${parsed.data}.json`);
  if (!object) {
    return Response.json({ error: 'Report state not found.' }, { status: 404 });
  }
  return new Response(object.body, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="dunezone-report-${parsed.data}.json"`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
      'Cache-Control': 'no-store',
    },
  });
}
