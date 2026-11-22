import { playGamePathPattern } from '../../src/shared/play/callbacks';
import { bugReportGamePathPattern } from './bugReportHttp';

/* The game room's HTTP helpers: responses, which requests reach a room, and bounded body reads. */
export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export const refused = () => json({ error: 'Request refused.' }, 403);
export function isApplicationSocket(request: Request, applicationOrigin: string): boolean {
  return (
    request.headers.get('Origin') === applicationOrigin && request.headers.get('Upgrade')?.toLowerCase() === 'websocket'
  );
}
export function gameRequest(request: Request, applicationOrigin: string) {
  const url = new URL(request.url);
  if (url.origin !== applicationOrigin || url.search) {
    return;
  }
  const match = playGamePathPattern.exec(url.pathname) ?? bugReportGamePathPattern.exec(url.pathname);
  if (!match) {
    return;
  }
  const [, gameId, operation] = match;
  const method = operation === 'socket' ? 'GET' : 'POST';
  if (request.method !== method) {
    return;
  }
  return { gameId, operation };
}
export const credentialsMatch = (a: string, b: string) => {
  if (a.length !== 64 || b.length !== 64) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < 64; index++) {
    difference |= a.codePointAt(index)! ^ b.codePointAt(index)!;
  }
  return difference === 0;
};
/** A request body as its schema reads it, or undefined when it is missing, oversized, not JSON or not that shape. */
export async function readRequest<T>(
  request: Request,
  schema: { parse(value: unknown): T },
  limit = 8192
): Promise<T | undefined> {
  if (!request.body || Number(request.headers.get('Content-Length') ?? 0) > limit) {
    return undefined;
  }
  try {
    return schema.parse(JSON.parse(await readLimitedBody(request.body, limit)));
  } catch {
    return undefined;
  }
}
async function readLimitedBody(body: ReadableStream<Uint8Array>, limit: number): Promise<string> {
  const reader = body.getReader();
  let length = 0;
  let text = '';
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      length += value.byteLength;
      if (length > limit) {
        throw new Error('Request refused.');
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
