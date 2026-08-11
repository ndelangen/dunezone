import preview from '@sb/preview';
import { UsersRound } from 'lucide-react';

import { Section } from '../content/Section';
import { Card } from './Card';
import { SurfaceFiller } from './SurfaceFiller.stories.fixture';

const meta = preview.meta({
  title: 'Card',
  component: Card,
  parameters: { layout: 'padded' },
  args: {
    header: <Section icon={<UsersRound size={20} aria-hidden />} title="Stewardship" />,
    children: <SurfaceFiller />,
  },
});

/** The heading is required — it is what distinguishes a Card from a plain `Surface`. */
export const Default = meta.story({});

export const TallBody = meta.story({
  args: {
    header: <Section icon={<UsersRound size={20} aria-hidden />} title="Members" />,
    children: <SurfaceFiller height={320} />,
  },
});

/**
 * `subsection` for a card that is one division among several inside a larger region — the region's
 * own heading is already carrying the level above it.
 */
export const SubsectionHeading = meta.story({
  args: {
    header: <Section level="subsection" title="Setup changes" />,
  },
});

/** The sidebar width every Card in the app has to survive. */
export const Narrow = meta.story({
  args: {
    header: <Section icon={<UsersRound size={20} aria-hidden />} title="At a glance" />,
  },
  globals: { viewport: { value: 'contentNarrow' } },
});
