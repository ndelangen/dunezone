import { testingPreview } from '@sb/preview';
import { Link } from '@tanstack/react-router';
import { expect, within } from 'storybook/test';

import { CallToAction } from './CallToAction';

const toFactionCreate = (rootProps: Record<string, unknown>) => <Link {...rootProps} to="/factions/create" />;

const meta = testingPreview.meta({
  title: 'CallToAction',
  component: CallToAction,
  parameters: { layout: 'centered' },
  args: {
    children: 'Create your own faction',
    renderRoot: toFactionCreate,
  },
});

/**
 * Pulses every five seconds.
 * It stops entirely under `prefers-reduced-motion`, so Chromatic, which captures with reduced motion, would show the Start story again;
 * this file runs the play in CI only.
 * Reserve it for a page whose whole purpose is this one action.
 */
export const Attention = meta.story({
  globals: { motion: 'on' },
  args: { attention: true },
  play: async ({ canvasElement }) => {
    const action = within(canvasElement).getByRole('link', { name: 'Create your own faction' });
    await expect(getComputedStyle(action).animationName).toMatch(/attention/);
  },
});
