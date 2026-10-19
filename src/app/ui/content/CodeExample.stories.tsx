import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { CodeExample } from './CodeExample';

const meta = preview.meta({
  component: CodeExample,
  args: { label: 'Page.tsx', code: '<PageTitle title="Contributing" />' },
});

export const Source = meta.story({});

export const Diff = meta.story({
  args: {
    code: undefined,
    lines: [
      { kind: 'removed', code: '<h1>Contributing</h1>' },
      { kind: 'added', code: '<PageTitle title="Contributing" />' },
    ],
  },
  play: async ({ canvasElement }) => {
    const source = within(canvasElement).getByLabelText('Page.tsx');
    await expect(source).toHaveTextContent('Contributing');
    await expect(source.querySelector('script')).toBeNull();
  },
});

export const EscapedMarkup = meta.story({
  args: { code: '<script>alert("example")</script>' },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('script')).toBeNull();
    await expect(within(canvasElement).getByLabelText('Page.tsx')).toHaveTextContent('<script>');
  },
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
    await expect(source).toHaveAttribute('role', 'region');
  },
});
