import { describe, expect, it } from 'vite-plus/test';

import { assetPublishingFaction } from '../factions/fixtures/assetPublishingFaction';
import {
  dealSeats,
  draftGates,
  draftStateSchema,
  draftWarning,
  draftVariantName,
  draftedPool,
  emptyDraft,
  isBanned,
  resolveFactionPool,
} from './drafting';
import type { DraftFaction, DraftState } from './drafting';

const faction = (id: string, linked: boolean, published = true): DraftFaction => ({
  id,
  slug: id,
  name: id.toUpperCase(),
  emblem: assetPublishingFaction.emblem,
  background: assetPublishingFaction.background,
  color: assetPublishingFaction.themeColor,
  linked,
  published,
});
const catalogue = [
  faction('a', true),
  faction('b', true),
  faction('c', true),
  faction('d', false),
  faction('e', true, false),
];
const draft = (picks: DraftState['picks'], bans: DraftState['bans'] = {}, ready: string[] = []): DraftState => ({
  ...emptyDraft(2, catalogue, 1),
  picks,
  bans,
  ready,
});
/* A fixed source that always takes the first candidate, so a deal is predictable. */
const first = () => 0;

it('a draft stored before rows named their Faction and variant still parses', () => {
  const stored = {
    minimum: 2,
    factions: [
      {
        id: 'a',
        slug: 'a',
        name: 'A',
        emblem: assetPublishingFaction.emblem,
        background: assetPublishingFaction.background,
        color: assetPublishingFaction.themeColor,
        linked: true,
        published: true,
      },
    ],
    catalogueAt: 1,
    picks: {},
    bans: {},
    ready: [],
    failure: null,
  };
  expect(draftStateSchema.parse(stored).factions[0]).not.toHaveProperty('familyId');
});

describe('a variant name in a draft', () => {
  it('is cut to the bound without splitting a character', () => {
    const name = draftVariantName(`${'x'.repeat(159)}🜂`);
    expect(name).toBe('x'.repeat(159));
    expect(() => encodeURIComponent(name)).not.toThrow();
  });
});

describe('the drafted pool', () => {
  it('counts each faction once, in first-pick order, and never a banned one', () => {
    expect(draftedPool(draft({ s1: ['a', 'd'], s2: ['d', 'b'] }, { s3: ['b'] }))).toEqual(['a', 'd']);
  });
});

describe('the gates and the note', () => {
  it('needs the minimum, everyone ready and enough eligible factions', () => {
    const gates = draftGates(draft({ s1: ['a'] }, {}, ['s1']), ['s1', 's2'], 2);
    expect(gates).toMatchObject({ minimumMet: true, allReady: false, enoughFactions: true, poolSize: 1, fillable: 2 });
    expect(draftWarning(gates)).toEqual({
      kind: 'fill',
      text: '1 faction is drafted for 2 players: 1 random suitable faction will be added at assignment.',
    });
  });

  it('warns of a random subset when more are drafted than seated, and blocks when the pool is short', () => {
    expect(draftWarning(draftGates(draft({ s1: ['a', 'b', 'c'] }), ['s1', 's2'], 2)).kind).toBe('subset');
    const short = draftGates(draft({ s1: ['d'] }, { s2: ['a', 'b', 'c'] }), ['s1', 's2'], 2);
    expect(short.enoughFactions).toBe(false);
    expect(draftWarning(short)).toMatchObject({ kind: 'short' });
  });

  it('does not count an unpublished or unlinked faction as filling', () => {
    expect(draftGates(draft({}), ['s1', 's2', 's3', 's4'], 2).fillable).toBe(3);
  });
});

describe('resolving the pool', () => {
  it('keeps every draft and fills the shortfall from linked factions outside the pool', () => {
    const resolved = resolveFactionPool(draft({ s1: ['d'] }), 2, first);
    expect(resolved).toHaveLength(2);
    expect(resolved?.[0]).toBe('d');
    expect(['a', 'b', 'c']).toContain(resolved?.[1]);
  });

  it('takes exactly the drafted set when it matches, a subset when it exceeds, and nothing when the total falls short', () => {
    expect(resolveFactionPool(draft({ s1: ['a', 'b'] }), 2, first)).toEqual(['a', 'b']);
    expect(resolveFactionPool(draft({ s1: ['a', 'b', 'c'] }), 2, first)).toHaveLength(2);
    expect(resolveFactionPool(draft({}, { s1: ['a', 'b'] }), 2, first)).toBeNull();
  });
});

describe('variants of one Faction', () => {
  /* Atreides has three variants; c is a Faction of its own. */
  const variant = (id: string) => ({ ...faction(id, true), familyId: 'atreides' });
  const variants = (picks: DraftState['picks'], bans: DraftState['bans'] = {}): DraftState => ({
    ...emptyDraft(2, [variant('a1'), variant('a2'), variant('a3'), faction('c', true)], 1),
    picks,
    bans,
  });

  it('count once in the pool, as the variant picked first', () => {
    expect(draftedPool(variants({ s1: ['a2', 'c'], s2: ['a1'] }))).toEqual(['a2', 'c']);
  });

  it('are all banned by a ban on any one of them', () => {
    const banned = variants({ s1: ['a2', 'c'] }, { s2: ['a1'] });
    expect(isBanned(banned, 'a3')).toBe(true);
    expect(draftedPool(banned)).toEqual(['c']);
    expect(draftGates(banned, ['s1', 's2'], 2).fillable).toBe(0);
  });

  it('fill as one Faction, so two of them are never dealt together', () => {
    expect(draftGates(variants({}), ['s1', 's2'], 2).fillable).toBe(2);
    expect(resolveFactionPool(variants({ s1: ['a1'] }), 2, first)).toEqual(['a1', 'c']);
    const filled = resolveFactionPool(variants({}), 2, first) ?? [];
    expect(filled.filter((id) => id.startsWith('a'))).toHaveLength(1);
    expect(resolveFactionPool(variants({}), 3, first)).toBeNull();
  });
});

describe('dealing seats', () => {
  it('gives every seat one distinct faction and one distinct station', () => {
    const deal = dealSeats(['s1', 's2', 's3'], ['a', 'b', 'c'], (n) => n - 1);
    expect(new Set(deal.map((entry) => entry.factionId)).size).toBe(3);
    expect(deal.map((entry) => entry.position).sort((first, second) => first - second)).toEqual([0, 1, 2]);
  });
});
