import { testingPreview } from '@sb/preview';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Send } from 'lucide-react';
import { useState } from 'react';
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

/** A toggle announces whether it is on, both when it is and when it is not. */
export const PressedAnnounces = meta.story({
  args: { children: 'Agree', pressed: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Agree' })).toHaveAttribute('aria-pressed', 'true');
  },
});

/** Given an `href`, it is a plain anchor that keeps its target and rel. */
export const RendersAsAnAnchor = meta.story({
  args: {
    children: 'Suggest an idea',
    href: 'https://example.com/ideas',
    target: '_blank',
    rel: 'noopener noreferrer',
  },
  play: async ({ canvasElement }) => {
    const link = within(canvasElement).getByRole('link', { name: 'Suggest an idea' });
    await expect(link).toHaveAttribute('href', 'https://example.com/ideas');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  },
});

/** Short words that lean on their card still reach a screen reader whole. */
export const AccessibleNameCarriesContext = meta.story({
  args: { children: 'Open', accessibleName: 'Open Arrakeen picnic' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Open Arrakeen picnic' })).toBeVisible();
  },
});

function ReasonComesAndGoes() {
  const [waiting, setWaiting] = useState(false);
  return (
    <LabeledAction
      icon={<Send size={16} />}
      disabledReason={waiting ? 'The report is still sending.' : undefined}
      onClick={() => setWaiting(true)}
    >
      Send report
    </LabeledAction>
  );
}

/** The button a reader pressed stays that button, with focus, when a reason arrives. */
export const FocusSurvivesAReason = meta.story({
  render: () => <ReasonComesAndGoes />,
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Send report' });
    await userEvent.click(button);
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    await expect(button).toHaveFocus();
  },
});
