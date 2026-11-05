import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { expect, it } from 'vite-plus/test';

import { serveSeatRequest } from './tool-server';
import type { SeatTools } from './tool-server';

const seat = (name: string): SeatTools =>
  ({
    tools: [{ name: 'look', description: 'Look', inputSchema: { type: 'object' }, run: async () => name }],
    callTool: async () => ({ text: `${name} looked`, isError: false }),
  }) as unknown as SeatTools;

it('serves each seat its own tools over one MCP endpoint, by the token in the connection header', async () => {
  const seats = new Map([
    ['token-alex', seat('Alex')],
    ['token-sam', seat('Sam')],
  ]);
  const server = createServer((request, response) => void serveSeatRequest(request, response, (token) => seats.get(token)));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
  const call = async (token: string, body: unknown) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: response.status === 200 ? ((await response.json()) as Record<string, any>) : null };
  };
  const look = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'look', arguments: {} } };

  expect((await call('token-alex', look)).body?.result.content[0].text).toBe('Alex looked');
  expect((await call('token-sam', look)).body?.result.content[0].text).toBe('Sam looked');
  expect((await call('someone-else', look)).status).toBe(401);
  expect((await call('token-alex', { jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202);
  const init = await call('token-alex', { jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
  expect(init.body?.result.capabilities).toEqual({ tools: {} });
  expect((await call('token-alex', { jsonrpc: '2.0', id: 2, method: 'tools/list' })).body?.result.tools[0].name).toBe('look');
  /* A seat that ended is refused, as an unknown one is. */
  seats.delete('token-sam');
  expect((await call('token-sam', look)).status).toBe(401);
  server.close();
});
