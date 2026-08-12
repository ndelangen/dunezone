import preview from '@sb/preview';

import { TextField } from './TextField';

const meta = preview.meta({
  component: TextField,
});

export const Default = meta.story({
  args: {
    placeholder: 'Name',
    type: 'text',
  },
});

export const Invalid = meta.story({
  args: {
    'aria-invalid': true,
    defaultValue: 'Bad value',
    type: 'text',
  },
});

export const Disabled = meta.story({
  args: {
    defaultValue: 'Read-only',
    disabled: true,
    type: 'text',
  },
});
