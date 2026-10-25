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
    await expect(source.querySelector('.hljs-string')).not.toBeNull();
  },
});

export const EscapedMarkup = meta.story({
  args: { code: '<script>alert("example")</script><img src=x onerror=alert(1)>' },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('script, img')).toBeNull();
    await expect(within(canvasElement).getByLabelText('Page.tsx')).toHaveTextContent('<script>');
  },
});
