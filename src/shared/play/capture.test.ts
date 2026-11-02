import { describe, expect, it } from 'vite-plus/test';

import { assetPublishingFaction } from '../factions/fixtures/assetPublishingFaction';
import { toStoredHeroKey } from '../factions/schema';
import { factionCaptureSchema, factionDefinitionSchema, publicFaction, publicFactionSchema } from './capture';
import type { FactionCapture } from './capture';

/* The glossary term is "Faction leader"; the catalogue answer and stored captures keep the `hero` literal. */
describe('the `hero` literal on captures', () => {
  const definition = {
    faction: { id: 'faction-one', slug: 'atreides', name: assetPublishingFaction.name },
    token: null,
    cardbacks: { traitor: null, alliance: null },
    leaders: [],
  };

  it('reads a `factionLeader`-keyed catalogue answer and hands it on under `hero`', () => {
    const parsed = factionDefinitionSchema.parse({ ...definition, data: assetPublishingFaction });

    expect(parsed.data).toEqual(toStoredHeroKey(assetPublishingFaction));
    expect(parsed.data).not.toHaveProperty('factionLeader');
    expect(factionDefinitionSchema.parse({ ...definition, data: parsed.data }).data).toEqual(parsed.data);
  });

  it('stores a capture definition under `hero`, whichever key it arrives with', () => {
    const stored = toStoredHeroKey(assetPublishingFaction);
    const decoder = factionCaptureSchema.shape.definition;

    expect(decoder.parse(assetPublishingFaction)).toEqual(stored);
    expect(decoder.parse(stored)).toEqual(stored);
  });
});

describe('a faction sheet any viewer may read', () => {
  it('is the captured definition, not the live one, and leaves out troops, Extras and phases', () => {
    const definition = factionCaptureSchema.shape.definition.parse({
      ...assetPublishingFaction,
      rules: { ...assetPublishingFaction.rules, startText: 'Start as captured.' },
    });
    const sheet = publicFaction({ definition } as FactionCapture);

    expect(publicFactionSchema.parse(sheet)).toEqual(sheet);
    expect(sheet.rules.startText).toBe('Start as captured.');
    expect(sheet.leaders).toEqual(assetPublishingFaction.leaders);
    expect(Object.keys(sheet).sort()).toEqual(['background', 'leaders', 'logo', 'rules']);
  });
});
