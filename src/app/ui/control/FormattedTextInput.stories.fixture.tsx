import { useState } from 'react';
import { expect, within } from 'storybook/test';

import { FormattedTextInput } from './FormattedTextInput';
import type { FormattedTextInputProps } from './FormattedTextInput';

/*
 * The draft lives in the story's own state, seeded from the `value` arg and reset when the control changes it.
 * `useArgs` would keep the controls panel in step, but the test runner's channel never answers its update, so the field could not be edited in a play.
 */
export function ControlledFormattedTextInput(args: FormattedTextInputProps) {
  const [seed, setSeed] = useState(args.value);
  const [value, setValue] = useState(args.value);
  if (args.value !== seed) {
    setSeed(args.value);
    setValue(args.value);
  }
  return (
    <FormattedTextInput
      {...args}
      value={value}
      onChange={(nextValue) => {
        args.onChange(nextValue);
        setValue(nextValue);
      }}
    />
  );
}

/** The field named `label` is invalid, and its error reads `diagnostics` in order, each line of them as rendered. */
export async function expectDiagnostics(canvasElement: HTMLElement, label: string, diagnostics: readonly string[]) {
  const field = within(canvasElement).getByRole('textbox', { name: label });
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  const error = canvasElement.ownerDocument.getElementById(`${field.id}-error`);
  await expect(error?.innerText).toBe(diagnostics.join('\n\n'));
}
