import { testingPreview } from '@sb/preview';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Send } from 'lucide-react';
import { expect, fn, userEvent, within } from 'storybook/test';

import { LabeledAction } from './LabeledAction';

const meta = testingPreview.meta({
  title: 'LabeledAction',
  component: LabeledAction,
  parameters: { layout: 'centered' },
  args: { children: 'Reset filters', icon: <ArrowLeft size={16} /> },
});

/** The words are the accessible name, and the glyph stays out of it. */
export const NamedByItsWords = meta.story({
  args: { onClick: fn() },
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Reset filters' });
    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
});

/** Given a root, it is a link and not a button. */
export const RendersAsALink = meta.story({
  args: { children: 'Go to page 3', renderRoot: (props) => <Link {...props} to="/factions" /> },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('link', { name: 'Go to page 3' })).toHaveAttribute(
      'href',
      '/factions'
    );
  },
});

/** A disabled action says why, and a press does nothing. */
export const DisabledSaysWhy = meta.story({
  args: {
    children: 'Publish faction',
    icon: <Send size={16} />,
    intent: 'publish',
    disabledReason: 'Add a name first.',
    onClick: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Publish faction' });
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    await expect(button).toHaveAccessibleDescription('Add a name first.');
    await userEvent.click(button);
    await expect(args.onClick).not.toHaveBeenCalled();
  },
});
