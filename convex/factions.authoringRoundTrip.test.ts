/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { PLANET, TROOP_MODIFIER } from '../src/game/data/generated';
import { assetPublishingFaction } from '../src/game/fixtures/assetPublishingFaction';
import {
  type FactionInput,
  FactionInputSchema,
  FactionStoredSchema,
  LegacyFactionInputSchema,
} from '../src/game/schema/faction';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

function representativeFullFieldFaction(): FactionInput {
  return FactionInputSchema.parse({
    ...structuredClone(assetPublishingFaction),
    name: 'Complete Authoring Proof',
    colors: [
      'White',
      'Brown',
      'Red',
      'Orange',
      'Yellow',
      'Green',
      'Teal',
      'Blue',
      'Purple',
      'Pink',
    ],
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
    hero: {
      name: 'Proof Hero',
      image: assetPublishingFaction.hero.image,
    },
    leaders: [
      {
        name: 'Numeric Leader',
        strength: 4,
        image: assetPublishingFaction.hero.image,
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
        back: {
          image: assetPublishingFaction.troops[0].image,
          name: 'Reversible Guard Elite',
          description: 'Reverse-side troop rules.',
          star: TROOP_MODIFIER.options[1] ?? TROOP_MODIFIER.options[0],
          striped: false,
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
      {
        name: 'Existing TTS content',
        description: 'Not owned by the faction editor.',
        items: [
          {
            url: 'https://example.com/existing-item.png',
            description: 'Must survive every authoring round trip.',
          },
        ],
      },
    ],
  });
}

describe('faction authoring full-field round trip', () => {
  test('creates, schedules, reloads, edits, and shares every admitted field without loss', async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(
      async (ctx) => await ctx.db.insert('users', { name: 'Faction authoring proof user' })
    );
    await t.run(
      async (ctx) =>
        await ctx.db.insert('profiles', {
          user_id: userId,
          username: 'Faction authoring proof user',
          avatar_url: null,
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
      background_format: 'canonical',
    });
    expect(createdRow.slug).toBe('complete-authoring-proof');
    expect(FactionStoredSchema.parse(createdRow.data)).toEqual(createdInput);

    const createdTarget = await t.run(
      async (ctx) =>
        await ctx.db
          .query('asset_targets')
          .withIndex('by_faction_id_and_asset_type', (q) =>
            q.eq('faction_id', createdRow._id).eq('asset_type', 'faction_sheet')
          )
          .unique()
    );
    expect(createdTarget).toMatchObject({
      desired_generation: 1,
      status: 'pending',
    });
    if (!createdTarget) throw new Error('Missing faction sheet target after create');

    const rulesetId = await t.run(async (ctx) => {
      const id = await ctx.db.insert('rulesets', {
        name: 'Canonical transition proof',
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
      background_format: 'canonical',
    });
    expect(FactionStoredSchema.parse(canonicalCreatePage.faction.data)).toEqual(createdInput);
    await expect(
      asUser.query(api.factions.listForLoadPicker, {
        background_format: 'canonical',
      })
    ).resolves.toMatchObject({
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
    await expect(
      t.query(api.factions.cataloguePage, {
        background_format: 'canonical',
      })
    ).resolves.toMatchObject({
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
    await expect(
      t.query(api.rulesets.factionDetails, {
        ruleset_id: rulesetId,
        background_format: 'canonical',
      })
    ).resolves.toMatchObject([
      {
        identity: {
          background: {
            invert: false,
          },
        },
      },
    ]);

    const editedInput: FactionInput = {
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
    };
    const updatedRow = await asUser.mutation(api.factions.update, {
      id: createdRow._id,
      data: editedInput,
      background_format: 'canonical',
    });

    expect(updatedRow.slug).toBe('complete-authoring-proof-revised');
    const canonicalEditPage = await t.query(api.factions.getBySlug, {
      slug: updatedRow.slug,
      background_format: 'canonical',
    });
    const reloaded = FactionStoredSchema.parse(canonicalEditPage.faction.data);
    expect(reloaded).toEqual(editedInput);
    expect(JSON.stringify(reloaded.extras)).toBe(extrasBytes);
    expect(reloaded.colors).toEqual(editedInput.colors);
    expect(reloaded.leaders).toEqual(editedInput.leaders);
    expect(reloaded.decals).toEqual(editedInput.decals);
    expect(reloaded.troops).toEqual(editedInput.troops);
    expect(reloaded.planet).toEqual(editedInput.planet);
    expect(reloaded.rules.advantages).toEqual(editedInput.rules.advantages);

    await expect(
      t.query(api.factions.getBySlug, { slug: 'complete-authoring-proof' })
    ).rejects.toThrow('not found');
    await expect(
      t.run(async (ctx) => await ctx.db.get('asset_targets', createdTarget._id))
    ).resolves.toMatchObject({
      desired_generation: 2,
      status: 'pending',
    });
  });

  test('round-trips a legacy read and save without losing canonical-only background data', async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(
      async (ctx) => await ctx.db.insert('users', { name: 'Legacy bridge proof user' })
    );
    await t.run(
      async (ctx) =>
        await ctx.db.insert('profiles', {
          user_id: userId,
          username: 'Legacy bridge proof user',
          avatar_url: null,
          slug: 'legacy-bridge-proof-user',
          created_at: '2026-07-24T09:00:00.000Z',
          updated_at: '2026-07-24T09:00:00.000Z',
        })
    );
    const asUser = t.withIdentity({ subject: userId });
    const canonicalInput = representativeFullFieldFaction();
    const created = await asUser.mutation(api.factions.create, {
      data: canonicalInput,
      group_id: null,
      background_format: 'canonical',
    });

    const legacyRead = await t.query(api.factions.getBySlug, { slug: created.slug });
    const legacyData = LegacyFactionInputSchema.parse(legacyRead.faction.data);
    expect(legacyData.planet?.[0].image).toBe('https://dune.zone/image/planet/01.png');

    legacyData.rules.revivalText = 'Edited by the deployed legacy client.';
    const legacySave = await asUser.mutation(api.factions.update, {
      id: created._id,
      data: legacyData,
    });
    expect(LegacyFactionInputSchema.safeParse(legacySave.data).success).toBe(true);

    const canonicalReload = await t.query(api.factions.getBySlug, {
      slug: created.slug,
      background_format: 'canonical',
    });
    const reloaded = FactionInputSchema.parse(canonicalReload.faction.data);
    expect(reloaded.background.invert).toBe(false);
    expect(reloaded.planet?.[0].image).toBe('/image/planet/01.png');
    expect(reloaded.rules.revivalText).toBe('Edited by the deployed legacy client.');
  });
});
