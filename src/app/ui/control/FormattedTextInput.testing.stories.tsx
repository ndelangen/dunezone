import { testingPreview } from '@sb/preview';
import { expect, fn, userEvent, within } from 'storybook/test';

import { FormattedTextInput } from './FormattedTextInput';
import { ControlledFormattedTextInput, expectDiagnostics } from './FormattedTextInput.stories.fixture';

const meta = testingPreview.meta({
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
