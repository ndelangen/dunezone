import preview from '@sb/preview';
import { useArgs } from 'storybook/preview-api';
import { fn } from 'storybook/test';

import { FormattedTextInput } from './FormattedTextInput';
import type { FormattedTextInputProps } from './FormattedTextInput';

function ControlledFormattedTextInput(args: FormattedTextInputProps) {
  const [{ value }, updateArgs] = useArgs<FormattedTextInputProps>();
  return (
    <FormattedTextInput
      {...args}
      value={value}
      onChange={(nextValue) => {
        args.onChange(nextValue);
        updateArgs({ value: nextValue });
      }}
    />
  );
}

const meta = preview.meta({
  component: FormattedTextInput,
  globals: {
    backgrounds: { value: 'light', grid: false },
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
});

export const EmptyListItem = meta.story({
  args: {
    value: '- ',
  },
});

export const EmptyMark = meta.story({
  args: {
    value: '**',
  },
});

export const UnclosedMark = meta.story({
  args: {
    value: 'An *unfinished draft',
  },
});

export const MarksOnlyRejectsParagraphs = meta.story({
  args: {
    label: 'Revival instructions',
    profile: 'marks-only',
    value: '1 *free* revival.\nThis second line is not allowed.',
  },
});
