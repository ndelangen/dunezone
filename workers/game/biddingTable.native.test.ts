import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import type { WebSocket as NativeWebSocket } from 'miniflare';
import { afterEach, beforeAll, beforeEach, expect, test } from 'vite-plus/test';

import {
  BIDDING_FRAME_BYTES,
  BIDDING_PING,
  BIDDING_PONG,
  BIDDING_REFUSED,
  BIDDING_REPLACED,
  biddingServerFrameSchema,
} from '../../src/shared/tools/biddingTransport';
import type { BiddingServerFrame } from '../../src/shared/tools/biddingTransport';

const origin = 'https://dune.zone';
const code = 'DUNE42';
const identity = { tableId: crypto.randomUUID(), centralSecret: 'a'.repeat(64) };
const device = () => ({ id: crypto.randomUUID(), secret: crypto.randomUUID().replaceAll('-', '').repeat(2) });
let script: string;
let worker: Miniflare;
let persistence: string;
const sockets: NativeWebSocket[] = [];
beforeAll(async () => {
  const result = await build({
    entryPoints: ['workers/game/biddingTable.native.fixture.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    external: ['cloudflare:workers'],
  });
  script = result.outputFiles[0]!.text;
}, 15_000);
async function start() {
  worker = new Miniflare(
    convertV4MiniflareOptions({
      resourcePersistencePath: persistence,
      modules: true,
      script,
      compatibilityDate: '2026-08-11',
      compatibilityFlags: ['nodejs_compat'],
      durableObjects: { BIDDING_TABLES: { className: 'BiddingTable', useSQLite: true } },
      bindings: { APPLICATION_ORIGIN: origin },
    })
  );
  await worker.ready;
}
beforeEach(async () => {
  persistence = await mkdtemp(join(tmpdir(), 'bidding-native-'));
  await start();
});
afterEach(async () => {
  for (const socket of sockets.splice(0)) {
    socket.close();
  }
  await worker.dispose();
  await rm(persistence, { recursive: true, force: true });
});
const create = (body: unknown = identity, extra: Record<string, string> = {}) =>
  worker.dispatchFetch(`${origin}/__play/bidding/${code}/create`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', ...extra },
    body: JSON.stringify(body),
  });
