import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPeer, createRuntime, eventually, provision } from './native-runtime.fixture.mjs';

const CREDENTIALS = { gameId: 'fixture-game', secret: 'a'.repeat(64) };
/* A spawn request stored before requests named their seat (#1172); the current schema requires one (#1407). */
const SEATLESS_REQUEST = JSON.stringify({
  seats: [],
  ready: [],
  phaseChangedAt: 0,
  requests: [{ id: 'request-1', requesterName: 'Synthetic A', contents: { assetId: 'deck-1' } }],
});

describe('The hosted fixture room retires on request', () => {
  let peer, runtime;
  beforeEach(async () => {
    peer = await createPeer();
    peer.watchMode = 'allow';
  });
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });

  const post = (operation, body) =>
    runtime.fetch(`/__play/games/fixture-game/${operation}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const deleteAccount = () =>
    post('account-deletion', {
      ...CREDENTIALS,
      userId: 'user-a',
      eventId: 'deletion-1',
      deletionOperationId: 'operation-1',
    });
  const storedTables = async () =>
    (await runtime.offline("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '\\_%' ESCAPE '\\'"))
      .map(({ name }) => name)
      .filter((name) => name !== 'sqlite_sequence');
  const storedRows = async () => {
    const tables = await storedTables();
    const counts = await Promise.all(
      tables.map(async (name) => (await runtime.offline(`SELECT count(*) AS n FROM "${name}"`))[0].n)
    );
    return counts.reduce((sum, count) => sum + count, 0);
  };
  const loadFailures = () =>
    runtime.logs.filter((log) => log.message.includes('game-operation-failed') && log.message.includes("'load'"));

  it('answers a retirement although its stored game no longer loads, and deletes everything it stored', async () => {
    runtime = await createRuntime(peer, 'game');
    expect((await provision(runtime)).status).toBe(200);
    await runtime.offline(`UPDATE current_state SET data=json_set(data,'$.controls',json('${SEATLESS_REQUEST}'))`);

    expect((await deleteAccount()).status).toBe(403);
    await eventually(() => loadFailures().length > 0, 'the failed load reported');
    expect((await post('retire', { ...CREDENTIALS, secret: 'b'.repeat(64) })).status).toBe(403);
    expect((await post('retire', CREDENTIALS)).status).toBe(200);
    expect(await storedRows()).toBe(0);

    /* The room starts empty from now on, so a repeated retirement has nothing left to do. */
    expect((await post('retire', CREDENTIALS)).status).toBe(200);
    expect((await deleteAccount()).status).toBe(403);
  });

  it('retires a fixture room that still loads', async () => {
    runtime = await createRuntime(peer, 'game');
    expect((await provision(runtime)).status).toBe(200);
    expect((await post('retire', CREDENTIALS)).status).toBe(200);
    expect((await deleteAccount()).status).toBe(403);
    expect(await storedRows()).toBe(0);
  });

  it('never retires a real game', async () => {
    peer.game = {
      rulesetId: 'ruleset-one',
      minimumPlayers: 4,
      creator: { userId: 'user-a', displayName: 'Synthetic A' },
    };
    peer.rulesets.set('ruleset-one', { ruleset: { id: 'ruleset-one', slug: 'classic', name: 'Classic' }, slots: [] });
    runtime = await createRuntime(peer, 'game');
    expect((await provision(runtime)).status).toBe(200);
    expect((await post('retire', CREDENTIALS)).status).toBe(403);
    expect(await runtime.exec('SELECT id FROM metadata')).toEqual([{ id: 1 }]);
  });
});
