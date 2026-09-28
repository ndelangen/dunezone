import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PHASE_CHANGE_COOLDOWN_MS, TABLE_PHASES } from '../../src/shared/play/phases';
import { draftingRuntime } from './native-drafting.fixture.mjs';
import { accepted, admitPlayer, eventually, seat, sendCommand, syncView } from './native-runtime.fixture.mjs';

const LATEST = Number.MAX_SAFE_INTEGER;
const MENTAT = TABLE_PHASES.length - 1;

describe('Determine winner and Continue playing', { timeout: 60_000 }, () => {
  let peer, runtime, offset;
  beforeEach(async () => {
    ({ peer, runtime } = await draftingRuntime());
    offset = 0;
    for (const id of ['atreides', 'harkonnen']) {
      await runtime.capture('faction', id, { provisional: true });
    }
    await runtime.exec(
      "UPDATE captures SET data=json_set(data,'$.setupPhases',json(?)) WHERE kind='faction' AND source_id='atreides'",
      [
        JSON.stringify([
          {
            id: 'winner',
            name: 'prediction',
            title: 'Predict victory',
            instructions: 'Choose the winner and turn.',
            symbol: '/vector/icon/traitor.svg',
          },
        ]),
      ]
    );
  });
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });

  const admit = (suffix) => admitPlayer(peer, runtime, suffix);
  const rejected = async (connection, action) => (await sendCommand(connection, action)).reply.type === 'rejected';
  const factionOf = (view) =>
    view.snapshot.roster.seats.find((entry) => entry.id === view.viewer.viewerSeat).faction.id;
  const deliveries = () =>
    peer.requests
      .filter((request) => request.function === 'playDirectory:publishSummary')
      .map((request) => request.args);
  async function next(connection, direction = 1) {
    offset += PHASE_CHANGE_COOLDOWN_MS + 1;
    await runtime.clock(offset);
    return accepted(connection, { kind: 'phase', direction });
  }
  async function page(connection, tab = 'game') {
    const start = connection.messages.length;
    connection.send({ type: 'log-history', tab, before: LATEST });
    const result = await eventually(
      () => connection.messages.slice(start).find((message) => message.type === 'log-history' && message.tab === tab),
      `${tab} log page`
    );
    return result.entries;
  }

  /* Two players reach play with Atreides holding a locked prediction, then an observer watches. */
  async function inPlay() {
    const a = await admit('a');
    const b = await admit('b');
    await seat(b, a);
    await accepted(a, { kind: 'draft-ready', ready: true });
    await accepted(b, { kind: 'draft-ready', ready: true });
    await eventually(async () => (await syncView(a)).snapshot.stage === 'swapping', 'assignment');
    for (const connection of [a, b]) {
      const view = await syncView(connection);
      await accepted(connection, {
        kind: 'swap-ready',
        ready: true,
        round: view.snapshot.swapping.round,
        seat: view.viewer.viewerSeat,
      });
    }
    const views = await Promise.all([a, b].map(syncView));
    const ownerIndex = views.findIndex((view) => factionOf(view) === 'atreides');
    const [owner, other] = ownerIndex === 0 ? [a, b] : [b, a];
    const stepId = views[ownerIndex].snapshot.setup.steps[0].id;
    await accepted(owner, { kind: 'prediction-lock', stepId, choice: { factionId: 'harkonnen', turn: 4 } });
    for (let guard = 0; guard < 8 && (await syncView(owner)).snapshot.stage !== 'play'; guard++) {
      const { snapshot } = await next(owner);
      if (snapshot.stage === 'setup' && snapshot.controls.ready.length === 0) {
        await accepted(owner, { kind: 'ready', ready: true });
        await accepted(other, { kind: 'ready', ready: true });
      }
    }
    expect((await syncView(owner)).snapshot.stage).toBe('play');
    const observer = await admit('observer');
    return { owner, other, observer, stepId };
  }
  async function toMentat(connection) {
    while ((await syncView(connection)).snapshot.phase % TABLE_PHASES.length !== MENTAT) {
      await next(connection);
    }
  }

  it('is offered only during Mentat pause and only to seated players', async () => {
    const { owner, observer } = await inPlay();
    expect(await rejected(owner, { kind: 'result-open' })).toBe(true);
    await toMentat(owner);
    expect(await rejected(observer, { kind: 'result-open' })).toBe(true);
    const opened = await accepted(owner, { kind: 'result-open' });
    expect(opened.snapshot.ending.by).toEqual({ seat: opened.viewer.viewerSeat, name: opened.viewer.displayName });
    expect(JSON.stringify(opened.snapshot)).not.toContain(opened.viewer.userId);
  });

  it('shows every player who is determining and lets only that player declare or stop', async () => {
    const { owner, other, observer } = await inPlay();
    await toMentat(owner);
    const determiner = (await syncView(owner)).viewer.displayName;
    await accepted(owner, { kind: 'result-open' });
    for (const connection of [other, observer]) {
      expect((await syncView(connection)).snapshot.ending.by.name).toBe(determiner);
    }
    expect(await rejected(other, { kind: 'result-open' })).toBe(true);
    expect(await rejected(other, { kind: 'result-declare', result: 'none', factionIds: [] })).toBe(true);
    expect(await rejected(other, { kind: 'result-cancel' })).toBe(true);
    const stopped = await accepted(owner, { kind: 'result-cancel' });
    expect(stopped.snapshot.ending).toBeUndefined();
    expect(stopped.snapshot.stage).toBe('play');
  });

  it('rejects a result that does not match its kind or names a faction that is not seated', async () => {
    const { owner } = await inPlay();
    await toMentat(owner);
    await accepted(owner, { kind: 'result-open' });
    for (const [result, factionIds] of [
      ['faction', []],
      ['faction', ['atreides', 'harkonnen']],
      ['alliance', ['atreides']],
      ['alliance', ['atreides', 'atreides']],
      ['none', ['atreides']],
      ['faction', ['fremen']],
    ]) {
      expect(await rejected(owner, { kind: 'result-declare', result, factionIds })).toBe(true);
    }
  });

  it('finishes on one declaration and continues at Mentat pause of the same turn with the table untouched', async () => {
    const { owner, other, observer, stepId } = await inPlay();
    await toMentat(owner);
    const before = (await syncView(owner)).snapshot;
    await accepted(owner, { kind: 'result-open' });
    const finished = await accepted(owner, { kind: 'result-declare', result: 'faction', factionIds: ['atreides'] });
    expect(finished.snapshot.stage).toBe('finished');
    expect(finished.snapshot.ending).toBeUndefined();
    expect(finished.snapshot.result).toMatchObject({ kind: 'faction', factionIds: ['atreides'] });
    expect(finished.snapshot.phase).toBe(before.phase);
    expect(finished.snapshot.table.pieces).toEqual(before.table.pieces);

    /* The table stays as it was: no table control, but a locked prediction can still be revealed. */
    expect(await rejected(other, { kind: 'phase', direction: 1 })).toBe(true);
    expect(await rejected(observer, { kind: 'result-continue' })).toBe(true);
    const revealed = await accepted(owner, { kind: 'prediction-reveal', stepId });
    expect(revealed.snapshot.predictions[stepId].revealedAt).not.toBeNull();

    const continued = await accepted(other, { kind: 'result-continue' });
    expect(continued.snapshot.stage).toBe('play');
    expect(continued.snapshot.result).toBeUndefined();
    expect(continued.snapshot.phase).toBe(before.phase);
    expect(continued.snapshot.table.pieces).toEqual(before.table.pieces);
    expect(await rejected(other, { kind: 'result-continue' })).toBe(true);

    const [declarer, continuer] = [finished.viewer.displayName, continued.viewer.displayName];
    const game = await page(observer);
    expect(game.slice(0, 5).map((entry) => entry.text)).toEqual([
      `${continuer} continued the game.`,
      'Atreides revealed its prediction: Harkonnen, turn 4.',
      `${declarer} declared the result: Atreides won.`,
      `${declarer} started determining the winner.`,
      'Mentat pause began.',
    ]);
    expect(game.slice(0, 5).every((entry) => ['phase', 'prediction'].includes(entry.class))).toBe(true);
    expect(game.map((entry) => entry.context).slice(0, 4)).toEqual([
      'Turn 1, Mentat pause',
      'Finished',
      'Turn 1, Mentat pause',
      'Turn 1, Mentat pause',
    ]);
  });

  it('tells the directory the result, then that the game is ongoing again', async () => {
    const { owner, other } = await inPlay();
    await toMentat(owner);
    const { userId } = (await accepted(owner, { kind: 'result-open' })).viewer;
    await accepted(owner, { kind: 'result-declare', result: 'alliance', factionIds: ['harkonnen', 'atreides'] });
    const finished = await eventually(
      () => deliveries().find((args) => args.summary.stage === 'finished'),
      'finished summary'
    );
    expect(finished.summary.result).toMatchObject({
      kind: 'alliance',
      factions: [
        { id: 'harkonnen', name: expect.any(String) },
        { id: 'atreides', name: expect.any(String) },
      ],
      declaredBy: userId,
    });
    await accepted(other, { kind: 'result-continue' });
    const resumed = await eventually(
      () => deliveries().find((args) => args.summary.stage === 'play' && args.sequence > finished.sequence),
      'continued summary'
    );
    expect(resumed.summary.result).toBeNull();
    expect(resumed.summary.phase).toBe((await syncView(owner)).snapshot.phase);
  });

  it('names a deleted declarer as a deleted user in the result and its history', async () => {
    const { owner, other, observer } = await inPlay();
    await toMentat(owner);
    const { userId } = (await accepted(owner, { kind: 'result-open' })).viewer;
    await accepted(owner, { kind: 'result-declare', result: 'none', factionIds: [] });
    const response = await runtime.fetch('/__play/games/fixture-game/account-deletion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameId: 'fixture-game',
        secret: 'a'.repeat(64),
        userId,
        eventId: `deletion-${userId}`,
        deletionOperationId: `operation-${userId}`,
      }),
    });
    expect(response.status).toBe(200);
    const view = await syncView(observer);
    expect(view.snapshot.stage).toBe('finished');
    expect(view.snapshot.result.by.name).toBe('[deleted user]');
    expect((await page(observer)).map((entry) => entry.text)).toContain(
      '[deleted user] declared the result: No winner.'
    );
    /* Playback of the finished table, once the game continues, names the deleted declarer too. */
    await accepted(other, { kind: 'result-continue' });
    const playback = async (step) => {
      const start = observer.messages.length;
      observer.send({ type: 'history', step });
      return eventually(
        () => observer.messages.slice(start).find((message) => message.type === 'history'),
        `history step ${step}`
      );
    };
    const { lastStep } = await playback(0);
    const declared = [];
    for (let step = 0; step <= lastStep; step += 1) {
      const { snapshot } = await playback(step);
      if (snapshot.result) {
        declared.push(snapshot.result.by.name);
      }
    }
    expect(declared.length).toBeGreaterThan(0);
    expect(new Set(declared)).toEqual(new Set(['[deleted user]']));
  });

  it('closes an open sequence when the phase moves on', async () => {
    const { owner, other } = await inPlay();
    await toMentat(owner);
    await accepted(owner, { kind: 'result-open' });
    await accepted(owner, { kind: 'ready', ready: true });
    await accepted(other, { kind: 'ready', ready: true });
    const moved = await next(other);
    expect(moved.snapshot.ending).toBeUndefined();
    const texts = (await page(other)).map((entry) => entry.text);
    const opener = (await syncView(owner)).viewer.displayName;
    expect(texts).toContain(`Determining the winner by ${opener} ended.`);
  });
});
