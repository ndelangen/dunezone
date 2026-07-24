import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { defaultFaction } from '@data/defaultFaction';
import { FactionInputSchema } from '@game/schema/faction';

import {
  factionAuthoringCoverage,
  factionAuthoringWarnings,
  preserveFactionExtras,
} from './factionAuthoringContract';

function schemaLeafPaths(schema: z.ZodType, prefix = ''): string[] {
  if (
    schema instanceof z.ZodOptional ||
    schema instanceof z.ZodNullable ||
    schema instanceof z.ZodDefault
  ) {
    return schemaLeafPaths(schema.unwrap() as z.ZodType, prefix);
  }
  if (schema instanceof z.ZodObject) {
    return Object.entries(schema.shape).flatMap(([key, child]) =>
      schemaLeafPaths(child as z.ZodType, prefix ? `${prefix}.${key}` : key)
    );
  }
  if (schema instanceof z.ZodArray) {
    return schemaLeafPaths(schema.element as z.ZodType, `${prefix}[]`);
  }
  if (schema instanceof z.ZodTuple) {
    return schema._def.items.flatMap((child, index) =>
      schemaLeafPaths(child as z.ZodType, `${prefix}[${index}]`)
    );
  }
  if (schema instanceof z.ZodUnion) {
    return schema.options.flatMap((child) => schemaLeafPaths(child as z.ZodType, prefix));
  }
  return [prefix];
}

