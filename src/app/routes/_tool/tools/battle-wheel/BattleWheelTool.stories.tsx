import preview from '@sb/preview';
import { expect } from 'storybook/test';

import { StoryWheel, storyFaction } from './battleWheel.stories.fixture';

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

/** The Emperor under GF9's Advanced dialing: Fenring, three troops and two Sardaukar, two spice supporting the Sardaukar. */
export const Emperor = meta.story({
  render: () => (
    <StoryWheel
      name="emperor"
      initial={{
        rulesetId: 'gf9',
        faction: storyFaction('emperor'),
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
    <StoryWheel
      name="kiss-fremen"
      initial={{
        rulesetId: 'kiss',
        faction: storyFaction('fremen'),
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
  render: () => <StoryWheel name="first-visit" />,
});
