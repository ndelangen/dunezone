/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import aggregateTest from '@convex-dev/aggregate/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { PLANET, TROOP_MODIFIER } from '../src/shared/assetIds';
import { recalculateFactionComplexity } from '../src/shared/factions/complexity';
import { ensureFactionComponentIds } from '../src/shared/factions/componentIdentity';
import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { CanonicalFactionStoredSchema, FactionInputSchema } from '../src/shared/factions/schema';
import type { FactionInput } from '../src/shared/factions/schema';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

/** Catalogue rows an Extra can name; the save only checks that a live asset of that type holds the slug. */
async function seedExtraAssets(t: ReturnType<typeof convexTest>, ownerId: Id<'users'>, assets: [string, string][]) {
  const now = '2026-09-28T12:00:00.000Z';
  return await t.run(async (ctx) =>
    Promise.all(
      assets.map(([type, slug]) =>
        ctx.db.insert('assets', {
          owner_id: ownerId,
          type,
          slug,
          data: {},
          created_at: now,
          updated_at: now,
          is_deleted: false,
          group_id: null,
        })
      )
    )
  );
}

function representativeFullFieldFaction(): FactionInput {
  const input = {
    ...structuredClone(assetPublishingFaction),
    name: 'Complete Authoring Proof',
    colors: ['White', 'Brown', 'Red', 'Orange', 'Yellow', 'Green', 'Teal', 'Blue', 'Purple', 'Pink'],
    background: {
      image: '/image/texture/021.jpg',
      invert: false,
      definition: 0.37,
      influence: 0.82,
      colors: [
        {
          type: 'linear',
          angle: 271,
          stops: [
            ['#112233', 0],
            ['#445566', 0.42],
            ['#778899', 1],
          ],
        },
        {
          type: 'radial',
          x: 0.21,
          y: 0.77,
          r: 0.63,
          stops: [
            ['#abcdef', 0.15],
            ['#fedcba', 0.9],
          ],
        },
      ],
    },
    factionLeader: {
      name: 'Proof Leader',
      image: assetPublishingFaction.factionLeader.image,
    },
    leaders: [
      {
        name: 'Numeric Leader',
        strength: 4,
        image: assetPublishingFaction.factionLeader.image,
      },
      {
        name: 'Letter Leader',
        strength: 'A',
        image: assetPublishingFaction.leaders[0].image,
      },
      {
        name: 'Unrated Leader',
        image: assetPublishingFaction.leaders[1].image,
      },
    ],
    decals: [
      {
        id: assetPublishingFaction.logo,
        muted: false,
        outline: true,
        scale: 0.73,
        offset: [-412.5, 918.25],
      },
      {
        id: assetPublishingFaction.troops[0].image,
        muted: true,
        outline: false,
        scale: 0,
        offset: [0, 0],
      },
    ],
    planet: [
      {
        image: PLANET.options[0],
        name: 'Curated Prime',
        description: 'A repository-owned planet illustration.',
      },
      {
        image: 'https://example.com/legacy-planet.png',
        name: 'Legacy URL World',
        description: 'Existing URL-based planet data remains admitted.',
      },
    ],
    troops: [
      {
        image: assetPublishingFaction.troops[0].image,
        name: 'Reversible Guard',
        description: 'Front-side troop rules.',
        star: TROOP_MODIFIER.options[0],
        striped: true,
        count: 12,
        planet: 'Curated Prime',
        combat: { strength: -0.5, supportedStrength: 1.25, supportCost: 0 },
        back: {
          image: assetPublishingFaction.troops[0].image,
          name: 'Reversible Guard Elite',
          description: 'Reverse-side troop rules.',
          star: TROOP_MODIFIER.options[1] ?? TROOP_MODIFIER.options[0],
          striped: false,
          capable: false,
        },
      },
      {
        image: assetPublishingFaction.troops[0].image,
        name: 'One-sided Reserve',
        description: 'No reverse side and no planet reference.',
        count: 5,
      },
    ],
    rules: {
      startText: 'Place the reversible guard on Curated Prime.',
      revivalText: 'Revive one force freely.',
      spiceCount: 7,
      fate: {
        text: 'Fate remains valid without an optional title.',
      },
      advantages: [
        {
          title: 'Complete advantage',
          text: 'Primary rules text.',
          karama: 'Optional Karama interaction.',
        },
        {
          text: 'Untitled advantage without Karama.',
        },
      ],
      alliance: {
        text: '',
      },
    },
    extras: [
      { type: 'deck', slug: 'proof-omens' },
      { type: 'token-disc', slug: 'proof-sandworm' },
    ],
    extraPhases: [
      {
        id: 'proof-setup-phase',
        type: 'prediction',
        title: 'Proof prediction',
        symbol: '/vector/icon/fate.svg',
        before: 'traitors',
        priority: 10,
        allPlayersMustBeReady: false,
        instructions: 'Predict the winner and the turn.',
      },
      {
        id: 'proof-turn-phase',
        type: 'instruction',
        title: 'Proof turn phase',
        symbol: '/vector/icon/bidding_standalone.svg',
        before: 'bidding',
        priority: -2,
        allPlayersMustBeReady: true,
      },
    ],
  };
  return ensureFactionComponentIds(FactionInputSchema.parse(recalculateFactionComplexity(input)));
}

