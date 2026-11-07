import preview from '@sb/preview';

import { PageLayout } from '../layout/PageLayout';
import { Breadcrumb } from './Breadcrumb';

const meta = preview.meta({
  component: Breadcrumb,
  parameters: { layout: 'padded' },
  /* The treatment is the band's inverse ink, so the story mounts it where a page does. */
  render: () => (
    <PageLayout>
      <PageLayout.Header size="compact">
        <Breadcrumb to="/assets">Assets</Breadcrumb>
      </PageLayout.Header>
      <PageLayout.Content>
        <span />
      </PageLayout.Content>
    </PageLayout>
  ),
});

/** The way up one level: the parent's name in the eyebrow treatment, after a chevron, as a link there. */
export const Default = meta.story({});
