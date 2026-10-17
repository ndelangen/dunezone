import preview from '@sb/preview';
import { Link } from '@tanstack/react-router';
import { expect, within } from 'storybook/test';

import { CallToAction } from './CallToAction';

const toFactionCreate = (rootProps: Record<string, unknown>) => <Link {...rootProps} to="/factions/create" />;

const meta = preview.meta({
  component: CallToAction,
  parameters: { layout: 'centered' },
  args: {
    children: 'Create your own faction',
    renderRoot: toFactionCreate,
  },
});

/** Creating something new: a leading plus. */
export const Start = meta.story({});

/** Continuing a journey already begun: a trailing arrow. */
export const Forward = meta.story({
  args: { direction: 'forward', children: 'Start creating' },
});

/** The compact size. The icon scales down with the button. */
export const Small = meta.story({
  args: { size: 'sm' },
});

/**
 * Pulses every five seconds.
 * Watch for a moment, and note it stops entirely under `prefers-reduced-motion`.
 * Reserve it for a page whose whole purpose is this one action.
 */
export const Attention = meta.story({
  args: { attention: true },
  play: async ({ canvasElement }) => {
    const action = within(canvasElement).getByRole('link', { name: 'Create your own faction' });
    await expect(getComputedStyle(action).animationName).toMatch(/attention/);
  },
});

/** Long labels keep the icon pinned to the edge rather than centring with the text. */
export const LongLabel = meta.story({
  args: { children: 'Create a faction nobody has seen before' },
  parameters: { layout: 'padded' },
  globals: { viewport: { value: 'contentNarrow' } },
});
