import preview from '@sb/preview';
import { Avatar, Text } from '@mantine/core';

import { PageLayout } from '../layout/PageLayout';
import { PageIdentity } from './PageIdentity';
import type { PageIdentityProps } from './PageIdentity';

/**
 * The band's ink and treatment come from the header's scheme-pinned paper, so each story mounts the
 * real `PageLayout` and declares a compact header the way the five band pages do.
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

/** The full band: media, breadcrumb, name, and a meta line, in the pinned paper ink. */
export const Default = meta.story({});

/** A page with no identity media: the text column keeps its edge and the name leads. */
export const WithoutMedia = meta.story({
  args: { media: undefined },
});

/** The top of a branch has no way up, so the name sits first in the column. */
export const WithoutBreadcrumb = meta.story({
  args: { breadcrumb: undefined },
});
