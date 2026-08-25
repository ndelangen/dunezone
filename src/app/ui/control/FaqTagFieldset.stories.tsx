import preview from '@sb/preview';
import { fn } from 'storybook/test';

import { FaqTagFieldset } from './FaqTagFieldset';

const meta = preview.meta({
  component: FaqTagFieldset,
  parameters: { layout: 'centered' },
  globals: { backgrounds: { value: 'light', grid: false } },
});

/** The ask form's shape: an uncontrolled form field named `tags`, with the default tag pre-checked. */
export const Default = meta.story({});

/** The edit session's shape: the caller owns the selection and hears every flip. */
export const Controlled = meta.story({
  args: {
    value: ['rules', 'other'],
    onToggle: fn(),
  },
});
