import preview from '@sb/preview';

import { FormField } from './FormField';
import { TextField } from './TextField';

const meta = preview.meta({
  component: FormField,
});

export const WithLabelAndHint = meta.story({
  args: {
    label: 'Display name',
    hint: 'This name is shown publicly on your profile.',
    children: <TextField placeholder="Name" />,
  },
});

export const WithError = meta.story({
  args: {
    label: 'Slug',
    error: 'Slug must be unique and contain only letters, numbers, and dashes.',
    children: <TextField defaultValue="invalid slug!!" aria-invalid />,
  },
});
