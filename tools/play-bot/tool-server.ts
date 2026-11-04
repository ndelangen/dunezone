/*
 * The bot's tools over loopback HTTP, so a command-line agent (Claude Code, Codex) can reach them through the small
 * MCP bridge in `mcp-stdio.ts`. It listens on 127.0.0.1 only and needs the per-run token the bridge is given.
 */
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { PlayBot } from './bot';

export async function serveTools(bot: PlayBot) {
  const token = randomUUID();
  const server = createServer((request, response) => {
    const reply = (status: number, body: unknown) => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(body));
    };
    if (request.headers.authorization !== `Bearer ${token}`) {
      reply(401, { error: 'unauthorized' });
      return;
    }
    if (request.method === 'GET' && request.url === '/tools') {
      reply(
        200,
        bot.tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))
      );
      return;
    }
    if (request.method === 'POST' && request.url === '/call') {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', (chunk: string) => (body += chunk));
      request.on('end', () => {
        void (async () => {
          try {
            const { name, arguments: args } = JSON.parse(body) as { name: string; arguments?: Record<string, unknown> };
            reply(200, await bot.callTool(name, args ?? {}));
          } catch (error) {
            reply(200, { text: error instanceof Error ? error.message : String(error), isError: true });
          }
        })();
      });
      return;
    }
    reply(404, { error: 'not found' });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    token,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