describe('faction authoring contract', () => {
  it('accounts for every schema leaf with a control, named task, or preserved exception', () => {
    const schemaPaths = [...new Set(schemaLeafPaths(FactionInputSchema))].sort();
    const coveragePaths = Object.keys(factionAuthoringCoverage).sort();

    expect(coveragePaths).toEqual(schemaPaths);
    expect(
      Object.entries(factionAuthoringCoverage)
        .filter(([, entry]) => entry.state !== 'control')
        .every(([, entry]) => entry.owner != null && entry.owner.length > 0)
    ).toBe(true);
  });

  it('preserves loaded extras byte-for-byte even if submitted form values are changed', () => {
    const baseline = {
      ...structuredClone(defaultFaction),
      extras: [
        {
          name: 'Existing TTS content',
          description: 'Not owned by the editor',
          items: [{ url: 'https://example.com/item.png', description: 'Existing item' }],
        },
      ],
    };
    const values = {
      ...structuredClone(baseline),
      name: 'Edited faction',
      extras: [{ name: 'Changed', items: [] }],
    };
    const baselineExtrasBytes = JSON.stringify(baseline.extras);

    const submitted = preserveFactionExtras(values, baseline);

    expect(submitted.name).toBe('Edited faction');
    expect(submitted.extras).toEqual(baseline.extras);
    expect(submitted.extras).not.toBe(baseline.extras);
    expect(JSON.stringify(submitted.extras)).toBe(baselineExtrasBytes);
  });

  it('round-trips optional and uncommon schema data without dropping it', () => {
    const baseline = structuredClone(defaultFaction);
    baseline.planet = [
      {
        image: '/image/planet/01.png',
        name: 'Planet Test',
        description: 'A world retained by the shared form state.',
      },
    ];
    baseline.troops[0].planet = 'Planet Test';
    baseline.extras = [
      {
        name: 'Existing extra',
        items: [{ url: 'https://example.com/extra.png' }],
      },
    ];

    const submitted = preserveFactionExtras(
      {
        ...structuredClone(baseline),
        rules: {
          ...structuredClone(baseline.rules),
          alliance: { text: '' },
        },
      },
      baseline
    );
    const parsed = FactionInputSchema.parse(submitted);

    expect(parsed.planet).toEqual(baseline.planet);
    expect(parsed.troops[0].planet).toBe('Planet Test');
    expect(parsed.extras).toEqual(baseline.extras);
    expect(parsed.rules.alliance.text).toBe('');
  });

  it('round-trips the complete Forces and Worlds and Rules and Advantages contract', () => {
    const faction = structuredClone(defaultFaction);
    faction.troops = [
      {
        ...faction.troops[0],
        name: 'Front guard',
        description: 'Front-side rules',
        count: 12,
        planet: 'World Alpha',
        striped: true,
        back: {
          image: faction.troops[0].image,
          name: 'Elite guard',
          description: 'Reverse-side rules',
          striped: undefined,
        },
      },
      {
        ...faction.troops[0],
        name: 'Reserve',
        description: 'One-sided rules',
        count: 5,
      },
    ];
    faction.planet = [
      {
        image: '/image/planet/02.png',
        name: 'World Alpha',
        description: 'First in faction order',
      },
      {
        image: '/image/planet/03.png',
        name: 'World Beta',
        description: 'Second in faction order',
      },
    ];
    faction.rules = {
      ...faction.rules,
      startText: 'Place forces on World Alpha.',
      revivalText: 'Revive one force normally.',
      spiceCount: 7,
      fate: {
        text: 'Fate without a title remains valid.',
      },
      advantages: [
        {
          title: 'First advantage',
          text: 'Primary rule text.',
          karama: 'Karama interaction.',
        },
        {
          text: 'Untitled rule without Karama.',
        },
      ],
    };

    const parsed = FactionInputSchema.parse(
      preserveFactionExtras(structuredClone(faction), faction)
    );

    expect(parsed.troops).toEqual(faction.troops);
    expect(parsed.troops[0].back).toEqual(faction.troops[0].back);
    expect(parsed.troops[0].planet).toBe('World Alpha');
    expect(parsed.troops[1].back).toBeUndefined();
    expect(parsed.troops[1].planet).toBeUndefined();
    expect(parsed.planet?.map((planet) => planet.name)).toEqual(['World Alpha', 'World Beta']);
    expect(parsed.rules.fate.title).toBeUndefined();
    expect(parsed.rules.advantages).toEqual(faction.rules.advantages);
    expect(parsed.rules.advantages[1].title).toBeUndefined();
    expect(parsed.rules.advantages[1].karama).toBeUndefined();
  });

  it('round-trips the complete Leaders and Alliance contract without reordering', () => {
    const faction = structuredClone(defaultFaction);
    faction.hero = {
      name: 'Faction hero',
      image: faction.hero.image,
    };
    faction.leaders = Array.from({ length: 10 }, (_, index) => ({
      name: `Leader ${index + 1}`,
      strength: index === 0 ? 'A' : index + 1,
      image: faction.hero.image,
    }));
    faction.rules.alliance.text = '';
    faction.decals = [
      {
        id: faction.logo,
        muted: false,
        outline: true,
        scale: 0.73,
        offset: [-412.5, 918.25],
      },
      {
        id: faction.troops[0].image,
        muted: true,
        outline: false,
        scale: 0,
        offset: [0, 0],
      },
    ];

    const parsed = FactionInputSchema.parse(
      preserveFactionExtras(structuredClone(faction), faction)
    );

    expect(parsed.hero).toEqual(faction.hero);
    expect(parsed.leaders).toEqual(faction.leaders);
    expect(parsed.leaders).toHaveLength(10);
    expect(parsed.leaders[0].strength).toBe('A');
    expect(parsed.leaders[9].strength).toBe(10);
    expect(parsed.rules.alliance.text).toBe('');
    expect(parsed.decals).toEqual(faction.decals);
    expect(parsed.decals.map((decal) => decal.id)).toEqual(faction.decals.map((decal) => decal.id));
  });

  it('keeps zero supporting leaders valid', () => {
    const faction = structuredClone(defaultFaction);
    faction.leaders = [];

    const parsed = FactionInputSchema.parse(faction);

    expect(parsed.leaders).toEqual([]);
  });

  it('keeps zero planets and optional troop and advantage fields valid', () => {
    const faction = structuredClone(defaultFaction);
    faction.planet = [];
    delete faction.troops[0].back;
    delete faction.troops[0].planet;
    faction.rules.fate.title = undefined;
    faction.rules.advantages = [{ text: 'No optional title or Karama.' }];

    const parsed = FactionInputSchema.parse(faction);

    expect(parsed.planet).toEqual([]);
    expect(parsed.troops[0].back).toBeUndefined();
    expect(parsed.troops[0].planet).toBeUndefined();
    expect(parsed.rules.fate.title).toBeUndefined();
    expect(parsed.rules.advantages[0]).toEqual({ text: 'No optional title or Karama.' });
  });

  it('blocks only the faction name among schema-valid authored blanks', () => {
    const faction = structuredClone(defaultFaction);
    faction.name = '   ';
    faction.hero.name = '';
    faction.rules.alliance.text = '';

    const parsed = FactionInputSchema.safeParse(faction);

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues).toEqual([
        expect.objectContaining({
          path: ['name'],
          message: 'Faction name is required because it determines the faction URL',
        }),
      ]);
    }
  });

  it('keeps likely-incomplete blanks advisory and grouped by chapter', () => {
    const faction = structuredClone(defaultFaction);
    faction.hero.name = '';
    faction.rules.alliance.text = '  ';
    faction.rules.startText = '';

    const warnings = factionAuthoringWarnings(faction);

    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'hero.name', chapter: 'hero' }),
        expect.objectContaining({ path: 'rules.alliance.text', chapter: 'alliance' }),
        expect.objectContaining({ path: 'rules.startText', chapter: 'rules' }),
      ])
    );
    expect(FactionInputSchema.safeParse(faction).success).toBe(true);
  });

  it('warns for incomplete chapter strings without warning on optional fields', () => {
    const faction = structuredClone(defaultFaction);
    faction.troops[0].description = '';
    faction.troops[0].back = {
      image: faction.troops[0].image,
      name: '',
      description: '',
    };
    faction.troops[0].planet = undefined;
    faction.planet = [
      {
        image: '/image/planet/01.png',
        name: '',
        description: '',
      },
    ];
    faction.rules.fate.title = undefined;
    faction.rules.advantages = [{ text: '', title: undefined, karama: undefined }];

    const warnings = factionAuthoringWarnings(faction);
    const warningPaths = warnings.map((warning) => warning.path);

    expect(warningPaths).toEqual(
      expect.arrayContaining([
        'troops[0].description',
        'planet[0].name',
        'planet[0].description',
        'rules.advantages[0].text',
      ])
    );
    expect(warningPaths).not.toContain('troops[0].planet');
    expect(warningPaths).not.toContain('rules.fate.title');
    expect(warningPaths).not.toContain('rules.advantages[0].title');
    expect(warningPaths).not.toContain('rules.advantages[0].karama');
    expect(
      warnings
        .filter((warning) => warning.path.startsWith('troops[0].back.'))
        .every((warning) => warning.chapter === 'forces')
    ).toBe(true);
    expect(
      warnings
        .filter((warning) => warning.path.startsWith('planet[0].'))
        .every((warning) => warning.chapter === 'worlds')
    ).toBe(true);
    expect(FactionInputSchema.safeParse(faction).success).toBe(true);
  });
});
