import preview from '@sb/preview';
import { fn } from 'storybook/test';

import { ListLengthActions } from './ListLengthActions';

const meta = preview.meta({
  title: 'List Length Actions',
  component: ListLengthActions,
  parameters: {
    layout: 'centered',
  },
  args: {
    addLabel: 'Add item',
    removeLabel: 'Remove last item',
    onAdd: fn(),
    onRemove: fn(),
  },
});

export const Default = meta.story({});

export const AtMinimum = meta.story({
  args: {
    removeDisabled: true,
  },
});

export const AtMaximum = meta.story({
  args: {
    addDisabled: true,
  },
});
