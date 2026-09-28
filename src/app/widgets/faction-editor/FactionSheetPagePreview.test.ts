import { FactionRender } from '@shared/factions/schema';
import { describe, expect, it } from 'vitest';

import type { Faction } from '@db/factions';

import { representativeFaction } from './FactionAuthoringStoryFixtures';
import { defaultPhaseDeclaration } from './factionFormDefaults';
import { factionDraftForRenderer } from './FactionSheetPagePreview';

describe('factionDraftForRenderer', () => {
  it('keeps the review renderable while a phase row is still blank', () => {
    const draft: Faction = { ...representativeFaction(), extraPhases: [defaultPhaseDeclaration()] };
    expect(() => FactionRender.shield.parse(draft)).toThrow();
    expect(() => FactionRender.shield.parse(factionDraftForRenderer(draft))).not.toThrow();
    expect(() => FactionRender.sheet.parse(factionDraftForRenderer(draft))).not.toThrow();
  });
});
