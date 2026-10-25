import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { FactionList } from './FactionList';
import { factions } from './FactionList.stories.fixture';
import { expectFactionColumns } from './factionListPlay';

const meta = preview.meta({
  component: FactionList,
  parameters: { layout: 'padded' },
  args: { factions },
  argTypes: { className: { control: false } },
});

/**
 * The grid's rhythm is all this owns, and the tiles frame themselves.
 * From the tablet step the row takes as many columns as fit at 11.5rem or wider, which keeps a card around 200px: five across a laptop window.
 * A laptop window rather than a desktop one, because at 1200px the canvas's 1rem padding leaves a 1168px list and five columns, and the test run renders no padding, so its 1200px list shows six.
 */
export const Default = meta.story({
  globals: { viewport: { value: 'appLaptop' } },
  play: async ({ canvasElement }) => {
    await expectFactionColumns(canvasElement, 5);
  },
});

/** A list as wide as a phone's page is two columns across. */
export const Mobile = meta.story({
  globals: { viewport: { value: 'appMobile' } },
  play: async ({ canvasElement }) => {
    await expectFactionColumns(canvasElement, 2);
  },
});

/**
 * With a ruleset chosen, each tile marks its membership against that one rather than listing all of them, which is why this takes a slug rather than deriving it.
 * Classic is chosen because it is Fremen's second ruleset, so its caption changes where Advanced would leave it as it was.
 */
export const WithSelectedRuleset = meta.story({
  args: { selectedRulesetSlug: 'classic' },
  globals: { viewport: { value: 'appDesktop' } },
  play: async ({ canvasElement }) => {
    /* Every fixture tile carries the same faction document, so the ruleset captions tell them apart in list order. */
    const links = within(canvasElement).getAllByRole('link');
    const captions = ['Atreides Advanced Dune', 'Atreides Classic Dune', 'Atreides Classic Dune +1', 'Atreides'];
    for (const [index, caption] of captions.entries()) {
      await expect(links[index]).toHaveAccessibleName(`${caption} Novice complexity, 2 out of 10`);
    }
  },
});
