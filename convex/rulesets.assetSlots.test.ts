/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import aggregateTest from '@convex-dev/aggregate/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { RULESET_ASSET_SLOTS } from '../src/shared/rulesets/assetSlots';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

const DESCRIPTION = 'A house ruleset used to prove asset slots fill, swap and clear under the right permissions.';

const deckData = (name: string) => ({
  name,
  about: '',
  cardback: {
    name: 'Treachery',
    background: {
      image: '/image/texture/015.jpg',
      colors: ['#4B4C0D', '#262B04'],
      invert: true,
      definition: 0,
      influence: 0.5,
    },
    image: '/vector/icon/projectile.svg',
    imageScale: 0.55,
    imageOffset: [0, 10],
  },
});

async function slotFixture() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, 'statistics');
  aggregateTest.register(t, 'profileActivity');
  aggregateTest.register(t, 'profileDiscovery');

  const ownerId = await t.run(async (ctx) => await ctx.db.insert('users', { name: 'Ruleset owner' }));
  const owner = t.withIdentity({ subject: ownerId });
  const ruleset = await owner.mutation(api.rulesets.create, {
    name: 'SlottedRuleset',
    description: DESCRIPTION,
    group_id: null,
    image_cover: null,
  });
  const first = await owner.mutation(api.assets.create, { type: 'deck', data: deckData('House Treachery') });
  const second = await owner.mutation(api.assets.create, { type: 'deck', data: deckData('House Spice') });

  const slotted = async () => {
    const page = await t.query(api.rulesets.detailPageBySlug, { slug: ruleset.slug });
    return (page?.assetSlots ?? []).map((entry) => [entry.slot, entry.asset.name]);
  };

  return { t, owner, ruleset, first, second, slotted };
}

describe('ruleset asset slots', () => {
  test('a single-asset slot swaps rather than accumulates, and clearing empties it', async () => {
    const { owner, ruleset, first, second, slotted } = await slotFixture();

    await owner.mutation(api.rulesets.setAssetSlot, {
      ruleset_id: ruleset._id,
      asset_id: first.id,
      slot: 'treachery',
    });
    await expect(slotted()).resolves.toEqual([['treachery', 'House Treachery']]);

    /* `by_ruleset_slot` is a plain index, so at-most-one is the mutation clearing before it inserts rather than the table refusing. */
    await owner.mutation(api.rulesets.setAssetSlot, {
      ruleset_id: ruleset._id,
      asset_id: second.id,
      slot: 'treachery',
    });
    await expect(slotted()).resolves.toEqual([['treachery', 'House Spice']]);

    await owner.mutation(api.rulesets.clearAssetSlot, {
      ruleset_id: ruleset._id,
      asset_id: second.id,
      slot: 'treachery',
    });
    await expect(slotted()).resolves.toEqual([]);
  });

  test('a many-asset slot keeps both, and a slot refuses the kind it does not hold', async () => {
    const { owner, ruleset, first, second, slotted } = await slotFixture();

    for (const deck of [first, second]) {
      await owner.mutation(api.rulesets.setAssetSlot, {
        ruleset_id: ruleset._id,
        asset_id: deck.id,
        slot: 'custom',
      });
    }
    await expect(slotted()).resolves.toHaveLength(2);

    /* Which kind a slot accepts is a mutation rule, never a column, so this is where it is refused. */
    await expect(
      owner.mutation(api.rulesets.setAssetSlot, {
        ruleset_id: ruleset._id,
        asset_id: first.id,
        slot: 'techToken',
      })
    ).rejects.toThrow('holds a token bundle');
  });

  test('a soft-deleted asset presents its slot as empty without its row being touched', async () => {
    const { t, owner, ruleset, first, slotted } = await slotFixture();

    await owner.mutation(api.rulesets.setAssetSlot, {
      ruleset_id: ruleset._id,
      asset_id: first.id,
      slot: 'spice',
    });
    await owner.mutation(api.assets.softDelete, { id: first.id });

    await expect(slotted()).resolves.toEqual([]);
    const rows = await t.run(async (ctx) => await ctx.db.query('ruleset_asset_slots').collect());
    expect(rows).toHaveLength(1);
  });

  test('the schema lists exactly the slots the shared table defines', () => {
    /* The schema cannot import the shared table and stay a schema, so this is what keeps the two from drifting. */
    const validator = schema.tables.ruleset_asset_slots.validator;
    const slot = validator.kind === 'object' ? validator.fields.slot : undefined;
    const literals = slot && slot.kind === 'union' ? slot.members.map((member) => member.value) : [];
    expect([...literals].sort()).toEqual(Object.keys(RULESET_ASSET_SLOTS).sort());
  });
});
