import { Slider } from '@mantine/core';
import preview from '@sb/preview';

const meta = preview.meta({
  component: Slider,
  args: { thumbLabel: 'Position', defaultValue: 50, min: 0, max: 100 },
  parameters: { layout: 'padded' },
});
export const Default = meta.story({});
export const Disabled = meta.story({ args: { disabled: true } });
