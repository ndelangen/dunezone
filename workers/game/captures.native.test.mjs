import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { assetPublishingFaction } from '../../src/shared/factions/fixtures/assetPublishingFaction';
import { bundlePage, cardPage, deckPage, slot, tokenPage } from './native-catalogue.fixture.mjs';
import { createPeer, createRuntime, provision } from './native-runtime.fixture.mjs';

describe('Catalogue capture and retention through the isolated fixture', () => {
  let peer, runtime;
  beforeEach(async () => {
    peer = await createPeer();
    peer.watchMode = 'allow';
    runtime = await createRuntime(peer, 'game');
    if ((await provision(runtime)).status !== 200) {
      throw new Error('The native fixture did not provision.');
    }
  });
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });

  function seed(...pages) {
    for (const page of pages) {
      peer.catalogue.set(`${page.asset.type}/${page.asset.slug}`, page);
    }
  }
  const reads = (name) => peer.requests.filter((request) => request.function === name).length;
  const peerFunctions = (from) => new Set(peer.requests.slice(from).map((request) => request.function));
  async function tablePieces() {
    const rows = await runtime.exec('SELECT data FROM current_state WHERE id=1');
    return JSON.parse(rows[0].data).table.pieces.length;
  }

  it('retains a ready ruleset once, reads it back after the source is gone and refuses a second ruleset', async () => {
    const [one, two] = [cardPage('card-one'), cardPage('card-two')];
    const token = tokenPage('tech-token');
    const treachery = deckPage('treachery-deck', [one, two]);
    const spice = deckPage('spice-deck', [one], 5);
    const tech = bundlePage('tech-bundle', [token]);
    const custom = deckPage('custom-deck', [two], 1);
    seed(one, two, token, treachery, spice, tech, custom);
    peer.rulesets.set('ruleset-one', {
      ruleset: { id: 'ruleset-one', slug: 'classic', name: 'Classic' },
      slots: [slot('treachery', treachery), slot('spice', spice), slot('techToken', tech), slot('custom', custom)],
    });
    const pieces = await tablePieces();
    const before = peer.requests.length;

    const first = await runtime.capture('ruleset', 'ruleset-one');
    expect(first.ok).toBe(true);
    /* Capture only reads: no publication job, no mutation, nothing but the two reads reaches the catalogue. */
    expect(peerFunctions(before)).toEqual(new Set(['playCatalogue:rulesetSupply', 'assets:getPage']));
    const record = first.record;
    expect(record.ruleset).toEqual({ id: 'ruleset-one', slug: 'classic', name: 'Classic' });
    expect(record.readiness).toEqual({ ready: true, problems: [] });
    expect(record.decks.treachery.contents.members).toEqual([
      { assetId: 'card-one', count: 2 },
      { assetId: 'card-two', count: 2 },
    ]);
    expect(record.decks.treachery.contents.pieces).toHaveLength(1);
    expect(record.decks.treachery.contents.pieces[0].items).toHaveLength(4);
    expect(record.decks.treachery.contents.pieces[0].items[0].artwork).toMatchObject({
      front: 'http://table.test/published/cards/card-one/card.jpg',
      back: 'http://table.test/published/decks/treachery-deck/cardback.jpg',
    });
    expect(record.decks.spice.contents.pieces[0].items).toHaveLength(5);
    expect(record.bundles.techToken.contents.pieces[0].items).toHaveLength(3);
    expect(record.decks.custom.map((entry) => entry.asset.id)).toEqual(['custom-deck']);
    expect(record.bundles.custom).toEqual([]);
    expect(await tablePieces()).toBe(pieces);
    expect(reads('playCatalogue:rulesetSupply')).toBe(1);

    peer.rulesets.delete('ruleset-one');
    peer.catalogue.clear();
    expect((await runtime.capture('ruleset', 'ruleset-one')).record).toEqual(record);
    expect(reads('playCatalogue:rulesetSupply')).toBe(1);
    await runtime.restart();
    expect((await runtime.captures()).ruleset).toEqual(record);
    expect(await runtime.capture('ruleset', 'ruleset-two')).toEqual({
      ok: false,
      message: 'This game already has its ruleset.',
    });
  });

  it('names a missing member, an absent required deck, an empty deck and a missing back, and retains nothing unless provisional', async () => {
    const present = cardPage('present');
    const treachery = deckPage('treachery-deck', [present, cardPage('vanished')]);
    const empty = deckPage('empty-deck', []);
    const backless = tokenPage('backless');
    backless.resolvedBack = { mode: 'dangling', href: null };
    const bundle = bundlePage('backless-bundle', [backless]);
    seed(present, treachery, empty, backless, bundle);
    peer.rulesets.set('ruleset-one', {
      ruleset: { id: 'ruleset-one', slug: 'classic', name: 'Classic' },
      slots: [slot('treachery', treachery), slot('custom', empty), slot('customTokens', bundle)],
    });

    expect(await runtime.capture('ruleset', 'ruleset-one')).toEqual({
      ok: false,
      message: 'This ruleset is not ready: treachery: treachery-deck, This asset has no complete playable definition.',
    });
    expect((await runtime.captures()).ruleset).toBeNull();

    const { record } = await runtime.capture('ruleset', 'ruleset-one', { provisional: true });
    expect(record.readiness.ready).toBe(false);
    expect(record.readiness.problems).toEqual([
      { subject: 'treachery: treachery-deck', reason: 'This asset has no complete playable definition.' },
      { subject: 'spice', reason: 'A ruleset needs a non-empty spice deck.' },
      { subject: 'custom: empty-deck', reason: 'Add playable members before requesting this asset.' },
      { subject: 'customTokens: backless-bundle', reason: 'This asset has a missing back definition.' },
    ]);
    expect(record.decks.treachery).toMatchObject({ asset: { id: 'treachery-deck' }, contents: null });
    expect(record.decks.spice).toBeNull();
    expect((await runtime.captures()).ruleset).toEqual(record);
  });

  it('refuses a ruleset whose only fault is an empty required deck, naming that deck', async () => {
    const card = cardPage('card');
    const treachery = deckPage('treachery-deck', []);
    const spice = deckPage('spice-deck', [card]);
    seed(card, treachery, spice);
    peer.rulesets.set('ruleset-one', {
      ruleset: { id: 'ruleset-one', slug: 'classic', name: 'Classic' },
      slots: [slot('treachery', treachery), slot('spice', spice)],
    });
    expect(await runtime.capture('ruleset', 'ruleset-one')).toEqual({
      ok: false,
      message:
        'This ruleset is not ready: treachery: treachery-deck, Add playable members before requesting this asset.',
    });
    const { record } = await runtime.capture('ruleset', 'ruleset-one', { provisional: true });
    expect(record.readiness.problems).toEqual([
      { subject: 'treachery: treachery-deck', reason: 'Add playable members before requesting this asset.' },
    ]);
    expect(record.decks.spice.contents.pieces[0].items).toHaveLength(2);
  });

  it('names a member without a published front and keeps an older publication usable', async () => {
    const unpublished = cardPage('unpublished');
    unpublished.assetPublishing = null;
    const older = cardPage('older');
    const treachery = deckPage('treachery-deck', [older]);
    const spice = deckPage('spice-deck', [unpublished]);
    seed(unpublished, older, treachery, spice);
    peer.rulesets.set('ruleset-one', {
      ruleset: { id: 'ruleset-one', slug: 'classic', name: 'Classic' },
      slots: [slot('treachery', treachery), slot('spice', spice)],
    });
    const { record } = await runtime.capture('ruleset', 'ruleset-one', { provisional: true });
    expect(record.readiness.problems).toEqual([
      { subject: 'spice: spice-deck', reason: 'Publish every member and back before requesting this asset.' },
    ]);
    expect(record.decks.treachery.contents.pieces[0].items[0].artwork.front).toBe(
      'http://table.test/published/cards/older/card.jpg'
    );
  });

  it('captures a faction with its published faces and its Extras once, and keeps the first record', async () => {
    const leaders = assetPublishingFaction.leaders;
    const token = tokenPage('extra-token');
    const bundle = bundlePage('extra-bundle', [token]);
    seed(token, bundle);
    peer.factions.set('faction-one', {
      faction: { id: 'faction-one', slug: 'atreides', name: assetPublishingFaction.name },
      data: assetPublishingFaction,
      token: '/published/faction-tokens/faction-one/token.jpg',
      leaders: leaders.map((leader, index) => ({
        memberId: leader.memberId,
        front: index === 0 ? null : `/published/leaders/faction-one.${leader.memberId}/leader.jpg`,
      })),
    });
    const extras = [
      { type: 'bundle', slug: 'extra-bundle' },
      { type: 'token-disc', slug: 'missing' },
    ];
    const pieces = await tablePieces();
    const before = peer.requests.length;

    expect(await runtime.capture('faction', 'faction-one', { extras })).toEqual({
      ok: false,
      message: 'This faction is not ready: faction token, The faction token back is not generated yet.',
    });
    expect((await runtime.captures()).factions).toEqual([]);

    const { record } = await runtime.capture('faction', 'faction-one', { extras, provisional: true });
    expect(record.faction).toEqual({ id: 'faction-one', slug: 'atreides', name: assetPublishingFaction.name });
    expect(record.definition).toEqual(assetPublishingFaction);
    expect(record.components.token).toEqual({
      front: 'http://table.test/published/faction-tokens/faction-one/token.jpg',
      back: null,
    });
    expect(record.components.leaders.map((leader) => leader.memberId)).toEqual(
      leaders.map((leader) => leader.memberId)
    );
    expect(record.components.leaders[0]).toMatchObject({ name: leaders[0].name, front: null });
    expect(record.components.leaders[1]).toMatchObject({
      front: `http://table.test/published/leaders/faction-one.${leaders[1].memberId}/leader.jpg`,
      back: 'http://table.test/published/faction-tokens/faction-one/token.jpg',
    });
    expect(record.components.troops).toEqual(
      assetPublishingFaction.troops.map((troop) => ({ name: troop.name, count: troop.count, front: null, back: null }))
    );
    expect(record.components.traitors.cards).toHaveLength(leaders.length);
    expect(record.extras).toHaveLength(2);
    expect(record.extras[0].contents.pieces[0].items).toHaveLength(3);
    expect(record.extras[1]).toMatchObject({ asset: { slug: 'missing' }, contents: null });
    expect(record.readiness.ready).toBe(false);
    expect(await tablePieces()).toBe(pieces);
    expect(peerFunctions(before)).toEqual(new Set(['playCatalogue:factionDefinition', 'assets:getPage']));
    expect(record.readiness.problems.map((problem) => problem.subject)).toEqual([
      'faction token',
      `leader ${leaders[0].name}`,
      ...assetPublishingFaction.troops.map((troop) => `troop ${troop.name}`),
      'alliance card',
      'traitor deck',
      'extra: missing',
    ]);

    peer.factions.set('faction-one', { ...peer.factions.get('faction-one'), token: null });
    expect((await runtime.capture('faction', 'faction-one', { extras, provisional: true })).record).toEqual(record);
    expect(reads('playCatalogue:factionDefinition')).toBe(2);
    await runtime.restart();
    expect((await runtime.captures()).factions).toEqual([record]);
  });

  it('refuses a faction the catalogue lacks or holds incompletely and retains nothing', async () => {
    /* The catalogue read answers no definition for a row that does not parse as a canonical faction. */
    peer.factions.set('faction-two', {
      faction: { id: 'faction-two', slug: 'partial', name: '' },
      data: null,
      token: null,
      leaders: [],
    });
    expect(await runtime.capture('faction', 'faction-two', { provisional: true })).toEqual({
      ok: false,
      message: 'This faction has an incomplete definition.',
    });
    expect(await runtime.capture('faction', 'faction-three', { provisional: true })).toEqual({
      ok: false,
      message: 'This faction is not available.',
    });
    expect((await runtime.captures()).factions).toEqual([]);
  });
});
