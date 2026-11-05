/*
 * Stands between the local game Worker and the local Convex backend, and answers the Worker's catalogue questions about one
 * ruleset from a mirror (see mirror.ts). Everything else, from provisioning to seat passes, goes to the backend unchanged.
 * So a local game is created on the local ruleset as usual, but drafts, deals and supplies the mirrored decks and factions.
 */
import { createServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';

import { convexToJson } from 'convex/values';
import type { Value } from 'convex/values';

import { mirrorAnswer } from './mirror';
import type { Mirror } from './mirror';

function readBody(request: IncomingMessage) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

/** The answer a query asks the mirror for, or undefined when the backend should answer it. */
export function mirroredQuery(mirror: Mirror, localRulesetId: string, url: string, body: Buffer) {
  if (!/^\/api\/query\/?$/u.test(new URL(url, 'http://local').pathname)) {
    return undefined;
  }
  try {
    const request = JSON.parse(body.toString('utf8')) as { path?: string; args?: unknown };
    const args = (Array.isArray(request.args) ? request.args[0] : request.args) as Record<string, unknown>;
    if (typeof request.path !== 'string' || !request.path.startsWith('playCatalogue:') || !args) {
      return undefined;
    }
    return mirrorAnswer(mirror, localRulesetId, request.path.replace(/\.js$/u, ''), args);
  } catch {
    return undefined;
  }
}

export async function startCatalogueProxy({
  mirror,
  backendUrl,
  localRulesetId,
  port = 0,
}: {
  mirror: Mirror;
  backendUrl: string;
  /** The local ruleset the person creates games on; reads of it are answered from the mirror. */
  localRulesetId: () => string | undefined;
  port?: number;
}) {
  const server = createServer((request, response) => {
    void (async () => {
      const body = await readBody(request);
      const rulesetId = localRulesetId();
      const answer = rulesetId ? mirroredQuery(mirror, rulesetId, request.url ?? '/', body) : undefined;
      if (answer !== undefined) {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ status: 'success', value: convexToJson(answer as Value), logLines: [] }));
        return;
      }
      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers)) {
        if (typeof value === 'string' && !['host', 'connection', 'content-length'].includes(name)) {
          headers.set(name, value);
        }
      }
      const forwarded = await fetch(new URL(request.url ?? '/', backendUrl), {
        method: request.method,
        headers,
        body: ['GET', 'HEAD'].includes(request.method ?? 'GET') ? undefined : new Uint8Array(body),
        redirect: 'manual',
      });
      const out: Record<string, string> = {};
      forwarded.headers.forEach((value, name) => {
        if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(name)) {
          out[name] = value;
        }
      });
      response.writeHead(forwarded.status, out);
      response.end(Buffer.from(await forwarded.arrayBuffer()));
    })().catch((error: unknown) => {
      response.writeHead(502, { 'Content-Type': 'text/plain' });
      response.end(`Catalogue proxy: ${String(error)}`);
    });
  });
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  const { port: bound } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${bound}`, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}
