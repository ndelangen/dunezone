import preview from '@sb/preview';
import { ArrowLeft, Check, Pencil, Trash2 } from 'lucide-react';

import { IconAction } from './IconAction';

const meta = preview.meta({
  component: IconAction,
  parameters: { layout: 'centered' },
  globals: { backgrounds: { value: 'light', grid: false } },
  args: {
    label: 'Edit group settings',
    icon: <Pencil size={17} aria-hidden />,
    variant: 'light',
    color: 'dune',
    size: 'lg',
  },
});

/** The label is the hover text and the accessible name at once. */
export const Default = meta.story({});

/** Destructive actions carry the danger colour, per the intent mapping. */
export const Destructive = meta.story({
  args: { label: 'Delete answer', icon: <Trash2 size={17} aria-hidden />, color: 'red' },
});

/** The positive primary action of a toolbar. */
export const Confirm = meta.story({
  args: {
    label: 'Mark as accepted answer',
    icon: <Check size={17} aria-hidden />,
    variant: 'filled',
    color: 'confirm',
  },
});

/** Neutral navigation, the most common shape in a page toolbar. */
export const Navigation = meta.story({
  args: { label: 'Back to profiles', icon: <ArrowLeft size={17} aria-hidden />, color: 'gray' },
});

/** While its mutation is in flight. */
export const Disabled = meta.story({
  args: {
    label: 'Delete group',
    icon: <Trash2 size={17} aria-hidden />,
    color: 'red',
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
