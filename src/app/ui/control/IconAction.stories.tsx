import { Group } from '@mantine/core';
import preview from '@sb/preview';
import { ArrowLeft, Check, Copy, Download, Pencil, Send, Trash2 } from 'lucide-react';
import { expect, within } from 'storybook/test';

import { IconAction } from './IconAction';

const meta = preview.meta({
  component: IconAction,
  parameters: { layout: 'centered' },
  globals: { backgrounds: { value: 'light', grid: false } },
  args: {
    label: 'Edit group settings',
    icon: <Pencil size={17} aria-hidden />,
    /* Meta-level literals widen through the factory's inference, so the strict union needs the pin. */
    emphasis: 'standard' as const,
    size: 'lg',
  },
});

/** The label is the hover text and the accessible name at once. No intent stated, which leaves the theme's primary colour, as the drag handle does. */
export const Default = meta.story({});

/** Destructive actions carry the danger colour, per the intent mapping. */
export const Destructive = meta.story({
  args: { label: 'Delete answer', icon: <Trash2 size={17} aria-hidden />, intent: 'negative' },
});

/** The positive primary action of a toolbar. */
export const Confirm = meta.story({
  args: {
    label: 'Mark as accepted answer',
    icon: <Check size={17} aria-hidden />,
    emphasis: 'strong',
    intent: 'positive',
  },
});

/** Neutral navigation, the most common shape in a page toolbar. */
export const Navigation = meta.story({
  args: { label: 'Back to profiles', icon: <ArrowLeft size={17} aria-hidden />, intent: 'neutral' },
});

/** While its mutation is in flight. */
export const Disabled = meta.story({
  args: {
    label: 'Delete group',
    icon: <Trash2 size={17} aria-hidden />,
    intent: 'negative',
    disabled: true,
  },
});

/** When the glyph needs more explanation than its name, the hover text can say more. */
export const LongerTooltip = meta.story({
  args: {
    label: 'Sync migration status',
    tooltip: 'Sync status snapshot to migration_runs table',
    icon: <Check size={17} aria-hidden />,
  },
});

/**
 * Every meaning at standard emphasis, then a toggle that is on, then the two strong fills (Norbert, 2026-09-29).
 * Slate changes nothing, green creates or keeps, violet publishes, cyan hands over a file, and red loses something for good.
 */
export const Meanings = meta.story({
  render: () => (
    <Group gap="xs">
      <IconAction
        label="Back"
        intent="neutral"
        emphasis="standard"
        size="lg"
        icon={<ArrowLeft size={17} aria-hidden />}
      />
      <IconAction
        label="Show every copy"
        intent="neutral"
        emphasis="standard"
        size="lg"
        pressed
        icon={<Copy size={17} aria-hidden />}
      />
      <IconAction
        label="Create a card"
        intent="positive"
        emphasis="standard"
        size="lg"
        icon={<Check size={17} aria-hidden />}
      />
      <IconAction
        label="Download PDF"
        intent="export"
        emphasis="standard"
        size="lg"
        icon={<Download size={17} aria-hidden />}
      />
      <IconAction
        label="Publish"
        intent="publish"
        emphasis="standard"
        size="lg"
        icon={<Send size={17} aria-hidden />}
      />
      <IconAction
        label="Delete"
        intent="negative"
        emphasis="standard"
        size="lg"
        icon={<Trash2 size={17} aria-hidden />}
      />
      <IconAction
        label="Publish Edition 3"
        intent="publish"
        emphasis="strong"
        size="lg"
        icon={<Send size={17} aria-hidden />}
      />
      <IconAction label="Save" intent="positive" emphasis="strong" size="lg" icon={<Check size={17} aria-hidden />} />
    </Group>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Show every copy' })).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.getByRole('button', { name: 'Back' })).not.toHaveAttribute('aria-pressed');
  },
});
