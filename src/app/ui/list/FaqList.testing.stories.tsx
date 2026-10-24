import { testingPreview } from '@sb/preview';
import { expect, fn, userEvent, within } from 'storybook/test';

import { FaqList } from './FaqList';
import { faqItems } from './FaqList.stories.fixture';

const meta = testingPreview.meta({
  title: 'FaqList',
  component: FaqList,
  globals: {
    backgrounds: { value: 'light', grid: false },
  },
  parameters: {
    layout: 'padded',
  },
  args: {
    items: faqItems,
    rulesetSlug: 'dreamrules',
    onOpenQuestion: fn(),
    emptyLabel: 'No FAQ items yet.',
  },
});

export const RowActivation = meta.story({
  decorators: [
    (Story) => (
      <div
        onClickCapture={(event) => {
          if ((event.target as Element).closest('a')) {
            event.preventDefault();
          }
        }}
      >
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const row = canvas.getByRole('link', { name: /^Open question: Can leaders move through the storm\?/ });
    await userEvent.click(row);
    await expect(args.onOpenQuestion).toHaveBeenCalledWith('storm-movement', 'dreamrules');
    const calls = (args.onOpenQuestion as ReturnType<typeof fn>).mock.calls.length;
    await userEvent.click(canvas.getByRole('link', { name: 'Chani' }));
    await userEvent.click(canvas.getByRole('link', { name: 'Lasgun' }));
    await expect(args.onOpenQuestion).toHaveBeenCalledTimes(calls);
    row.focus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onOpenQuestion).toHaveBeenCalledTimes(calls + 1);
    await expect(canvas.getByRole('link', { name: 'Chani' }).querySelector('span:last-child')).not.toHaveStyle({
      textDecoration: 'underline',
    });
  },
});
