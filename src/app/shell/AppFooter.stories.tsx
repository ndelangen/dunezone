import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { AppFooter } from './AppFooter';

const meta = preview.meta({
  component: AppFooter,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          "The shell's closing waypoints. It owns its own list and destinations, so there is nothing to hand it and this is the whole component. Its colours assume the dark document background; the shell's `<footer>` element supplies only the minimum height around it.",
      },
    },
  },
});

export const Default = meta.story({
  globals: { viewport: { value: 'appDesktop' } },
  play: async ({ canvasElement }) => {
    const footer = within(within(canvasElement).getByRole('navigation', { name: 'Footer' }));
    for (const [name, href] of [
      ['Glossary', '/glossary'],
      ['Future plans', '/future-plans'],
      ['Privacy policy', '/privacy'],
      ['Source code', 'https://github.com/ndelangen/dunezone'],
    ]) {
      await expect(footer.getByRole('link', { name })).toHaveAttribute('href', href);
    }
  },
});

/** The waypoints stack once the row no longer fits. */
export const Mobile = meta.story({
  globals: { viewport: { value: 'appMobile' } },
});
