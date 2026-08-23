import preview from '@sb/preview';
import { fn } from 'storybook/test';

import { AddAction } from './ListLengthActions';

const meta = preview.meta({
  component: AddAction,
  parameters: { layout: 'centered' },
  args: {
    label: 'Add a leader',
    onClick: fn(),
  },
});

/**
 * The plus on its own, for a collection that grows without a matching remove beside it.
 * `ListLengthActions` pairs it with a minus;
 * a picker that opens rather than appends wants only this half.
 */
export const Default = meta.story({});

/** At the collection's ceiling. The affordance stays visible so the limit reads as a limit rather than a missing control. */
export const Disabled = meta.story({
  args: { label: 'Add a leader (maximum reached)', disabled: true },
});
