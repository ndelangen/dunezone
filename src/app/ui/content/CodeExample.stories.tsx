import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

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
