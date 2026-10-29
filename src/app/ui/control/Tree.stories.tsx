import { Tree } from '@mantine/core';
import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

const meta = preview.meta({
  title: 'Tree',
  component: Tree,
  args: {
    'aria-label': 'Files',
    withLines: true,
    data: [{ value: 'src', label: 'src', children: [{ value: 'src/index.tsx', label: 'index.tsx' }] }],
  },
});

export const Default = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('src', { exact: true }));
    await expect(canvas.getByText('index.tsx')).toBeVisible();
  },
});