describe('faction authoring full-field round trip', () => {
  test('rejects retired legacy writes while trusting grouped client calculations', async () => {
    const t = convexTest(schema, modules);
    aggregateTest.register(t, 'statistics');
    aggregateTest.register(t, 'profileActivity');
    aggregateTest.register(t, 'profileDiscovery');
    const userId = await t.run(async (ctx) => await ctx.db.insert('users', { name: 'Faction transition proof user' }));
    const asUser = t.withIdentity({ subject: userId });
    const { complexity: _complexity, ...legacyData } = structuredClone(assetPublishingFaction);

    await expect(
      asUser.mutation(api.factions.create, {
        data: { ...legacyData, name: 'Missing Complexity Proof' },
        group_id: null,
      })
    ).rejects.toThrow(/complexity/i);
    await expect(
      asUser.mutation(api.factions.create, {
        data: { ...legacyData, name: 'Legacy Scalar Proof', complexity: 0.6 },
        group_id: null,
      })
    ).rejects.toThrow(/complexity/i);

    const groupedCreated = await asUser.mutation(api.factions.create, {
      data: {
        ...legacyData,
        name: 'Grouped Trust Proof',
        complexity: { calculated: 0.123, manual: 0.4 },
      },
      group_id: null,
    });
    expect(groupedCreated.data.complexity).toEqual({ calculated: 0.123, manual: 0.4 });
    await expect(
      asUser.mutation(api.factions.update, {
        id: groupedCreated._id,
        data: { ...legacyData, name: 'Legacy Scalar Update Proof', complexity: 0.7 },
      })
    ).rejects.toThrow(/complexity/i);
    const groupedUpdated = await asUser.mutation(api.factions.update, {
      id: groupedCreated._id,
      data: {
        ...groupedCreated.data,
        name: 'Grouped Trust Proof Updated',
        complexity: { calculated: 0.456, manual: 0.5 },
      },
    });
    expect(groupedUpdated.data.complexity).toEqual({ calculated: 0.456, manual: 0.5 });

    /* The editor's shared phase schema is the save's too: a row the editor would hold is refused here. */
    const phase = {
      id: 'refused',
      type: 'instruction',
      title: 'Refused phase',
      symbol: '/vector/icon/fate.svg',
      before: 'karama',
      priority: 10,
      allPlayersMustBeReady: false,
    };
    await expect(
      asUser.mutation(api.factions.update, {
        id: groupedCreated._id,
        data: { ...groupedUpdated.data, extraPhases: [phase] },
      })
    ).rejects.toThrow(/extraPhases\.0\.before: Karama is not a phase you can place before/);
    await expect(
      asUser.mutation(api.factions.update, {
        id: groupedCreated._id,
        data: { ...groupedUpdated.data, extraPhases: [{ ...phase, before: 'bidding', priority: 2.5 }] },
      })
    ).rejects.toThrow(/Priority must be a whole number/);
  });

  test('creates, schedules, reloads, edits, and shares every admitted field without loss', async () => {
    const t = convexTest(schema, modules);
    aggregateTest.register(t, 'statistics');
    aggregateTest.register(t, 'profileActivity');
    aggregateTest.register(t, 'profileDiscovery');
    const userId = await t.run(async (ctx) => await ctx.db.insert('users', { name: 'Faction authoring proof user' }));
    await seedExtraAssets(t, userId, [
      ['deck', 'proof-omens'],
      ['token-disc', 'proof-sandworm'],
    ]);
    await t.run(
      async (ctx) =>
        await ctx.db.insert('profiles', {
          user_id: userId,
          username: 'Faction authoring proof user',
          avatar_url: null,
          account_state: 'active',
          slug: 'faction-authoring-proof-user',
          created_at: '2026-07-23T12:00:00.000Z',
          updated_at: '2026-07-23T12:00:00.000Z',
        })
    );
    const asUser = t.withIdentity({ subject: userId });
    const createdInput = representativeFullFieldFaction();
    const extrasBytes = JSON.stringify(createdInput.extras);

    const createdRow = await asUser.mutation(api.factions.create, {
      data: createdInput,
      group_id: null,
    });
    expect(createdRow.slug).toBe('complete-authoring-proof');
    expect(CanonicalFactionStoredSchema.parse(createdRow.data)).toEqual(createdInput);

    const createdJob = await t.run(
      async (ctx) =>
        await ctx.db
          .query('publication_jobs')
          .withIndex('by_asset_type_and_asset_id', (q) =>
            q.eq('asset_type', 'faction_sheet').eq('asset_id', createdRow._id)
          )
          .unique()
    );
    expect(createdJob).toMatchObject({
      asset_id: createdRow._id,
      status: 'pending',
      attempt_counter: 0,
    });
    if (!createdJob) {
      throw new Error('Missing faction sheet job after create');
    }

    await t.run(async (ctx) => {
      const id = await ctx.db.insert('rulesets', {
        name: 'Canonical transition proof',
        about: 'A test ruleset with an About long enough to satisfy the fifty character floor.',
        slug: 'canonical-transition-proof',
        created_at: '2026-07-23T12:00:00.000Z',
        updated_at: '2026-07-23T12:00:00.000Z',
        owner_id: userId,
        group_id: null,
        is_deleted: false,
        image_cover: null,
      });
      await ctx.db.insert('ruleset_factions', {
        ruleset_id: id,
        faction_id: createdRow._id,
      });
      return id;
    });

    const canonicalCreatePage = await t.query(api.factions.getBySlug, {
      slug: createdRow.slug,
    });
    expect(CanonicalFactionStoredSchema.parse(canonicalCreatePage.faction.data)).toEqual(createdInput);
    await expect(asUser.query(api.factions.listForLoadPicker, {})).resolves.toMatchObject({
      rows: [
        {
          data: {
            background: {
              invert: false,
            },
          },
        },
      ],
    });
    await expect(t.query(api.factions.cataloguePage, {})).resolves.toMatchObject({
      factions: [
        {
          data: {
            background: {
              invert: false,
            },
          },
        },
      ],
    });
    /* The ruleset page now carries whole catalogue-shaped factions, so the round trip is checked through `data`. */
    await expect(t.query(api.rulesets.getBySlug, { slug: 'canonical-transition-proof' })).resolves.toMatchObject({
      factions: [
        {
          data: {
            background: {
              invert: false,
            },
          },
        },
      ],
    });

    const editedInput: FactionInput = recalculateFactionComplexity({
      ...structuredClone(createdInput),
      name: 'Complete Authoring Proof Revised',
      colors: [...createdInput.colors].reverse(),
      leaders: [...createdInput.leaders].reverse(),
      decals: [...createdInput.decals].reverse(),
      troops: [...createdInput.troops].reverse(),
      planet: [...(createdInput.planet ?? [])].reverse(),
      rules: {
        ...structuredClone(createdInput.rules),
        advantages: [...createdInput.rules.advantages].reverse(),
      },
    });
    const updatedRow = await asUser.mutation(api.factions.update, {
      id: createdRow._id,
      data: editedInput,
    });

    expect(updatedRow.slug).toBe('complete-authoring-proof-revised');
    const canonicalEditPage = await t.query(api.factions.getBySlug, {
      slug: updatedRow.slug,
    });
    const reloaded = CanonicalFactionStoredSchema.parse(canonicalEditPage.faction.data);
    expect(reloaded).toEqual(editedInput);
    expect(JSON.stringify(reloaded.extras)).toBe(extrasBytes);
    expect(reloaded.colors).toEqual(editedInput.colors);
    expect(reloaded.leaders).toEqual(editedInput.leaders);
    expect(reloaded.decals).toEqual(editedInput.decals);
    expect(reloaded.troops).toEqual(editedInput.troops);
    expect(reloaded.planet).toEqual(editedInput.planet);
    expect(reloaded.rules.advantages).toEqual(editedInput.rules.advantages);

    await expect(t.query(api.factions.getBySlug, { slug: 'complete-authoring-proof' })).rejects.toThrow('not found');
    await expect(t.run(async (ctx) => await ctx.db.get('publication_jobs', createdJob._id))).resolves.toMatchObject({
      status: 'pending',
      attempt_counter: 0,
      asset_data: {
        factionId: createdRow._id,
        slug: 'complete-authoring-proof-revised',
        faction: {
          name: 'Complete Authoring Proof Revised',
        },
      },
    });
  });

  test('an added Extra must name a live catalogue asset, and one already listed survives its removal', async () => {
    const t = convexTest(schema, modules);
    aggregateTest.register(t, 'statistics');
    aggregateTest.register(t, 'profileActivity');
    aggregateTest.register(t, 'profileDiscovery');
    const userId = await t.run(async (ctx) => await ctx.db.insert('users', { name: 'Faction extras proof user' }));
    const [deckId] = await seedExtraAssets(t, userId, [
      ['deck', 'extras-omens'],
      ['bundle', 'extras-spice'],
    ]);
    const asUser = t.withIdentity({ subject: userId });
    const base = { ...structuredClone(assetPublishingFaction), name: 'Extras Proof' };

    await expect(
      asUser.mutation(api.factions.create, {
        data: { ...base, extras: [{ type: 'token-disc', slug: 'extras-omens' }] },
        group_id: null,
      })
    ).rejects.toThrow(/The Extra token-disc\/extras-omens is not in the catalogue/);

    const created = await asUser.mutation(api.factions.create, {
      data: { ...base, extras: [{ type: 'deck', slug: 'extras-omens' }] },
      group_id: null,
    });
    await t.run(async (ctx) => ctx.db.patch(deckId!, { is_deleted: true }));

    const updated = await asUser.mutation(api.factions.update, {
      id: created._id,
      data: {
        ...created.data,
        name: 'Extras Proof Renamed',
        extras: [...created.data.extras!, { type: 'bundle', slug: 'extras-spice' }],
      },
    });
    expect(updated.data.extras).toEqual([
      { type: 'deck', slug: 'extras-omens' },
      { type: 'bundle', slug: 'extras-spice' },
    ]);
    await expect(
      asUser.mutation(api.factions.update, {
        id: created._id,
        data: { ...updated.data, extras: [{ type: 'deck', slug: 'extras-missing' }] },
      })
    ).rejects.toThrow(/The Extra deck\/extras-missing is not in the catalogue/);

    /* Before the retirement migration reaches a row, a stored link list must not hide the references beside it. */
    await t.run(async (ctx) => {
      const row = await ctx.db.get('factions', created._id);
      await ctx.db.patch(created._id, {
        data: { ...row!.data, extras: [{ name: 'TTS', items: [] }, ...updated.data.extras!] },
      });
    });
    const renamed = await asUser.mutation(api.factions.update, {
      id: created._id,
      data: { ...updated.data, name: 'Extras Proof Again' },
    });
    expect(renamed.data.extras).toEqual(updated.data.extras);
  });
});
