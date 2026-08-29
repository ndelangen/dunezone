import { Avatar, Text } from '@mantine/core';
import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { PageLayout } from '../layout/PageLayout';
import { PageIdentity } from './PageIdentity';
import type { PageIdentityProps } from './PageIdentity';

/**
 * The band's ink and treatment come from the header's scheme-pinned paper, so each story mounts the real `PageLayout` and declares a compact header the way the five band pages do.
 */
function InHeader(props: PageIdentityProps) {
  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <PageIdentity {...props} />
      </PageLayout.Header>
      <PageLayout.Content>
        <span />
      </PageLayout.Content>
    </PageLayout>
  );
}

const meta = preview.meta({
  component: PageIdentity,
  parameters: { layout: 'fullscreen' },
  render: (args: PageIdentityProps) => <InHeader {...args} />,
  args: {
    title: 'ClassicRules',
    media: <Avatar name="ClassicRules" radius="md" size="100%" color="dune" />,
    breadcrumb: <PageIdentity.Breadcrumb to="/rulesets">Rulesets</PageIdentity.Breadcrumb>,
    children: <Text size="sm">Maintained by the Arrakeen Rules Council</Text>,
  },
});

/**
 * The full band: media, breadcrumb, name, and a meta line, in the pinned paper ink.
 *
 * The breadcrumb is sized by its word rather than by the column it sits in.
 * The column is a flex column, so without that the anchor stretched the full width and a click on empty band navigated: 628px of hit area for one word on the ruleset page.
 */
export const Default = meta.story({
  play: async ({ canvasElement }) => {
    const band = within(canvasElement);
    const crumb = await band.findByRole('link', { name: 'Rulesets' });
    const column = crumb.parentElement ?? crumb;
    expect(crumb.getBoundingClientRect().width).toBeLessThan(column.getBoundingClientRect().width);
  },
});

/** A page with no identity media: the text column keeps its edge and the name leads. */
export const WithoutMedia = meta.story({
  args: { media: undefined },
});

/** The top of a branch has no way up, so the name sits first in the column. */
export const WithoutBreadcrumb = meta.story({
  args: { breadcrumb: undefined },
});
