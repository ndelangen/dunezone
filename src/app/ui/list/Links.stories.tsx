import preview from '@sb/preview';

import { Links } from './Links';

function groupItems(groups: Array<{ slug: string; name: string }>) {
  return groups.map((group) => (
    <Links.Item key={group.slug} to="/groups/$groupSlug" params={{ groupSlug: group.slug }}>
      {group.name}
    </Links.Item>
  ));
}

const meta = preview.meta({
  component: Links,
  parameters: { layout: 'padded' },
  args: {
    children: groupItems([
      { slug: 'testgroup', name: 'testgroup' },
      { slug: 'dreamers', name: 'dreamers' },
    ]),
  },
});

export const Default = meta.story({});

/** Long names wrap under the bullet rather than pushing the list wider. */
export const LongLabels = meta.story({
  args: {
    children: groupItems([
      { slug: 'landsraad', name: 'The Landsraad High Council Rules Committee' },
      { slug: 'spacing-guild', name: 'Spacing Guild Navigators and Heighliner Logistics' },
    ]),
  },
  globals: { viewport: { value: 'contentNarrow' } },
});
