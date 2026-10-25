import { testingPreview } from '@sb/preview';
import { expect, waitFor, within } from 'storybook/test';

import { AppHeader } from './AppHeader';
import { shellPageOptionLabels, shellPageOptions } from './ShellStoryPage.stories.fixture';

const meta = testingPreview.meta({
  component: AppHeader,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The artwork band above every page. Not a surface: content does not sit on it, it sits over it, arriving from a sibling in the same grid row. Its height is not a prop either, since the page below declares what it wants through `data-page-layout-*` and the band reads it back, so switching the `children` control is what resizes the band.',
      },
    },
  },
  args: {
    children: shellPageOptionLabels[0],
  },
  argTypes: {
    children: {
      name: 'children',
      description:
        'The mounted route, as the `PageLayout` props it supplies. Switching this resizes the same band element, with a height transition when motion is enabled.',
      options: shellPageOptionLabels,
      mapping: shellPageOptions,
      control: { type: 'radio' },
    },
  },
});

export const DefaultHeader = meta.story({
  globals: { viewport: { value: 'appDesktop' }, motion: 'on' },
  play: async ({ canvasElement }) => {
    const band = canvasElement.querySelector<HTMLElement>('[data-app-band]');
    await expect(band).toBeVisible();
    await expect(within(band!).getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
    /* Motion is pinned on, so the loop mounts over the poster once the band has its height, whatever the runner prefers. */
    await waitFor(() => expect(band!.querySelector('video')).not.toBeNull(), { timeout: 30_000 });
  },
});