async function socket() {
  const response = await worker.dispatchFetch(`${origin}/__play/bidding/${code}/socket`, {
    headers: { Origin: origin, Upgrade: 'websocket' },
  });
  expect(response.status, response.status === 101 ? '' : await response.text()).toBe(101);
  const ws = response.webSocket!;
  sockets.push(ws);
  ws.accept();
  const queued: (BiddingServerFrame | string)[] = [];
  ws.addEventListener('message', (event) => {
    if (typeof event.data !== 'string') {
      throw new Error('Unexpected binary frame.');
    }
    const data = event.data;
    if (data === BIDDING_PONG) {
      queued.push(data);
    } else {
      queued.push(biddingServerFrameSchema.parse(JSON.parse(data)));
    }
  });
  return {
    ws,
    send: (frame: unknown) => ws.send(JSON.stringify(frame)),
    async next(type: string): Promise<BiddingServerFrame | string> {
      const until = Date.now() + 3000;
      for (;;) {
        const at = queued.findIndex((frame) => (typeof frame === 'string' ? frame === type : frame.type === type));
        if (at >= 0) {
          return queued.splice(at, 1)[0]!;
        }
        if (Date.now() > until) {
          throw new Error(`No ${type} frame received.`);
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    },
    closed: new Promise<number>((resolve) => ws.addEventListener('close', (event) => resolve(event.code))),
  };
}
async function central(generation = 1, centralInstanceId = crypto.randomUUID()) {
  const connection = await socket();
  connection.send({
    type: 'join',
    role: 'central',
    ...identity,
    centralInstanceId,
    generation,
    device: device(),
  });
  await connection.next('welcome');
  return { ...connection, centralInstanceId, generation };
}
async function remote(held = device()) {
  const connection = await socket();
  connection.send({ type: 'join', role: 'remote', device: held });
  const welcome = await connection.next('welcome');
  expect(welcome).toMatchObject({ tableId: identity.tableId });
  return { ...connection, device: held };
}

test('reserves codes atomically, permits a lost-response retry, and rejects a collision and foreign origin', async () => {
  const first = await create();
  expect(first.status).toBe(201);
  expect((await create()).status).toBe(200);
  expect((await create({ tableId: crypto.randomUUID(), centralSecret: 'b'.repeat(64) })).status).toBe(409);
  expect((await create(identity, { Origin: 'https://elsewhere.test' })).status).toBe(403);
  expect((await create({ ...identity, centralSecret: 'b'.repeat(513) })).status).toBe(413);
});

test('authenticates central replacement and device reconnection without treating a known id as a capability', async () => {
  await create();
  const owner = await central();
  const phone = await remote();
  const intruder = await socket();
  intruder.send({
    type: 'join',
    role: 'central',
    tableId: identity.tableId,
    centralSecret: 'b'.repeat(64),
    device: device(),
  });
  expect(await intruder.closed).toBe(BIDDING_REFUSED);
  const forged = await socket();
  forged.send({ type: 'join', role: 'remote', device: { ...phone.device, secret: 'f'.repeat(64) } });
  expect(await forged.closed).toBe(BIDDING_REFUSED);
  const resumed = await remote(phone.device);
  expect(await phone.closed).toBe(BIDDING_REPLACED);
  const newOwner = await central(2);
  expect(await owner.closed).toBe(BIDDING_REPLACED);
  const staleOwner = await socket();
  staleOwner.send({
    type: 'join',
    role: 'central',
    ...identity,
    centralInstanceId: owner.centralInstanceId,
    generation: 1,
    device: device(),
  });
  expect(await staleOwner.closed).toBe(BIDDING_REPLACED);
  resumed.send({ type: 'relay', to: 'central', packet: { kind: 'app', data: { bid: 4 } } });
  expect(await newOwner.next('relay')).toMatchObject({ from: phone.device.id, packet: { data: { bid: 4 } } });
});

test('relays only between central and remotes, supports selected fanout, and answers keepalives', async () => {
  await create();
  const owner = await central();
  const a = await remote();
  const b = await remote();
  owner.send({ type: 'relay', to: [a.device.id, b.device.id], packet: { kind: 'app', data: { revision: 3 } } });
  for (const phone of [a, b]) {
    expect(await phone.next('relay')).toMatchObject({ from: 'central', packet: { data: { revision: 3 } } });
  }
  a.ws.send(BIDDING_PING);
  expect(await a.next(BIDDING_PONG)).toBe(BIDDING_PONG);
  a.send({ type: 'relay', to: b.device.id, packet: { kind: 'app', data: { forged: true } } });
  expect(await a.closed).toBe(BIDDING_REFUSED);
  b.send({ type: 'relay', to: 'central', packet: { kind: 'app', data: 'still connected' } });
  expect(await owner.next('relay')).toMatchObject({ from: b.device.id, packet: { data: 'still connected' } });
});

test('bounds UTF-8 frames and rejects unauthenticated commands', async () => {
  await create();
  const unauthenticated = await socket();
  unauthenticated.send({ type: 'relay', to: 'central', packet: { kind: 'app', data: 1 } });
  expect(await unauthenticated.closed).toBe(BIDDING_REFUSED);
  const phone = await remote();
  phone.send({ type: 'relay', to: 'central', packet: { kind: 'app', data: '🌵'.repeat(BIDDING_FRAME_BYTES / 4) } });
  expect(await phone.closed).toBe(1009);
});

test('keeps ownership and device capabilities after the object restarts', async () => {
  await create();
  await central();
  const phone = await remote();
  const heldDevice = phone.device;
  for (const open of sockets.splice(0)) {
    open.close();
  }
  await worker.dispose();
  await start();
  expect((await create()).status).toBe(200);
  const owner = await central(2);
  const resumed = await remote(heldDevice);
  resumed.send({ type: 'relay', to: 'central', packet: { kind: 'app', data: 'restored' } });
  expect(await owner.next('relay')).toMatchObject({ from: heldDevice.id, packet: { data: 'restored' } });
  const forged = await socket();
  forged.send({ type: 'join', role: 'remote', device: { ...heldDevice, secret: 'e'.repeat(64) } });
  expect(await forged.closed).toBe(BIDDING_REFUSED);
});

test('a simultaneous code collision reserves exactly one identity', async () => {
  const other = { tableId: crypto.randomUUID(), centralSecret: 'd'.repeat(64) };
  const results = await Promise.all([create(), create(other)]);
  expect(results.map((result) => result.status).sort((a, b) => a - b)).toEqual([201, 409]);
  const retries = await Promise.all([create(), create(other)]);
  expect(retries.map((result) => result.status)).toEqual(results.map((result) => (result.status === 201 ? 200 : 409)));
});

test('admits 24 simultaneous remotes and their central response burst without disconnecting the table', async () => {
  await create();
  const owner = await central();
  const phones = await Promise.all(Array.from({ length: 24 }, () => remote()));
  for (const phone of phones) {
    for (let response = 0; response < 3; response++) {
      owner.send({ type: 'relay', to: phone.device.id, packet: { kind: 'app', data: { response } } });
    }
  }
  await Promise.all(
    phones.map(async (phone) => {
      for (let response = 0; response < 3; response++) {
        expect(await phone.next('relay')).toMatchObject({ from: 'central', packet: { data: { response } } });
      }
    })
  );
  const overflow = await socket();
  overflow.send({ type: 'join', role: 'remote', device: device() });
  expect(await overflow.closed).toBe(BIDDING_REFUSED);
  phones[0]!.send({ type: 'relay', to: 'central', packet: { kind: 'app', data: 'still connected' } });
  expect(await owner.next('relay')).toMatchObject({ packet: { data: 'still connected' } });
});
