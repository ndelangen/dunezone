import { Divider, Stack } from '@mantine/core';
import preview from '@sb/preview';
import { UsersRound } from 'lucide-react';
import { expect } from 'storybook/test';

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

/** The title is required; it is what distinguishes a Card from a plain `Surface`. */
export const Default = meta.story({});

/** The glyph is decorative, so a card reads the same without one. */
export const WithoutIcon = meta.story({
  args: { icon: undefined, title: 'About' },
});

/** One control beside the name: a status, or a single button. */
export const WithAction = meta.story({
  args: { title: 'Files', action: <StatusBadge tone="positive">Current</StatusBadge> },
});

/** A rule dividing the body runs from border to border, past the padding the title and content keep. */
export const Divided = meta.story({
  args: {
    title: 'Setup',
    children: (
      <Stack gap="lg">
        <SurfaceFiller height={48} />
        <Divider />
        <SurfaceFiller height={48} />
      </Stack>
    ),
  },
  play: async ({ canvasElement }) => {
    const rule = canvasElement.querySelector('[role="separator"]')!;
    const pane = rule.closest('section')!;
    await expect(Math.round(rule.getBoundingClientRect().width)).toBe(pane.clientWidth);
  },
});

/** The sidebar width every Card in the app has to survive. */
export const Narrow = meta.story({
  args: { title: 'At a glance' },
  globals: { viewport: { value: 'contentNarrow' } },
});

export const Linked = meta.story({
  args: {
    title: 'Media catalogue',
    interactive: true,
    padding: 'md',
    renderRoot: (props) => (
      <a {...props} href="/media">
        {props.children}
      </a>
    ),
  },
});
