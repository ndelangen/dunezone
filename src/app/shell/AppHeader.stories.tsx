import preview from '@sb/preview';
import { expect } from 'storybook/test';

import { AppHeader } from './AppHeader';
import { playHeaderResize } from './headerResize.stories.fixture';
import { shellPageOptionLabels, shellPageOptions } from './ShellStoryPage.stories.fixture';

const meta = preview.meta({
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
  globals: { viewport: { value: 'appDesktop' } },
});

/** Below 900px the band drops to a fixed height and the artwork anchors left. */
export const DefaultHeaderMobile = meta.story({
  globals: { viewport: { value: 'appMobile' } },
});

/**
 * A reduced-motion visit, pinned through the Motion toolbar global: the band keeps the sharp poster, and the video element never mounts, so the loop is never even downloaded.
 */
export const ReducedMotion = meta.story({
  globals: { viewport: { value: 'appDesktop' }, motion: 'reduce' },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('video')).toBeNull();
  },
});

export const CompactHeader = meta.story({
  globals: { viewport: { value: 'appDesktop' } },
  args: { children: shellPageOptionLabels[1] },
});

export const CompactHeaderMobile = meta.story({
  globals: { viewport: { value: 'appMobile' } },
  args: { children: shellPageOptionLabels[1] },
});

export const HeaderlessPage = meta.story({
  globals: { viewport: { value: 'appDesktop' } },
  args: { children: shellPageOptionLabels[2] },
});

export const HeaderlessPageMobile = meta.story({
  globals: { viewport: { value: 'appMobile' } },
  args: { children: shellPageOptionLabels[2] },
});

/**
 * Left responsive on purpose.
 * Drag the preview to any width: the compact strip must hold its fixed 51px while the artwork modes track the frame's width.
 * The play function proves the static half of that contract by walking the canvas through the widths the shell can hand the frame and measuring the band at each one.
 */
export const HeaderlessPageResponsive = meta.story({
  args: { children: shellPageOptionLabels[2] },
  parameters: {
    docs: {
      description: {
        story:
          'No pinned viewport: resize the preview and the compact strip stays 51px tall at every width. Flip the `children` control to watch the artwork modes scale with width instead.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const band = canvasElement.querySelector('header');
    if (band == null) {
      throw new Error('The masthead band never rendered, so its height cannot be measured.');
    }

    /* The band sizes against its container, so pinching the canvas stands in for every viewport
       the shell can meet, with no window resize needed. */
    for (const width of [1160, 1000, 860, 390]) {
      canvasElement.style.width = `${width}px`;
      await expect(Math.round(band.getBoundingClientRect().width)).toBe(width);
      await expect(band.getBoundingClientRect().height).toBe(51);
    }
    canvasElement.style.removeProperty('width');
  },
});

async function playResizing(context: Parameters<typeof playHeaderResize>[0]) {
  const band = context.canvasElement.querySelector('header');
  const view = context.canvasElement.ownerDocument.defaultView;
  if (!band || !view) {
    throw new Error('The resize story requires a mounted header and browser window.');
  }
  const hasTransitionDuration = view
    .getComputedStyle(band)
    .transitionDuration.split(',')
    .some((duration) => Number.parseFloat(duration) > 0);
  const { jumped, remounted } = await playHeaderResize(context);

  await expect(remounted).toBe(false);
  if (hasTransitionDuration) {
    await expect(jumped).toBe(false);
  }
}

/**
 * Steps the `children` arg through every route state on the same mounted band.
 * Animated resizes must pass through intermediate heights;
 * reduced-motion resizes may change immediately.
 */
export const Resizing = meta.story({
  globals: { viewport: { value: 'appDesktop' } },
  parameters: {
    docs: {
      description: {
        story:
          'In the interactive preview, walks the band through all three heights on the same mounted element. With motion enabled, each resize must pass through intermediate sizes. Use the `children` control to resize it by hand.',
      },
    },
  },
  play: playResizing,
});

export const ResizingMobile = meta.story({
  globals: { viewport: { value: 'appMobile' } },
  play: playResizing,
});
