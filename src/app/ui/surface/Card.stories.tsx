import preview from '@sb/preview';
import { UsersRound } from 'lucide-react';

import { StatusBadge } from '../content/StatusBadge';
import { Card } from './Card';
import { SurfaceFiller } from './SurfaceFiller.stories.fixture';

const meta = preview.meta({
  title: 'Card',
  component: Card,
  parameters: { layout: 'padded' },
  args: {
    title: 'Stewardship',
    icon: <UsersRound size={20} aria-hidden />,
    children: <SurfaceFiller />,
  },
});

/** The title is required — it is what distinguishes a Card from a plain `Surface`. */
export const Default = meta.story({});

/** The glyph is decorative, so a card reads the same without one. */
export const WithoutIcon = meta.story({
  args: { icon: undefined, title: 'About' },
});

/** One control beside the name — a status, or a single button. */
export const WithAction = meta.story({
  args: { title: 'Files', action: <StatusBadge tone="positive">Current</StatusBadge> },
});

export const TallBody = meta.story({
  args: { title: 'Members', children: <SurfaceFiller height={320} /> },
});

/** The sidebar width every Card in the app has to survive. */
export const Narrow = meta.story({
  args: { title: 'At a glance' },
  globals: { viewport: { value: 'contentNarrow' } },
});
