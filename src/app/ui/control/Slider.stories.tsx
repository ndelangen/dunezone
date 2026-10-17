import { Slider } from '@mantine/core';
import preview from '@sb/preview';

const meta = preview.meta({
  component: Slider,
  globals: {
    backgrounds: { value: 'light', grid: false },
  },
  parameters: {
    layout: 'padded',
  },
  args: {
    thumbLabel: 'Slider',
    min: 2,
    max: 18,
    defaultValue: 6,
  },
});

export const Default = meta.story({});

export const WithMarks = meta.story({
  args: {
    marks: [2, 6, 10, 14, 18].map((value) => ({ value, label: String(value) })),
    mb: 'md',
  },
});
