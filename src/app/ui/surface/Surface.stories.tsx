import { Stack } from '@mantine/core';
import preview from '@sb/preview';
import { Link } from '@tanstack/react-router';

import { Surface } from './Surface';
import { SurfaceFiller } from './SurfaceFiller.stories.fixture';

const meta = preview.meta({
  title: 'Surface',
  component: Surface,
  parameters: { layout: 'padded' },
  args: { children: <SurfaceFiller height={96} /> },
});

/**
 * The bare pane.
 * Note the grid showing through: the infill is translucent and blurred, which is what lets the desert artwork read behind it in the app.
 */
export const Default = meta.story({});

export const Borderless = meta.story({
  args: { withBorder: false },
});

/**
 * The gutters side by side: none for children that manage their own insets, sm for toolbars and single-line rows, md for prose and controls, the common case.
 */
export const Padding = meta.story({
  render: (args) => (
    <Stack gap="md">
      <Surface {...args} padding="none" />
      <Surface {...args} padding="sm" />
      <Surface {...args} padding="md" />
    </Stack>
  ),
});

/** Hover and focus it: lifts and brightens. Only for a pane that is itself the click target. */
export const Interactive = meta.story({
  args: {
    padding: 'sm',
    interactive: true,
    renderRoot: ({ className, children }) => (
      <Link to="/rulesets" className={className}>
        {children}
      </Link>
    ),
  },
});
