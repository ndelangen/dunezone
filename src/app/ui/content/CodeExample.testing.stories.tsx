import { testingPreview } from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { CodeExample } from './CodeExample';

const meta = testingPreview.meta({
  component: CodeExample,
  args: { label: 'Page.tsx', code: '<PageTitle title="Contributing" />' },
});

export const KeyboardScroll = meta.story({
  args: { code: `const longName = "${'example '.repeat(40)}";` },
  globals: { viewport: { value: 'appMobileNarrow' } },
  decorators: [
    (Story) => (
      <div style={{ width: '20rem', maxWidth: '100%' }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const source = within(canvasElement).getByLabelText('Page.tsx');
    await waitFor(async () => {
      await expect(source).toHaveAttribute('tabindex', '0');
    });
    await userEvent.tab();
    await expect(source).toHaveFocus();
    await expect(source.scrollWidth).toBeGreaterThan(source.clientWidth);
    await expect(source).toHaveRole('region');
  },
});
