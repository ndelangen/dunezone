import preview from '@sb/preview';

import { PageLayout } from '../layout/PageLayout';
import type { PageHeaderSize } from '../layout/PageLayout';
import { PageTitle } from './PageTitle';
import type { PageTitleProps } from './PageTitle';

/**
 * The treatment is not an argument, so a story cannot set it with one.
 * A page declares what kind of header it has and this reads it back, so each story mounts the real
 * `PageLayout` and declares the header the same way a route does.
 */
function InHeader({ size, ...props }: PageTitleProps & { size?: PageHeaderSize }) {
  return (
    <PageLayout>
      <PageLayout.Header size={size}>
        <PageTitle {...props} />
      </PageLayout.Header>
      <PageLayout.Content>
        <span />
      </PageLayout.Content>
    </PageLayout>
  );
}

const meta = preview.meta({
  component: PageTitle,
  parameters: { layout: 'padded' },
  render: (args: PageTitleProps & { size?: PageHeaderSize }) => <InHeader {...args} />,
  args: {
    title: 'Faction catalogue',
    eyebrow: 'Explore the collection',
  },
});

/** The app's heading face, which is what a page gets unless it declares otherwise. */
export const Default = meta.story({});

/** A page whose name needs no classifier above it. */
export const WithoutEyebrow = meta.story({
  args: { eyebrow: undefined },
});

/** A page that declares a hero header: the shields' Desdemona face, uppercase, fluid against the viewport. */
export const Hero = meta.story({
  args: { size: 'hero', title: 'Make Dune your own', eyebrow: 'A game of conquest, diplomacy & betrayal' },
});

/** Long names wrap balanced rather than leaving a one-word last line. */
export const LongTitleWraps = meta.story({
  args: { size: 'hero', title: 'A game of conquest, diplomacy and betrayal on Arrakis', eyebrow: undefined },
});
