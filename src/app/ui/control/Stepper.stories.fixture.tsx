import { useState } from 'react';

import { Stepper } from './Stepper';
import type { StepperProps } from './Stepper';

/* The stepper holding its own value, as a form would. */
function Controlled(props: Omit<StepperProps, 'value' | 'onChange'> & { initial: number }) {
  const [value, setValue] = useState(props.initial);
  return <Stepper {...props} value={value} onChange={setValue} />;
}

export const stepperMeta = {
  component: Controlled,
  parameters: { layout: 'centered' },
  globals: { backgrounds: { value: 'dark', grid: false } },
  args: { label: 'Spice to withdraw', initial: 1, min: 1, max: 5 },
};
