import preview from '@sb/preview';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';

import { FormattedTextInput } from './FormattedTextInput';
import type { FormattedTextInputProps } from './FormattedTextInput';

/*
 * The draft lives in the story's own state, seeded from the `value` arg and reset when the control changes it.
 * `useArgs` would keep the controls panel in step, but the test runner's channel never answers its update, so the field could not be edited in a play.
 */
function ControlledFormattedTextInput(args: FormattedTextInputProps) {
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
async function expectDiagnostics(canvasElement: HTMLElement, label: string, diagnostics: readonly string[]) {
  const field = within(canvasElement).getByRole('textbox', { name: label });
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  const error = canvasElement.ownerDocument.getElementById(`${field.id}-error`);
  await expect(error?.innerText).toBe(diagnostics.join('\n\n'));
}

const meta = preview.meta({
  component: FormattedTextInput,
  globals: {
    backgrounds: { value: 'dark', grid: false },
  },
  parameters: {
    layout: 'centered',
  },
  render: ControlledFormattedTextInput,
  args: {
    label: 'Text',
    minRows: 5,
    onChange: fn(),
    w: 520,
  },
});

export const ValidDraft = meta.story({
  args: {
    value:
      'Lead with *bold words*, add _underlining_, and finish with -italics-.\n\n- One clear point\n- Another clear point',
  },
});

export const Empty = meta.story({
  args: {
    value: '',
  },
});

export const CrossedMark = meta.story({
  args: {
    value: '*bold _underline* still underline_',
  },
  play: async ({ canvasElement }) => {
    await expectDiagnostics(canvasElement, 'Text', [
      'Line 1, column 17: Bold closes before underline is finished.\nSuggestion: Close underline with _ before this *, or move this * after it.',
      'Line 1, column 1: Bold starts here but has no closing *.\nSuggestion: Add * after the words you want formatted, or remove this *.',
    ]);
  },
});

export const UnclosedMark = meta.story({
  args: {
    value: 'An *unfinished draft',
  },
  play: async ({ canvasElement }) => {
    await expectDiagnostics(canvasElement, 'Text', [
      'Line 1, column 4: Bold starts here but has no closing *.\nSuggestion: Add * after the words you want formatted, or remove this *.',
    ]);
  },
});

export const MarksOnlyRejectsParagraphs = meta.story({
  args: {
    label: 'Revival instructions',
    profile: 'marks-only',
    value: '1 *free* revival.\nThis second line is not allowed.',
  },
  play: async ({ canvasElement }) => {
    await expectDiagnostics(canvasElement, 'Revival instructions', [
      'Line 2, column 1: This field allows formatted words, but not line breaks or paragraphs.\nSuggestion: Replace the line break with a space.',
    ]);
  },
});

/** Words the glossary says differently get a callout; Fix wording swaps the ones it can, and Undo puts the draft back. */
export const WordingHints = meta.story({
  args: {
    label: 'Answer',
    value: 'Ship your forces before combat, then fight with your best hero.',
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const field = canvas.getByRole('textbox', { name: 'Answer' });
    const fixed = 'Ship your troops before battle, then fight with your best faction leader.';
    await userEvent.click(canvas.getByRole('button', { name: 'Fix wording' }));
    await expect(args.onChange).toHaveBeenLastCalledWith(fixed);
    await expect(field).toHaveValue(fixed);
    await userEvent.click(canvas.getByRole('button', { name: 'Undo' }));
    await expect(field).toHaveValue('Ship your forces before combat, then fight with your best hero.');
  },
});
