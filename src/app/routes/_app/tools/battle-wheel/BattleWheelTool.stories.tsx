import preview from '@sb/preview';
import { useState } from 'react';
import { expect } from 'storybook/test';

import type { FactionToken } from '@app/widgets/faction-token/FactionTokenFace';
import { FactionSearchList } from '@app/widgets/treachery-tracker/FactionSearchList';

import { STORY_FACTIONS, STORY_RULESETS } from './battleWheel.stories.fixture';
import { BattleWheelTool } from './BattleWheelTool';
import type { FactionSearch, WheelLook } from './BattleWheelTool';
import type { WheelState } from './useBattleWheel';

/*
 * Prototypes of the battle wheel tool (Norbert, 2026-11-09): a phone stands in for the battle wheel at a real table.
 * A leader and the troops dialed give the dial and the total strength, counted the way the Ruleset dials; no Treachery cards.
 * Each story is one look at the same tool, live, so a direction can be picked. The cog switches Ruleset and faction.
 */
const meta = preview.meta({
  title: 'Tools/Battle wheel',
  parameters: { layout: 'fullscreen' },
  globals: { viewport: { value: 'appMobile' }, motion: 'on' },
});

/** The Emperor under GF9's Advanced dialing: Fenring, three troops and two Sardaukar, two spice supporting the Sardaukar. */
const EMPEROR: WheelState = {
  rulesetId: 'gf9',
  factionId: 'emperor',
  plan: { leaderId: 'emperor-0', leaderX: 0, troops: { 'emperor-0': 3, 'emperor-1': 2 }, spice: 2 },
};

/* The base game's six come first; search reaches every faction on Dune Zone (here, GF9's twelve). */
const STARTING = STORY_FACTIONS.slice(0, 6);
const PUBLISHED_TOKEN: Readonly<Record<string, string>> = {
  atreides: 'house-atreides',
  harkonnen: 'house-harkonnen',
  emperor: 'emperor',
  'spacing-guild': 'spacing-guild',
  fremen: 'fremen',
  'bene-gesserit': 'bene-gesserit',
};
const TOKENS: readonly FactionToken[] = STORY_FACTIONS.map((faction) => ({
  id: faction.id,
  name: faction.name,
  src: PUBLISHED_TOKEN[faction.id] && `/play-fixtures/product/${PUBLISHED_TOKEN[faction.id]}-token.jpg`,
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

const loadStoryFaction = async (token: FactionToken) => STORY_FACTIONS.find((faction) => faction.id === token.id)!;

function story(look: WheelLook, initial: WheelState = EMPEROR, name: string = look) {
  return (
    <BattleWheelTool
      storageKey={`battle-wheel-story-${name}`}
      initial={initial}
      rulesets={STORY_RULESETS}
      factions={STARTING}
      search={StorySearch}
      loadFaction={loadStoryFaction}
      look={look}
    />
  );
}

/** A: a drawn battle wheel. The rim turns to the dial under the window and the leader disc sits in the hub. */
export const Wheel = meta.story({
  render: () => story('wheel'),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Total strength')).toBeVisible();
  },
});

/** B: the answer first. Leader + dial = total stays pinned on top while the thumb works the steppers below. */
export const TotalFirst = meta.story({
  render: () => story('total'),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Total')).toBeVisible();
  },
});

/** C: every troop token the faction owns. Tap the fifth token to dial five; spice works the same. */
export const Tokens = meta.story({
  render: () => story('tokens'),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Dial 1 Sardaukar' })).toBeVisible();
  },
});

/** D: one slide per kind of troop, with the dial and the total in big numbers above. */
export const Sliders = meta.story({
  render: () => story('sliders'),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Dial')).toBeVisible();
  },
});

/** E: like the real wheel, the plan stays secret: lock it face down, hold to peek, reveal it full screen to the table. */
export const LockAndReveal = meta.story({
  render: () => story('reveal'),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Lock in the plan' })).toBeVisible();
  },
});

/** The same tool on KISS, with the Fremen: troops at full strength, free dialing for troops that cost nothing. */
export const KissFremen = meta.story({
  render: () =>
    story(
      'total',
      {
        rulesetId: 'kiss',
        factionId: 'fremen',
        plan: { leaderId: 'fremen-0', leaderX: 0, troops: { 'fremen-0': 4, 'fremen-1': 2 }, spice: 0 },
      },
      'kiss-fremen'
    ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('KISS · KISS dialing')).toBeVisible();
  },
});
