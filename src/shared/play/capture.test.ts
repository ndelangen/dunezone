import { describe, expect, it } from 'vitest';

import { assetPublishingFaction } from '../factions/fixtures/assetPublishingFaction';
import { toStoredHeroKey } from '../factions/schema';
import { factionCaptureSchema, factionDefinitionSchema } from './capture';

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
  });

  it('keeps a `hero`-keyed catalogue answer as it is', () => {
    const data = toStoredHeroKey(assetPublishingFaction);

    expect(factionDefinitionSchema.parse({ ...definition, data }).data).toEqual(data);
  });

  it('stores a capture definition under `hero`, whichever key it arrives with', () => {
    const stored = toStoredHeroKey(assetPublishingFaction);
    const decoder = factionCaptureSchema.shape.definition;

    expect(decoder.parse(assetPublishingFaction)).toEqual(stored);
    expect(decoder.parse(stored)).toEqual(stored);
  });
});
