import preview from '@sb/preview';
import { fn } from 'storybook/test';

import { FormattedTextInput } from './FormattedTextInput';
import { ControlledFormattedTextInput, expectDiagnostics } from './FormattedTextInput.stories.fixture';

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
