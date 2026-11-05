import preview from '@sb/preview';

import { stepperMeta } from './Stepper.stories.fixture';

const meta = preview.meta({ ...stepperMeta });

/** − and + step the count, the wheel over it steps too, and a typed value commits on Enter or blur. */
export const Default = meta.story({});

/** Small, with a suffix after the value. */
export const SmallWithSuffix = meta.story({ args: { size: 'sm', suffix: 'of 5' } });

/** Disabled, as while the table cannot be handled. */
export const Disabled = meta.story({ args: { disabled: true } });
