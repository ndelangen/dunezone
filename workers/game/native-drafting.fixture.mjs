import { assetPublishingFaction } from '../../src/shared/factions/fixtures/assetPublishingFaction';
import { cardPage, deckPage, slot } from './native-catalogue.fixture.mjs';
import { createPeer, createRuntime, provision } from './native-runtime.fixture.mjs';

const CREATOR = { userId: 'user-a', displayName: 'Synthetic A', avatarUrl: 'https://dune.zone/user-images/a.jpg' };

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
    leaders: assetPublishingFaction.leaders.map((leader) => ({
      memberId: leader.memberId,
      front: `/published/leaders/${id}.${leader.memberId}/leader.jpg`,
    })),
  };
}

export async function draftingRuntime(extras = [], cards = [cardPage('card-one')]) {
  const peer = await createPeer();
  peer.watchMode = 'allow';
  peer.expiresAt = () => Date.now() + 600_000;
  peer.game = { rulesetId: 'ruleset-one', minimumPlayers: 2, creator: CREATOR };
  /* Faction backs and troops are not generated anywhere yet, so a real game could not deal; the isolated path may. */
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
    runtime = await createRuntime(peer, 'game');
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
