import preview from '@sb/preview';
import type { ComponentProps } from 'react';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';

import { MemberCountInput } from './MemberCountInput';

/** The input with its caller's half: each commit becomes the new value, as the database write would make it. */
function CommittingMemberCountInput({ value, onCommit, ...props }: ComponentProps<typeof MemberCountInput>) {
  const [committed, setCommitted] = useState(value);
  return (
    <MemberCountInput
      {...props}
      value={committed}
      onCommit={(count) => {
        onCommit(count);
        setCommitted(count);
      }}
    />
  );
}

/** Types over the value and blurs, the commit gesture, then returns the field. */
async function commitTyped(canvasElement: HTMLElement, typed: string) {
  const field = within(canvasElement).getByRole('textbox', { name: 'Copies of this card in the deck' });
  await userEvent.clear(field);
  await userEvent.type(field, typed);
  await userEvent.tab();
  return field;
}

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
  render: (args) => <CommittingMemberCountInput {...args} />,
  play: async ({ args, canvasElement }) => {
    /* Leave the floor first, so the clamped commit back down to it is a real change that must be written. */
    await expect(await commitTyped(canvasElement, '3')).toHaveValue('3');
    await expect(args.onCommit).toHaveBeenLastCalledWith(3);
    await expect(await commitTyped(canvasElement, '0')).toHaveValue('1');
    await expect(args.onCommit).toHaveBeenLastCalledWith(1);
    await expect(args.onCommit).toHaveBeenCalledTimes(2);
  },
});

/** At the ceiling, clamped the same way from above. */
export const AtMaximum = meta.story({
  args: { value: 20 },
  render: (args) => <CommittingMemberCountInput {...args} />,
  play: async ({ args, canvasElement }) => {
    await expect(await commitTyped(canvasElement, '3')).toHaveValue('3');
    await expect(args.onCommit).toHaveBeenLastCalledWith(3);
    await expect(await commitTyped(canvasElement, '99')).toHaveValue('20');
    await expect(args.onCommit).toHaveBeenLastCalledWith(20);
    await expect(args.onCommit).toHaveBeenCalledTimes(2);
  },
});
