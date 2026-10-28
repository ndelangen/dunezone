import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { AppRoot } from './AppRoot';
import { playFullscreenHeight } from './AppRoot.stories.fixture';
import {
  FullscreenShellPage,
  ShellPageBackdrop,
  shellPageOptionLabels,
  shellPageOptions,
} from './ShellStoryPage.stories.fixture';

const meta = preview.meta({
  component: AppRoot,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The persistent masthead, page and footer sit above an anchored planet and SVG stars. Only the starfield moves with document scrolling.',
      },
    },
  },
  args: {
    children: shellPageOptionLabels[0],
  },
  argTypes: {
    children: {
      name: 'children',
      description: 'The mounted route, as the `PageLayout` props it supplies.',
      options: shellPageOptionLabels,
      mapping: shellPageOptions,
      control: { type: 'radio' },
    },
  },
  decorators: [
    (Story) => (
      <ShellPageBackdrop>
        <Story />
      </ShellPageBackdrop>
    ),
  ],
});

export const Default = meta.story({
  globals: { viewport: { value: 'appDesktop' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector('[data-app-band]')).toBeVisible();
    await expect(canvas.getByRole('main')).toBeVisible();
    await expect(within(canvas.getByRole('contentinfo')).getByRole('navigation', { name: 'Footer' })).toBeVisible();
  },
});

export const DefaultMobile = meta.story({
  globals: { viewport: { value: 'appMobile' } },
});

export const HeaderlessPage = meta.story({
  globals: { viewport: { value: 'appDesktop' } },
  args: { children: shellPageOptionLabels[2] },
});

export const FullscreenHeightMobile = meta.story({
  globals: { viewport: { value: 'appMobile' } },
  args: { children: <FullscreenShellPage /> },
  play: async (context) => {
    await playFullscreenHeight(context);
    await expect(context.canvasElement.querySelector('video')).toBeNull();
  },
});
