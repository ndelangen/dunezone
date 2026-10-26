import { afterEach, describe, expect, it } from 'vite-plus/test';

import { dealt, draftingRuntime, playToTurnOne } from './native-drafting.fixture.ts';
import type { NativeView } from './native-runtime.fixture.ts';
import { required } from './native-runtime.fixture.ts';
import type { NativePeer, NativeRuntime } from './native-runtime.fixture.ts';
import {
  admitPlayer,
  createPeer,
  createRuntime,
  provision,
  seat,
  sendCommand,
  syncView,
} from './native-runtime.fixture.ts';

/* The bindings `scripts/play-local.ts` gives the isolated local stack's game Worker. */
const LOCAL_ISOLATED = { GIT_SHA: 'local-isolated', APPLICATION_ORIGIN: 'http://127.0.0.1:8787' };

/** What Turn 1 looks like whichever factions were dealt and wherever the shuffle put the cards. */
function shapeAtPlay(view: NativeView) {
  const { snapshot } = view;
  const inventories: Partial<Record<'shared' | 'table', number>> = {};
  for (const piece of snapshot.table.pieces) {
    const inventory = piece.inventory ?? 'table';
    inventories[inventory] = (inventories[inventory] ?? 0) + 1;
  }
  return {
    stage: snapshot.stage,
    phase: snapshot.phase,
    seatCount: required(snapshot.roster).seatCount,
    factionsDealt: required(snapshot.roster).seats.filter((entry) => entry.faction).length,
    inventories,
    hand: (snapshot.hand ?? []).length,
    balance: snapshot.bank?.balance ?? null,
  };
}

describe('A real game provisioned at the play stage', () => {
  let peer: NativePeer, runtime: NativeRuntime;
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });

  it('arrives at Turn 1 in the shape a game reaches when its players take it there', async () => {
    ({ peer, runtime } = await draftingRuntime([], undefined, { bindings: LOCAL_ISOLATED, testPhaseCooldownMs: 0 }));
    const played = await dealt(runtime);
    await playToTurnOne(played);
    const byPlayers = shapeAtPlay(await syncView(played[0]));
    await runtime.close();
    await peer.close();

    ({ peer, runtime } = await draftingRuntime([], undefined, {
      bindings: LOCAL_ISOLATED,
      testPhaseCooldownMs: 0,
      testStartStage: 'play',
    }));
    const creator = await admitPlayer(runtime, 'a');
    const view = await syncView(creator);
    expect(view.viewer.viewerSeat).toBe('seat-1');
    expect(shapeAtPlay(view)).toEqual(byPlayers);
    /* The creator sits alone; the other seat waits open with its faction for a request. */
    expect(required(view.snapshot.controls).seats).toEqual(['seat-1']);
    expect(
      required(view.snapshot.roster)
        .seats.map((entry) => entry.id)
        .sort()
    ).toEqual(['seat-1', 'seat-2']);
  });

  it('locks and reveals an authored prediction and readies only where a setup step asks', async () => {
    ({ peer, runtime } = await draftingRuntime([], undefined, {
      bindings: LOCAL_ISOLATED,
      testPhaseCooldownMs: 0,
      testStartStage: 'play',
      prepare: (catalogue) => {
        const atreides = catalogue.factions.get('atreides');
        catalogue.factions.set('atreides', {
          ...required(atreides),
          data: {
            ...required(required(atreides).data),
            extraPhases: [
              {
                id: 'prediction',
                type: 'prediction' as const,
                title: 'Bene Gesserit prediction',
                symbol: '/vector/icon/fate.svg' as const,
                before: 'traitors' as const,
                priority: 10,
                allPlayersMustBeReady: false,
              },
              {
                id: 'muster',
                type: 'instruction' as const,
                title: 'Muster',
                symbol: '/vector/icon/fate.svg' as const,
                before: 'forces' as const,
                priority: 10,
                allPlayersMustBeReady: true,
              },
            ],
          },
        });
      },
    }));
    const { snapshot } = await syncView(await admitPlayer(runtime, 'a'));
    expect(snapshot.stage).toBe('play');
    expect(required(snapshot.setup).steps.map((step) => step.kind)).toEqual([
      'prediction',
      'traitors',
      'instruction',
      'forces',
    ]);
    const [prediction] = Object.values(required(snapshot.predictions));
    expect(prediction).toMatchObject({ factionId: 'atreides', choice: { factionId: 'atreides', turn: 1 } });
    expect(prediction.revealedAt).not.toBeNull();
  });

  it('is refused outside the isolated local runtime, which then provisions the game at its start', async () => {
    const outside = {
      'a deployed Worker': { GIT_SHA: 'a'.repeat(40), APPLICATION_ORIGIN: 'https://dune.zone' },
      "play-local's marker on a public origin": { GIT_SHA: 'local-isolated', APPLICATION_ORIGIN: 'https://dune.zone' },
      "a loopback origin without play-local's marker": { APPLICATION_ORIGIN: 'http://127.0.0.1:8787' },
    };
    for (const [runtimeName, bindings] of Object.entries(outside)) {
      peer = await createPeer();
      runtime = await createRuntime(peer, 'game', bindings);
      peer.testStartStage = 'play';
      expect((await provision(runtime)).status, `${runtimeName} accepted the start stage`).toBe(403);
      peer.testStartStage = undefined;
      expect((await provision(runtime)).status, `${runtimeName} refused a plain provisioning`).toBe(200);
      await runtime.close();
      await peer.close();
    }
  });

  it('seats a spectator at the open seat through a request in play, and they command as its faction', async () => {
    ({ peer, runtime } = await draftingRuntime([], undefined, {
      bindings: LOCAL_ISOLATED,
      testPhaseCooldownMs: 0,
      testStartStage: 'play',
    }));
    const a = await admitPlayer(runtime, 'a');
    const b = await admitPlayer(runtime, 'b');
    expect((await syncView(b)).viewer.viewerSeat).toBe('neutral');
    const seated = await seat(b, a, 'seat-2');
    expect(seated.viewer.viewerSeat).toBe('seat-2');
    expect(seated.snapshot.bank?.factionId).toBe(
      required(required(required(seated.snapshot.roster).seats.find((entry) => entry.id === 'seat-2')).faction).id
    );
    /* A withdrawal from the seat's spice reserve is a command only its faction's player may send. */
    const { reply } = await sendCommand(b, { kind: 'bank-withdraw' as const, amount: 1 });
    expect(reply).not.toMatchObject({ type: 'rejected' as const });
    expect(required((await syncView(a)).snapshot.controls).seats.sort()).toEqual(['seat-1', 'seat-2']);
  });
});
