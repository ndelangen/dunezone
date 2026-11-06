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

import { MIRROR_COMPONENT_REVISION, mirrorAnswer, mirroredLeaders } from './mirror';
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

/**
 * Stands between the local publisher and the backend's executor routes, and tells the publisher that each mirrored Leader
 * is published, under the revision its image was installed at locally. Every other request goes to the backend unchanged.
 */
export async function startExecutorProxy({ mirror, siteUrl, port = 0 }: { mirror: Mirror; siteUrl: string; port?: number }) {
  const leaders = new Set(mirroredLeaders(mirror.file).map((leader) => leader.assetId));
  const publishedAt = Date.parse(mirror.file.pulledAt) || Date.now();
  const server = createServer((request, response) => {
    void (async () => {
      const body = await readBody(request);
      if (request.method === 'POST' && /\/component\/resolve-delivery\/?$/u.test(new URL(request.url ?? '/', 'http://local').pathname)) {
        const asked = JSON.parse(body.toString('utf8') || '{}') as { assetId?: string; assetType?: string };
        if (asked.assetId && leaders.has(asked.assetId) && (asked.assetType ?? 'faction-leader') === 'faction-leader') {
          response.writeHead(200, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ ok: true, status: 'found', revision: MIRROR_COMPONENT_REVISION, publishedAt }));
          return;
        }
      }
      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers)) {
        if (typeof value === 'string' && !['host', 'connection', 'content-length'].includes(name)) {
          headers.set(name, value);
        }
      }
      const forwarded = await fetch(new URL(request.url ?? '/', siteUrl), {
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
      response.end(`Executor proxy: ${String(error)}`);
    });
  });
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  const { port: bound } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${bound}`, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}
