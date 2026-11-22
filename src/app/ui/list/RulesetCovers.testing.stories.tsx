import { testingPreview } from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { RulesetCovers } from './RulesetCovers';
import { citedRulesets, coverNames } from './RulesetCovers.stories.fixture';

const meta = testingPreview.meta({
  component: RulesetCovers,
  parameters: { layout: 'centered' },
  args: { rulesets: citedRulesets, size: 22, limit: 4 },
});

/* The tooltip fades in, so it is waited for rather than read as it mounts. */
async function expectTooltip(canvasElement: HTMLElement, name: string) {
  const tooltip = await within(canvasElement.ownerDocument.body).findByRole('tooltip', { name });
  await waitFor(() => expect(tooltip).toBeVisible());
}

/** A cover names its ruleset on hover. */
export const CoverNamesItsRuleset = meta.story({
  play: async ({ canvasElement }) => {
    await userEvent.hover(within(canvasElement).getByRole('img', { name: 'Classic Dune' }));
    await expectTooltip(canvasElement, 'Classic Dune');
  },
});

/** The count names the rulesets it stands for on hover. */
export const CountNamesTheRest = meta.story({
  play: async ({ canvasElement }) => {
    await userEvent.hover(within(canvasElement).getByText('+5'));
    await expectTooltip(canvasElement, 'Spring Cup, Dreamrules, Sietch house rules, Landsraad, Two players');
  },
});

/** A limit the rulesets fit within shows them all. */
export const WithinLimit = meta.story({
  args: { rulesets: citedRulesets.slice(0, 4) },
  play: async ({ canvasElement }) => {
    const covers = within(canvasElement).getByRole('group', { name: /^Rulesets:/ });
    await expect(coverNames(covers)).toEqual(['Advanced Dune', 'Classic Dune', 'Tournament Dune', 'Spring Cup']);
  },
});

/** A limit below one is one place, so the row is the count alone and still names every ruleset. */
export const LimitBelowOne = meta.story({
  args: { rulesets: citedRulesets.slice(0, 3), limit: 0 },
  play: async ({ canvasElement }) => {
    const covers = within(canvasElement).getByRole('group', {
      name: 'Rulesets: Advanced Dune, Classic Dune, Tournament Dune',
    });
    await expect(coverNames(covers)).toEqual(['+3']);
  },
});

/** No ruleset renders nothing. */
export const None = meta.story({
  args: { rulesets: [] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('group')).toBeNull();
  },
});
