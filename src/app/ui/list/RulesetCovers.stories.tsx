import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { RulesetCovers } from './RulesetCovers';
import { citedRulesets, coverNames, expectCountFits } from './RulesetCovers.stories.fixture';

const meta = preview.meta({
  component: RulesetCovers,
  parameters: { layout: 'centered' },
  args: { rulesets: citedRulesets.slice(0, 3), size: 22 },
});

/** Every ruleset as its cover; the third has no cover and shows its initial. */
export const Default = meta.story({
  play: async ({ canvasElement }) => {
    const covers = within(canvasElement).getByRole('group', {
      name: 'Rulesets: Advanced Dune, Classic Dune, Tournament Dune',
    });
    await expect(coverNames(covers)).toEqual(['Advanced Dune', 'Classic Dune', 'Tournament Dune']);
    await expect(within(covers).getByText('T')).toBeVisible();
  },
});

/** With a limit, one ruleset more than it turns the last place into a count of the rest, whole in its ring at the smallest size a card uses. */
export const Limited = meta.story({
  args: { rulesets: citedRulesets, limit: 4, size: 18 },
  play: async ({ canvasElement }) => {
    const covers = within(canvasElement).getByRole('group', { name: /^Rulesets:/ });
    await expect(coverNames(covers)).toEqual(['Advanced Dune', 'Classic Dune', 'Tournament Dune', '+5']);
    await expectCountFits(covers);
    await expect(Number.parseFloat(getComputedStyle(within(covers).getByText('+5')).fontSize)).toBeGreaterThanOrEqual(
      9
    );
  },
});
