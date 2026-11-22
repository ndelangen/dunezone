import { describe, expect, it } from 'vite-plus/test';

import type { readBiddingFaction, readBiddingSetup } from '@db/biddingTool';

import { createAuction } from './auction';
import { BiddingSession } from './session';
import { BiddingSetupRequests } from './setupRequests';

type Setup = NonNullable<Awaited<ReturnType<typeof readBiddingSetup>>>;
type Faction = NonNullable<Awaited<ReturnType<typeof readBiddingFaction>>>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function faction(id: string): Faction {
  return { id: id as Faction['id'], name: id, src: null, color: '#000000', peeks: false, paid: false, initialHand: 1 };
}

function setup(id: string): Setup {
  return {
    ruleset: { id: id as Setup['ruleset']['id'], slug: id, name: id },
    seats: [faction(`${id}-a`), faction(`${id}-b`)],
    deck: null,
  };
}

function harness() {
  const session = new BiddingSession({
    identity: { tableId: 'table', code: 'DUNE42', centralInstanceId: 'central', generation: 1 },
    auction: createAuction({
      ruleset: { id: 'original', name: 'Original' },
      seats: ['a', 'b'].map((id) => ({ id, name: id, hand: 1, limit: 4, full: false, pass: false })),
    }),
  });
  const statuses: { loading: boolean; error: string | null }[] = [];
  const requests = new BiddingSetupRequests({
    current: session.getSnapshot,
    apply: (action, context) => {
      expect(session.dispatch(action, context).accepted).toBe(true);
    },
    status: (status) => statuses.push(status),
  });
  return { session, requests, statuses };
}

describe('bidding setup catalogue requests', () => {
  it('keeps the latest ruleset when responses arrive in reverse order', async () => {
    const { session, requests, statuses } = harness();
    const first = deferred<Setup | null>();
    const second = deferred<Setup | null>();
    const firstDone = requests.ruleset(() => first.promise);
    const secondDone = requests.ruleset(() => second.promise);
    second.resolve(setup('second'));
    await secondDone;
    first.resolve(setup('first'));
    await firstDone;
    expect(session.getSnapshot().auction.ruleset.id).toBe('second');
    expect(session.getSnapshot().auction.seats.map((seat) => seat.id)).toEqual(['second-a', 'second-b']);
    expect(statuses.at(-1)).toEqual({ loading: false, error: null });
  });

  it('discards a faction loaded for the previous ruleset', async () => {
    const { session, requests } = harness();
    const oldFaction = deferred<Faction | null>();
    const factionDone = requests.faction(() => oldFaction.promise);
    await requests.ruleset(async () => setup('new'));
    oldFaction.resolve(faction('old-faction'));
    await factionDone;
    expect(session.getSnapshot().auction.seats.map((seat) => seat.id)).toEqual(['new-a', 'new-b']);
  });

  it('preserves a hand edit made while a ruleset is loading', async () => {
    const { session, requests, statuses } = harness();
    const next = deferred<Setup | null>();
    const done = requests.ruleset(() => next.promise);
    expect(session.dispatch({ type: 'edit-hand', id: 'a', field: 'hand', value: 3 }).accepted).toBe(true);
    next.resolve(setup('new'));
    await done;
    expect(session.getSnapshot().auction.ruleset.id).toBe('original');
    expect(session.getSnapshot().auction.seats[0].hand).toBe(3);
    expect(statuses.at(-1)).toEqual({
      loading: false,
      error: 'The table changed while the catalogue loaded. Choose again.',
    });
  });
});
