import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { citedRulesets } from '../block/FactionCard.stories.fixture';
import { RulesetCovers } from './RulesetCovers';

const meta = preview.meta({
  component: RulesetCovers,
  parameters: { layout: 'centered' },
  args: { rulesets: citedRulesets.slice(0, 3), size: 22 },
});

/** Every ruleset as its cover, named on hover; the third has no cover and shows its initial. */
export const Default = meta.story({
  play: async ({ canvasElement }) => {
    const covers = within(canvasElement).getByRole('group', {
      name: 'Rulesets: Advanced Dune, Classic Dune, Tournament Dune',
    });
    await expect(
      within(covers)
        .getAllByRole('img')
        .map((disc) => disc.getAttribute('aria-label'))
    ).toEqual(['Advanced Dune', 'Classic Dune', 'Tournament Dune']);
    await expect(within(covers).getByText('T')).toBeVisible();
  },
});

/** With a limit, one ruleset more than it turns the last place into a count that fits its disc and names the rest on hover. */
export const Limited = meta.story({
  args: { rulesets: citedRulesets, limit: 4, size: 18 },
  play: async ({ canvasElement }) => {
    const covers = within(canvasElement).getByRole('group', { name: /^Rulesets:/ });
    await expect(covers.children).toHaveLength(4);
    const count = within(covers).getByText('+5');
    await expect(count.scrollWidth).toBeLessThanOrEqual(count.clientWidth);
    await expect(Number.parseFloat(getComputedStyle(count).fontSize)).toBeGreaterThanOrEqual(9);
    await userEvent.hover(count);
    const tooltip = await within(canvasElement.ownerDocument.body).findByRole('tooltip', {
      name: 'Spring Cup, Dreamrules, Sietch house rules, Landsraad, Two players',
    });
    await waitFor(() => expect(tooltip).toBeVisible());
  },
});

/** A limit the rulesets fit within shows them all. */
export const WithinLimit = meta.story({
  args: { rulesets: citedRulesets.slice(0, 4), limit: 4 },
  play: async ({ canvasElement }) => {
    const covers = within(canvasElement).getByRole('group', { name: /^Rulesets:/ });
    await expect(covers.children).toHaveLength(4);
    await expect(within(covers).queryByText(/^\+/)).toBeNull();
  },
});

/** No ruleset renders nothing. */
export const None = meta.story({
  args: { rulesets: [] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('group')).toBeNull();
  },
});
