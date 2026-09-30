import { assetPublishingFaction } from '../../src/shared/factions/fixtures/assetPublishingFaction';
import { cardPage, deckPage, slot } from './native-catalogue.fixture.mjs';
import {
  accepted,
  admitPlayer,
  createPeer,
  createRuntime,
  eventually,
  provision,
  seat,
  stage,
  syncView,
} from './native-runtime.fixture.mjs';

const CREATOR = {
  userId: 'user-a',
  displayName: 'Synthetic A',
  avatarUrl: 'https://dune.zone/user-images/a.jpg',
  profileSlug: 'synthetic-a',
};

/** A faction as the draft catalogue lists it: real render data from the shared fixture, a name of its own. */
export function draftable(id, name, { linked = true, published = true } = {}) {
  return {
    id,
    slug: id,
    name,
    logo: assetPublishingFaction.logo,
    background: assetPublishingFaction.background,
    color: assetPublishingFaction.themeColor,
    linked,
    published,
  };
}

/** The same faction as the capture reads it at assignment. */
export function definition(id, name) {
  return {
    faction: { id, slug: id, name },
    data: { ...assetPublishingFaction, name },
    token: `/published/faction-tokens/${id}/token.jpg`,
    tokenBack: `/published/faction-tokens/${id}.back/token.jpg`,
    cardbacks: { traitor: null, alliance: null },
    leaders: assetPublishingFaction.leaders.map((leader) => ({
      memberId: leader.memberId,
      front: `/published/leaders/${id}.${leader.memberId}/leader.jpg`,
    })),
  };
}

/**
 * Admits `count` players and seats each one after the first through the first's approval.
 * Has the first pick `pick` if given, readies everyone and waits for the deal.
 * Returns the connections in seat order once the game is swapping.
 */
export async function dealt(peer, runtime, count = 2, pick) {
  const connections = [];
  for (const suffix of ['a', 'b', 'c', 'd'].slice(0, count)) {
    const connection = await admitPlayer(peer, runtime, suffix);
    if (connections.length) {
      await seat(connection, connections[0]);
    }
    connections.push(connection);
  }
  if (pick) {
    await accepted(connections[0], { kind: 'draft-pick', factionId: pick });
  }
  for (const connection of connections) {
    await accepted(connection, { kind: 'draft-ready', ready: true });
  }
  await eventually(async () => (await stage(connections[0])) === 'swapping', 'assignment');
  return connections;
}

/** Every dealt player keeps the seat they were dealt, which closes trading once all of them have. */
export async function keepDealtSeats(players) {
  for (const player of players) {
    const { snapshot, viewer } = await syncView(player);
    await accepted(player, {
      kind: 'swap-ready',
      ready: true,
      round: snapshot.swapping.round,
      seat: viewer.viewerSeat,
    });
  }
}

/**
 * Trading closes and setup runs to Turn 1 with the commands a table offers its players, readying every seat whenever a step waits for them.
 * The journey test drives the same stages with a moving clock.
 * This helper serves games provisioned without a cooldown.
 */
export async function playToTurnOne(players) {
  await keepDealtSeats(players);
  const [leader] = players;
  let stage = (await syncView(leader)).snapshot.stage;
  for (let changes = 0; stage === 'setup' && changes < 8; changes++) {
    const { snapshot } = await syncView(leader);
    const waiting = snapshot.controls.ready.length < snapshot.roster.seats.length;
    for (const player of waiting ? players : []) {
      await accepted(player, { kind: 'ready', ready: true });
    }
    stage = (await accepted(leader, { kind: 'phase', direction: 1 })).snapshot.stage;
  }
  if (stage !== 'play') {
    throw new Error(`Setup did not reach play; the game is in ${stage} stage.`);
  }
}

/**
 * Provisions a real game in drafting, with the catalogue, ruleset and factions its deal reads.
 * `bindings` override the game Worker's.
 * `testPhaseCooldownMs` and `testStartStage` are what the synthetic backend sends at provisioning.
 */
export async function draftingRuntime(
  extras = [],
  cards = [cardPage('card-one')],
  { bindings, testPhaseCooldownMs, testStartStage } = {}
) {
  const peer = await createPeer();
  peer.testPhaseCooldownMs = testPhaseCooldownMs;
  peer.testStartStage = testStartStage;
  peer.watchMode = 'allow';
  peer.expiresAt = () => Date.now() + 600_000;
  peer.game = { rulesetId: 'ruleset-one', minimumPlayers: 2, creator: CREATOR };
  /* This fixture's faction publishes no alliance or traitor faces, so a real game could not deal; the isolated path may. */
  peer.provisional = true;
  const [treachery, spice] = [deckPage('treachery-deck', cards), deckPage('spice-deck', cards, 5)];
  for (const page of [...cards, treachery, spice]) {
    peer.catalogue.set(`${page.asset.type}/${page.asset.slug}`, page);
  }
  peer.rulesets.set('ruleset-one', {
    ruleset: { id: 'ruleset-one', slug: 'classic', name: 'Classic' },
    slots: [slot('treachery', treachery), slot('spice', spice)],
  });
  peer.draftable = [
    draftable('atreides', 'Atreides'),
    draftable('harkonnen', 'Harkonnen'),
    draftable('fremen', 'Fremen', { linked: false }),
    draftable('ixians', 'Ixians', { published: false }),
  ];
  for (const [id, name] of [
    ['atreides', 'Atreides'],
    ['harkonnen', 'Harkonnen'],
    ['fremen', 'Fremen'],
  ]) {
    peer.factions.set(id, definition(id, name));
  }
  for (const [id, name] of extras) {
    peer.draftable.push(draftable(id, name));
    peer.factions.set(id, definition(id, name));
  }
  let runtime;
  try {
    runtime = await createRuntime(peer, 'game', bindings);
    if ((await provision(runtime)).status !== 200) {
      throw new Error('The real game did not provision.');
    }
    return { peer, runtime };
  } catch (error) {
    await runtime?.close();
    await peer.close();
    throw error;
  }
}
