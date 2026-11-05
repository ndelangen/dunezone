import { testingPreview } from '@sb/preview';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { RangeField } from './RangeField';

const meta = testingPreview.meta({
  title: 'RangeField',
  component: RangeField,
  args: {
    title: 'Horizontal offset',
    name: 'Horizontal icon offset',
    value: 0,
    min: -60,
    max: 60,
    onChange: () => undefined,
  },
  render: function Render(args) {
    const [value, setValue] = useState(args.value);
    return <RangeField {...args} value={value} onChange={setValue} />;
  },
});

/** The box and the slider answer to one name, and a typed value moves the slider. */
export const TypedValueMovesTheSlider = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const box = canvas.getByRole('textbox', { name: 'Horizontal icon offset' });
    await userEvent.clear(box);
    await userEvent.type(box, '12');
    await expect(canvas.getByRole('slider', { name: 'Horizontal icon offset slider' })).toHaveAttribute(
      'aria-valuenow',
      '12'
    );
  },
});

/** A value typed past the end is held to the slider's range once the box loses focus. */
export const TypedValueStaysInRange = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const box = canvas.getByRole('textbox', { name: 'Horizontal icon offset' });
    await userEvent.clear(box);
    await userEvent.type(box, '90');
    await userEvent.tab();
    await expect(box).toHaveValue('60');
  },
});

/** An offset's box goes past the slider's reach, so a typed value is kept as typed. */
export const TypedValueBeyondReach = meta.story({
  args: { typedBeyondRange: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const box = canvas.getByRole('textbox', { name: 'Horizontal icon offset' });
    await userEvent.clear(box);
    await userEvent.type(box, '90');
    await userEvent.tab();
    await expect(box).toHaveValue('90');
  },
});
