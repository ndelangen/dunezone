import preview from '@sb/preview';
import { expect } from 'storybook/test';

import { Token } from './Token';

const meta = preview.meta({
  component: Token,
  globals: {
    viewport: {
      value: 'disc',
    },
  },
});

export const Default = meta.story({
  args: {
    background: {
      image: '/image/texture/021.jpg',
      colors: ['red', 'blue'],
      invert: true,
      definition: 0,
      influence: 0,
    },
    logo: '/vector/logo/moritani.svg',
  },
});

/** The reverse of the same token (#1228). */
export const Blocked = meta.story({
  args: { ...Default.input.args, blocked: true },
  play: async ({ canvasElement }) => {
    const faces = canvasElement.querySelectorAll('[data-token-face="blocked"]');
    await expect(faces).toHaveLength(1);
    await expect(faces[0]!.querySelector('use[*|href="/vector/decal/block.svg#root"]')).not.toBeNull();
  },
});
