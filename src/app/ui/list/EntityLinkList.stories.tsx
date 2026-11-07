import preview from '@sb/preview';
import { RulesetLink } from '@ui/content/RulesetLink';
import { expect, within } from 'storybook/test';

import { EntityLinkList } from './EntityLinkList';

const RULESETS = [
  { slug: 'classicrules', name: 'ClassicRules' },
  { slug: 'dreamrules', name: 'Dreamrules' },
  { slug: 'advanced-2019', name: 'Advanced 2019 · Faction pool' },
];

const meta = preview.meta({
  component: EntityLinkList,
  parameters: { layout: 'padded' },
  args: {
    children: RULESETS.map((ruleset) => <RulesetLink key={ruleset.slug} slug={ruleset.slug} name={ruleset.name} />),
  },
});

/** One link per row, announced as a list of three. */
export const Default = meta.story({
  play: async ({ canvasElement }) => {
    const list = within(canvasElement).getByRole('list');
    await expect(within(list).getAllByRole('listitem')).toHaveLength(RULESETS.length);
    await expect(within(list).getByRole('link', { name: 'ClassicRules' })).toHaveAttribute(
      'href',
      '/rulesets/classicrules'
    );
  },
});
