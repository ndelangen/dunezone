/*
 * A seat's tools over loopback HTTP, for the agent CLI that thinks for it. Every request names its seat by a bearer
 * token, which the harness puts in the CLI's MCP config: the model never sees it, so it cannot use or leak another seat's.
 *
 * Two ways in, same tools:
 * - `POST /mcp`: MCP's Streamable HTTP transport, answered as plain JSON (initialize, tools/list, tools/call, ping).
 *   Claude Code connects here directly.
 * - `GET /tools` and `POST /call`: what the stdio bridge (`mcp-stdio.ts`) forwards to, for a CLI that only starts
 *   stdio MCP servers.
 * It listens on 127.0.0.1 only.
 */
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { PlayBot } from './bot';

export type SeatTools = Pick<PlayBot, 'tools' | 'callTool'>;
export type ToolEndpoint = { url: string; token: string; close: () => Promise<void> };

type RpcRequest = { jsonrpc: '2.0'; id?: number | string | null; method: string; params?: Record<string, unknown> };

async function rpc(seat: SeatTools, request: RpcRequest): Promise<unknown> {
  switch (request.method) {
    case 'initialize':
      return {
        protocolVersion: (request.params?.protocolVersion as string | undefined) ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'dune-play-seat', version: '0.2.0' },
      };
    case 'ping':
      return {};
    case 'tools/list':
      return { tools: seat.tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) };
    case 'tools/call': {
      const result = await seat.callTool(
        String(request.params?.name),
        (request.params?.arguments as Record<string, unknown> | undefined) ?? {}
      );
      return { content: [{ type: 'text', text: result.text }], isError: result.isError };
    }
    default:
      throw Object.assign(new Error(`Method not found: ${request.method}`), { code: -32601 });
  }
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Answers one request for the seat its bearer token names; `seatFor` returns undefined for an unknown token. */
export async function serveSeatRequest(
  request: IncomingMessage,
  response: ServerResponse,
  seatFor: (token: string) => SeatTools | undefined
) {
  const reply = (status: number, body?: unknown) => {
    response.writeHead(status, body === undefined ? {} : { 'Content-Type': 'application/json' });
    response.end(body === undefined ? undefined : JSON.stringify(body));
  };
  const token = /^Bearer (.+)$/u.exec(request.headers.authorization ?? '')?.[1];
  const seat = token ? seatFor(token) : undefined;
  if (!seat) {
    reply(401, { error: 'unauthorized' });
    return;
  }
  const url = (request.url ?? '').split('?')[0];
  if (url === '/mcp') {
    if (request.method !== 'POST') {
      /* No server-to-client stream: every answer comes back on its own request. */
      reply(405);
      return;
    }
    let parsed: RpcRequest | RpcRequest[];
    try {
      parsed = JSON.parse(await readBody(request)) as RpcRequest | RpcRequest[];
    } catch {
      reply(400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      return;
    }
    const answer = async (entry: RpcRequest) => {
      try {
        return { jsonrpc: '2.0', id: entry.id, result: await rpc(seat, entry) };
      } catch (error) {
        const failure = error as Error & { code?: number };
        return { jsonrpc: '2.0', id: entry.id, error: { code: failure.code ?? -32603, message: failure.message } };
      }
    };
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    const calls = entries.filter((entry) => entry.id !== undefined && entry.id !== null);
    if (!calls.length) {
      /* Only notifications, such as notifications/initialized. */
      reply(202);
      return;
    }
    const answers = await Promise.all(calls.map(answer));
    reply(200, Array.isArray(parsed) ? answers : answers[0]);
    return;
  }
  if (request.method === 'GET' && url === '/tools') {
    reply(200, seat.tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })));
    return;
  }
  if (request.method === 'POST' && url === '/call') {
    try {
      const { name, arguments: args } = JSON.parse(await readBody(request)) as {
        name: string;
        arguments?: Record<string, unknown>;
      };
      reply(200, await seat.callTool(name, args ?? {}));
    } catch (error) {
      reply(200, { text: error instanceof Error ? error.message : String(error), isError: true });
    }
    return;
  }
  reply(404, { error: 'not found' });
}

/** A server of its own for one bot and one wake, for a bot that runs without the harness (the demos, `play:bot`). */
export async function serveTools(bot: SeatTools): Promise<ToolEndpoint> {
  const token = randomUUID();
  const server = createServer(
    (request, response) => void serveSeatRequest(request, response, (given) => (given === token ? bot : undefined))
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    token,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
