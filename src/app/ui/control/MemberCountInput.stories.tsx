import preview from '@sb/preview';
import { fn } from 'storybook/test';

import { MemberCountInput } from './MemberCountInput';

const meta = preview.meta({
  component: MemberCountInput,
  parameters: { layout: 'centered' },
  args: {
    label: 'Copies of this card in the deck',
    value: 3,
    min: 1,
    max: 20,
    disabled: false,
    onCommit: fn(),
  },
});

/**
 * Type over the value and watch the actions panel: nothing commits until blur or Enter.
 * That is the whole component, because each commit is a database write rather than draft state.
 */
export const Default = meta.story({});

/** At the floor. A commit below `min` is clamped rather than rejected, so the field never holds an impossible number. */
export const AtMinimum = meta.story({
  args: { value: 1 },
});

/** At the ceiling, clamped the same way from above. */
export const AtMaximum = meta.story({
  args: { value: 20 },
});

/** While the container it belongs to is read-only to this viewer. */
export const Disabled = meta.story({
  args: { disabled: true },
});
