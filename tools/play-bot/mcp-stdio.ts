/*
 * A minimal MCP server over stdio that forwards to a running bot's tool server.
 * The agent CLI starts it: `bun tools/play-bot/mcp-stdio.ts` with PLAY_BOT_TOOLS_URL and PLAY_BOT_TOOLS_TOKEN set.
 * It speaks just enough of MCP for tools: initialize, tools/list, tools/call and ping.
 */
import { createInterface } from 'node:readline';

const url = process.env.PLAY_BOT_TOOLS_URL;
const token = process.env.PLAY_BOT_TOOLS_TOKEN;
if (!url || !token) {
  console.error('PLAY_BOT_TOOLS_URL and PLAY_BOT_TOOLS_TOKEN must be set.');
  process.exit(1);
}
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

type Request = { jsonrpc: '2.0'; id?: number | string; method: string; params?: Record<string, unknown> };

function send(message: unknown) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

async function answer(request: Request): Promise<unknown> {
  switch (request.method) {
    case 'initialize':
      return {
        protocolVersion: (request.params?.protocolVersion as string | undefined) ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'dune-play-bot', version: '0.1.0' },
      };
    case 'ping':
      return {};
    case 'tools/list': {
      const response = await fetch(`${url}/tools`, { headers });
      return { tools: await response.json() };
    }
    case 'tools/call': {
      const response = await fetch(`${url}/call`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: request.params?.name, arguments: request.params?.arguments ?? {} }),
      });
      const result = (await response.json()) as { text: string; isError: boolean };
      return { content: [{ type: 'text', text: result.text }], isError: result.isError };
    }
    default:
      throw Object.assign(new Error(`Method not found: ${request.method}`), { code: -32601 });
  }
}

const lines = createInterface({ input: process.stdin });
lines.on('line', (line) => {
  if (!line.trim()) {
    return;
  }
  let request: Request;
  try {
    request = JSON.parse(line) as Request;
  } catch {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    return;
  }
  if (request.id === undefined) {
    return; // A notification, such as notifications/initialized, needs no answer.
  }
  answer(request).then(
    (result) => send({ jsonrpc: '2.0', id: request.id, result }),
    (error: Error & { code?: number }) =>
      send({ jsonrpc: '2.0', id: request.id, error: { code: error.code ?? -32603, message: error.message } })
  );
});
lines.on('close', () => process.exit(0));
