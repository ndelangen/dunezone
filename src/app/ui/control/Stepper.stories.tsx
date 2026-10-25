import preview from '@sb/preview';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { Stepper } from './Stepper';
import type { StepperProps } from './Stepper';

function Controlled(props: Omit<StepperProps, 'value' | 'onChange'> & { initial: number }) {
  const [value, setValue] = useState(props.initial);
  return <Stepper {...props} value={value} onChange={setValue} />;
}

const meta = preview.meta({
  component: Controlled,
  parameters: { layout: 'centered' },
  globals: { backgrounds: { value: 'dark', grid: false } },
  args: { label: 'Spice to withdraw', initial: 1, min: 1, max: 5 },
});

/** − and + step the count, the wheel over it steps too, and a typed value commits on Enter or blur. */
export const Default = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await userEvent.click(page.getByRole('button', { name: 'More: Spice to withdraw' }));
    await expect(page.getByRole('textbox', { name: 'Spice to withdraw' })).toHaveValue('2');
    /* Typed past the limit, it settles on the limit. */
    await userEvent.clear(page.getByRole('textbox', { name: 'Spice to withdraw' }));
    await userEvent.type(page.getByRole('textbox', { name: 'Spice to withdraw' }), '9{Enter}');
    await expect(page.getByRole('textbox', { name: 'Spice to withdraw' })).toHaveValue('5');
  },
});

/** Small, with a suffix after the value. */
export const SmallWithSuffix = meta.story({ args: { size: 'sm', suffix: 'of 5' } });

/** Disabled, as while the table cannot be handled. */
export const Disabled = meta.story({ args: { disabled: true } });
