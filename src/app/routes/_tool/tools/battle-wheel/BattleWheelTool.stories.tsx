import preview from '@sb/preview';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import type { FactionToken } from '@app/widgets/faction-token/FactionTokenFace';
import { FactionSearchList } from '@app/widgets/treachery-tracker/FactionSearchList';

import { STORY_FACTIONS, STORY_RULESETS } from './battleWheel.stories.fixture';
import { BattleWheelTool } from './BattleWheelTool';
import type { FactionChoice } from './battleWheel';
import type { FactionSearch } from './BattleWheelTool';
import type { WheelState } from './useBattleWheel';

/*
 * The battle wheel tool on a phone at the table (Norbert, 2026-11-09): pick a leader and dial troops, and the dial and the total
 * strength are counted the way the Ruleset dials. No Treachery cards. The cog switches the Ruleset and the faction; any faction on
 * Dune Zone can be found by search (here, GF9's twelve).
 */
const meta = preview.meta({
  title: 'Tools/Battle wheel',
  parameters: { layout: 'fullscreen' },
  globals: { viewport: { value: 'appMobile' }, motion: 'on' },
});

const faction = (id: string) => STORY_FACTIONS.find((candidate) => candidate.id === id)!;

/* The base game's six come first; search reaches every faction on Dune Zone. */
const STARTING: readonly FactionChoice[] = STORY_FACTIONS.slice(0, 6);
const PUBLISHED_TOKEN: Readonly<Record<string, string>> = {
  atreides: 'house-atreides',
  harkonnen: 'house-harkonnen',
  emperor: 'emperor',
  'spacing-guild': 'spacing-guild',
  fremen: 'fremen',
  'bene-gesserit': 'bene-gesserit',
};
const TOKENS: readonly FactionToken[] = STORY_FACTIONS.map((known) => ({
  id: known.id,
  name: known.name,
  src: PUBLISHED_TOKEN[known.id] && `/play-fixtures/product/${PUBLISHED_TOKEN[known.id]}-token.jpg`,
}));

const StorySearch: FactionSearch = ({ seated, onPick }) => {
  const [query, setQuery] = useState('');
  const found = TOKENS.filter((token) => token.name.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <FactionSearchList
      query={query}
      onQuery={setQuery}
      factions={found}
      seated={seated}
      status="done"
      onMore={() => undefined}
      onPick={onPick}
    />
  );
};

const loadStoryFaction = async (picked: Readonly<{ id: string }>) => faction(picked.id);

function Tool({ name, initial }: Readonly<{ name: string; initial?: WheelState }>) {
  return (
    <BattleWheelTool
      storageKey={`battle-wheel-story-${name}`}
      initial={initial}
      rulesets={STORY_RULESETS}
      defaultRulesetId="gf9"
      factions={STARTING}
      search={StorySearch}
      loadFaction={loadStoryFaction}
    />
  );
}

/** The Emperor under GF9's Advanced dialing: Fenring, three troops and two Sardaukar, two spice supporting the Sardaukar. */
export const Emperor = meta.story({
  render: () => (
    <Tool
      name="emperor"
      initial={{
        rulesetId: 'gf9',
        faction: faction('emperor'),
        plan: { leaderId: 'emperor-0', leaderX: 0, troops: { 'emperor-0': 3, 'emperor-1': 2 }, spice: 2 },
      }}
    />
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Pays 2 spice')).toBeVisible();
  },
});

/** KISS with the Fremen: troops at full strength, and troops that cost nothing dial for free. */
export const KissFremen = meta.story({
  render: () => (
    <Tool
      name="kiss-fremen"
      initial={{
        rulesetId: 'kiss',
        faction: faction('fremen'),
        plan: { leaderId: 'fremen-0', leaderX: 0, troops: { 'fremen-0': 4, 'fremen-1': 2 }, spice: 0 },
      }}
    />
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('KISS · KISS dialing')).toBeVisible();
  },
});

/** A first visit: no faction yet, so the picker is open on the base six, with a search for any other. */
export const FirstVisit = meta.story({
  render: () => <Tool name="first-visit" />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Add Ecaz' }));
    await expect(await within(canvasElement).findByText('Ecaz')).toBeVisible();
  },
});
