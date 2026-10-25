import preview from '@sb/preview';
import { expect, fn, userEvent, within } from 'storybook/test';

import { FaqTagFieldset } from './FaqTagFieldset';

/** The labels of the checked tags, in the fieldset's order. */
function checkedTags(canvasElement: HTMLElement) {
  return within(canvasElement)
    .getAllByRole('checkbox', { checked: true })
    .map((box) => box.closest('label')?.textContent);
}

const meta = preview.meta({
  component: FaqTagFieldset,
  parameters: { layout: 'centered' },
  globals: { backgrounds: { value: 'dark', grid: false } },
});

/** The ask form's shape: an uncontrolled form field named `tags`, with the default tag pre-checked. */
export const Default = meta.story({
  play: async ({ canvasElement }) => {
    const boxes = within(canvasElement).getAllByRole('checkbox');
    await expect(boxes.map((box) => box.getAttribute('name'))).toEqual(boxes.map(() => 'tags'));
    await expect(checkedTags(canvasElement)).toEqual(['Other']);
  },
});

/** The edit session's shape: the caller owns the selection and hears every flip. */
export const Controlled = meta.story({
  args: {
    value: ['rules', 'other'],
    onToggle: fn(),
  },
  play: async ({ args, canvasElement }) => {
    await expect(checkedTags(canvasElement)).toEqual(['Rules', 'Other']);
    await userEvent.click(within(canvasElement).getByRole('checkbox', { name: 'Strategy' }));
    await expect(args.onToggle).toHaveBeenCalledWith('strategy', true);
    /* The caller has not changed `value`, so the box stays as the caller says. */
    await expect(checkedTags(canvasElement)).toEqual(['Rules', 'Other']);
  },
});
