import { testingPreview } from '@sb/preview';
import { Link } from '@tanstack/react-router';
import { expect, userEvent, waitFor, within } from 'storybook/test';

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
 * Pulses every five seconds, the first four seconds in, and is still between pulses.
 * It stops entirely under `prefers-reduced-motion`, so Chromatic, which captures with reduced motion, would show the Start story again;
 * this file runs the play in CI only.
 * Reserve it for a page whose whole purpose is this one action.
 */
export const Attention = meta.story({
  globals: { motion: 'on' },
  args: { attention: true },
  play: async ({ canvasElement }) => {
    const action = within(canvasElement).getByRole('link', { name: 'Create your own faction' });
    /* Nothing runs while it waits for its pulse. */
    await expect(action.getAnimations()).toEqual([]);
    await waitFor(() => expect(getComputedStyle(action).animationName).toMatch(/attention/), { timeout: 6000 });
    /* A pulse ends on its own and leaves the button still again. */
    await waitFor(() => expect(action).not.toHaveAttribute('data-pulse'), { timeout: 3000 });
    await expect(action.getAnimations()).toEqual([]);
  },
});

/** A submitting call is a submit button, and while busy it says so. */
export const SubmitWhileBusy = meta.story({
  args: { renderRoot: undefined, submit: true, busy: true, children: 'Create game' },
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Create game' });
    await expect(button).toHaveAttribute('type', 'submit');
    await expect(button).toHaveAttribute('aria-disabled', 'true');
  },
});

/** Not open yet: the reason is the button's description as well as its hover text. */
export const DisabledSaysWhy = meta.story({
  args: { disabledReason: 'Choose a ruleset first.' },
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Create your own faction' });
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    await expect(button).toHaveAccessibleDescription('Choose a ruleset first.');
    await userEvent.click(button);
  },
});
