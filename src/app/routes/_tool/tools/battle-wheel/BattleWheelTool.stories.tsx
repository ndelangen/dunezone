import preview from '@sb/preview';
import { expect } from 'storybook/test';

import { StoryWheel } from './battleWheel.stories.fixture';

/*
 * The battle wheel tool on a phone at the table (Norbert, 2026-11-09): pick a leader and dial troops, and the dial and the total
 * strength are counted the way the Ruleset dials. No Treachery cards. The cog switches the Ruleset and the faction; any faction on
 * Dune Zone can be found by search.
 */
const meta = preview.meta({
  title: 'Tools/Battle wheel',
  parameters: { layout: 'fullscreen' },
  globals: { viewport: { value: 'appMobile' }, motion: 'on' },
});

/* A story check that one line of the wheel shows. */
const shows =
  (text: string) =>
  async ({ canvas }: Readonly<{ canvas: { getByText: (text: string) => HTMLElement } }>) => {
    await expect(canvas.getByText(text)).toBeVisible();
  };

/** The Emperor under GF9's Advanced dialing: Fenring, three troops and two Sardaukar, two spice supporting the Sardaukar. */
export const Emperor = meta.story({
  render: () => (
    <StoryWheel name="emperor" setup={{ rulesetId: 'gf9', faction: 'emperor', troops: [3, 2], spice: 2 }} />
  ),
  play: shows('Pays 2 spice'),
});

/** KISS with the Fremen: troops at full strength, and troops that cost nothing dial for free. */
export const KissFremen = meta.story({
  render: () => (
    <StoryWheel name="kiss-fremen" setup={{ rulesetId: 'kiss', faction: 'fremen', troops: [4, 2], spice: 0 }} />
  ),
  play: shows('KISS · KISS dialing'),
});

/** A first visit: no faction yet, so the picker is open on the base six, with a search for any other. */
export const FirstVisit = meta.story({
  render: () => <StoryWheel name="first-visit" />,
});
