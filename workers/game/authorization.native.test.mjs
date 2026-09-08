import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPeer, createRuntime, eventually } from './native-runtime.fixture.mjs';

describe('AuthorizationWatch in native workerd with the real Convex clients', () => {
  let peer;
  let runtime;
  beforeEach(async () => {
    peer = await createPeer();
    runtime = await createRuntime(peer);
    await runtime.request('/start');
    await peer.query();
  });
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });
  const status = async () => (await runtime.request('/status')).status;
  const waitStatus = (value) => eventually(async () => (await status()) === value, value);
  const authorize = async () => {
    const query = await peer.query();
    peer.answer(query);
    await waitStatus('authorized');
    return query;
  };

  it('uses native WebSocket and uncached HTTP without forwarding client authentication', async () => {
    const state = await runtime.request('/status');
    expect(state.runtime.hasWindow).toBe(false);
    expect(state.runtime.userAgent).toContain('Cloudflare-Workers');
    expect(peer.connections[0].path).toMatch(/^\/api\/[^/]+\/sync$/);
    expect(await status()).toBe('suspended');
    const query = await authorize();
    const before = peer.requests.length;
    peer.answer(query, true, Date.now() + 55_000);
    await eventually(() => peer.requests.length > before, 'uncached renewal');
    expect(peer.frames.some((frame) => frame.type === 'Authenticate')).toBe(false);
    expect(peer.requests.every((request) => !request.headers.authorization && request.path === '/api/query')).toBe(
      true
    );
  });

  it('does not treat a connected, acknowledged, but never-fresh feed as authorization', async () => {
    await eventually(() => peer.requests.length > 0, 'HTTP validation');
    expect(await status()).toBe('suspended');
    expect((await runtime.request('/status')).events).not.toContain('authorized');
  });

  it('requires fresh authorization after explicit connection loss', async () => {
    const previous = await authorize();
    previous.connection.socket.close(1012, 'controlled reconnect');
    await waitStatus('suspended');
    const current = await peer.query(({ query }) => query.args[0].generation !== previous.query.args[0].generation);
    expect(await status()).toBe('suspended');
    peer.answer(current, false);
    await waitStatus('denied');
  });

  it('fences a delayed old-generation positive HTTP result', async () => {
    await authorize();
    peer.httpMode = 'hold';
    const before = peer.requests.length;
    peer.answer(await peer.query(), true, Date.now() + 54_000);
    const held = await eventually(() => peer.requests.slice(before).at(-1), 'held old request');
    const { latestRound } = await runtime.request('/extra');
    const current = await peer.query(({ query }) => query.args[0].generation !== held.args.generation);
    const beforeCurrent = peer.requests.length;
    peer.answer(current);
    await eventually(() => peer.requests.length > beforeCurrent, 'current snapshot renewal');
    expect((await runtime.request(`/status?minimumRound=${latestRound}`)).status).toBe('suspended');
    held.release(peer.result(held.args));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect((await runtime.request(`/status?minimumRound=${latestRound}`)).status).toBe('suspended');
  });

  it('retains an existing grant during membership refresh without extending its original lease', async () => {
    await authorize();
    const previous = peer.requests.at(-1);
    const { latestRound } = await runtime.request('/extra');
    await peer.query(({ query }) => query.args[0].registrationIds.length === 2);
    expect(await status()).toBe('authorized');
    expect((await runtime.request(`/status?minimumRound=${latestRound}`)).status).toBe('suspended');
    expect((await runtime.request(`/status?at=${previous.startedAt + 10_050}`)).status).toBe('suspended');
  });

  it('fences a delayed same-generation HTTP positive after a pushed denial', async () => {
    const query = await authorize();
    peer.httpMode = 'hold';
    const before = peer.requests.length;
    peer.answer(query, true, Date.now() + 54_000);
    const held = await eventually(() => peer.requests.slice(before).at(-1), 'held same-generation request');
    peer.answer(query, false);
    await waitStatus('denied');
    held.release(peer.result(held.args));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await status()).toBe('denied');
  });

  it('does not let an older HTTP observation extend a newer pushed expiry', async () => {
    const query = await authorize();
    peer.httpMode = 'hold';
    const before = peer.requests.length;
    peer.answer(query, true, Date.now() + 54_000);
    const held = await eventually(() => peer.requests.slice(before).at(-1), 'held earlier observation');
    const expiresAt = Date.now() + 1500;
    const beforeCurrent = peer.requests.length;
    peer.answer(query, true, expiresAt);
    await eventually(() => peer.requests.length > beforeCurrent, 'newer pushed expiry');
    held.release(peer.result(held.args));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await status()).toBe('authorized');
    expect((await runtime.request(`/status?at=${expiresAt + 100}`)).status).toBe('suspended');
  });

  it('does not let a later pushed positive resurrect a definitive HTTP denial', async () => {
    const query = await authorize();
    peer.httpMode = 'deny';
    peer.answer(query, true, Date.now() + 54_000);
    await waitStatus('denied');
    peer.httpMode = 'allow';
    const before = peer.requests.length;
    peer.answer(query, true, Date.now() + 53_000);
    await eventually(() => peer.requests.length > before, 'later positive observed');
    expect(await status()).toBe('denied');
  });

  it.each([
    {
      name: 'revalidates a delayed expired reactive value without permanently revoking a refreshed session',
      expiresInMs: 60_000,
      expectedStatus: 'authorized',
    },
    {
      name: 'denies a truly expired session after the fresh HTTP validation confirms expiry',
      expiresInMs: -1,
      expectedStatus: 'denied',
    },
  ])('$name', async ({ expiresInMs, expectedStatus }) => {
    const query = await authorize();
    peer.httpMode = 'hold';
    const before = peer.requests.length;
    peer.answer(query, true, Date.now() - 1);
    await waitStatus('suspended');
    const current = await eventually(() => peer.requests.slice(before).at(-1), 'fresh expiry validation');
    current.release(peer.result(current.args, true, Date.now() + expiresInMs));
    await waitStatus(expectedStatus);
    expect(await status()).toBe(expectedStatus);
  });

  it('bounds a delayed positive by request start, not response arrival', async () => {
    const query = await authorize();
    peer.httpMode = 'hold';
    const before = peer.requests.length;
    peer.answer(query, true, Date.now() + 54_000);
    const held = await eventually(() => peer.requests.slice(before).at(-1), 'delayed lease request');
    // A real delay widens the gap between the request-start and response-arrival deadlines.
    await new Promise((resolve) => setTimeout(resolve, 150));
    const beforeEvents = (await runtime.request('/status')).events.length;
    held.release(peer.result(held.args));
    await eventually(
      async () => (await runtime.request('/status')).events.length > beforeEvents,
      'delayed response callback'
    );
    await eventually(
      async () => (await runtime.request(`/status?at=${held.startedAt + 9800}`)).status === 'authorized',
      'accepted delayed response'
    );
    expect((await runtime.request(`/status?at=${held.startedAt + 10_050}`)).status).toBe('suspended');
  });

  it('suspends a known timeout even when a newer request is still pending', async () => {
    const query = await authorize();
    peer.httpMode = 'hold';
    const before = peer.requests.length;
    peer.answer(query, true, Date.now() + 54_000);
    const held = await eventually(() => peer.requests.slice(before).at(-1), 'first pending validation');
    const beforeNewer = peer.requests.length;
    peer.answer(query, true, Date.now() + 53_000);
    await eventually(() => peer.requests.length > beforeNewer, 'newer pending validation');
    await eventually(() => held.response.destroyed, 'native request timeout');
    await eventually(async () => (await status()) === 'suspended', 'known timeout suspension', 500);
    expect(query.connection.socket.readyState).toBe(1);
    const late = peer.requests.at(-1);
    late.release(peer.result(late.args));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await status()).toBe('suspended');
  });

  it('ignores an older timeout after accepting a genuinely newer HTTP validation', async () => {
    const query = await authorize();
    peer.httpMode = 'hold';
    const before = peer.requests.length;
    peer.answer(query, true, Date.now() + 54_000);
    const held = await eventually(() => peer.requests.slice(before).at(-1), 'older pending validation');
    peer.httpMode = 'allow';
    const beforeNewer = peer.requests.length;
    const beforeCallbacks = (await runtime.request('/status')).events.length;
    peer.answer(query, true, Date.now() + 53_000);
    const newer = await eventually(() => peer.requests.slice(beforeNewer).at(-1), 'newer successful validation');
    await eventually(() => newer.response.writableEnded, 'newer HTTP reply');
    await eventually(
      async () => (await runtime.request('/status')).events.length >= beforeCallbacks + 2,
      'newer snapshot and HTTP validation callbacks'
    );
    await waitStatus('authorized');
    const beforeEvents = (await runtime.request('/status')).events.length;
    await eventually(() => held.response.destroyed, 'older native request timeout');
    await new Promise((resolve) => setTimeout(resolve, 100));
    const current = await runtime.request('/status');
    expect(current.status).toBe('authorized');
    expect(current.events.slice(beforeEvents)).not.toContain('suspended');
  });

  it('expires a quiet authorization at the Auth deadline without waiting for a push', async () => {
    peer.expiresAt = () => Date.now() + 700;
    peer.answer(await peer.query());
    await waitStatus('authorized');
    await waitStatus('suspended');
    expect(await status()).toBe('suspended');
  });
});
