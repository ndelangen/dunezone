import { describe, expect, it } from 'vite-plus/test';

import type { Faction } from '@db/factions';
import { defaultFaction } from '@app/widgets/faction-editor/defaultFaction';

import { draftWithinRights } from './factionEditRights';

const stored = defaultFaction;
const draft: Faction = {
  ...stored,
  name: 'Renamed',
  themeColor: '#123456',
  factionLeader: { ...stored.factionLeader, name: 'Another leader' },
};

describe('draftWithinRights', () => {
  it('keeps the whole draft for someone who maintains both the Faction and the variant', () => {
    expect(draftWithinRights(draft, stored, { shared: true, variant: true })).toEqual(draft);
  });

  it('puts the shared fields back for someone who maintains the variant alone', () => {
    expect(draftWithinRights(draft, stored, { shared: false, variant: true })).toEqual({
      ...draft,
      name: stored.name,
      themeColor: stored.themeColor,
    });
  });

  it('sends only the shared fields for someone who maintains the Faction alone', () => {
    expect(draftWithinRights(draft, stored, { shared: true, variant: false })).toEqual({
      ...stored,
      name: 'Renamed',
      themeColor: '#123456',
    });
  });
});
