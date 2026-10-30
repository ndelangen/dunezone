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

export const VideoResumesAfterScrolling = meta.story({
  globals: { viewport: { value: 'appDesktop' }, motion: 'on' },
  play: async ({ canvasElement }) => {
    const view = canvasElement.ownerDocument.defaultView!;
    await waitFor(() => expect(canvasElement.querySelector('video')).toHaveAttribute('data-ready', 'true'), {
      timeout: 30_000,
    });
    const video = canvasElement.querySelector('video')!;
    await waitFor(() => expect(view.getComputedStyle(video).opacity).toBe('1'));
    try {
      view.scrollTo({ top: canvasElement.ownerDocument.documentElement.scrollHeight, behavior: 'instant' });
      await waitFor(() => expect(video.paused).toBe(true));
      const pausedAt = video.currentTime;
      await new Promise((resolve) => view.setTimeout(resolve, 150));
      await expect(video.currentTime).toBe(pausedAt);
      view.scrollTo({ top: 0, behavior: 'instant' });
      await waitFor(() => expect(video.paused).toBe(false));
      await expect(canvasElement.querySelector('video')).toBe(video);
      await expect(video).toHaveAttribute('data-ready', 'true');
      await expect(view.getComputedStyle(video).opacity).toBe('1');
    } finally {
      view.scrollTo({ top: 0, behavior: 'instant' });
    }
  },
});

export const VideoLoadsOnApproach = meta.story({
  globals: { viewport: { value: 'appDesktop' }, motion: 'on' },
  render: (args) => (
    <>
      <div style={{ height: '150vh' }} />
      <AppHeader {...args} />
    </>
  ),
  play: async ({ canvasElement }) => {
    const view = canvasElement.ownerDocument.defaultView!;
    const band = canvasElement.querySelector<HTMLElement>('[data-app-band]')!;
    try {
      view.scrollTo({ top: 0, behavior: 'instant' });
      await waitFor(() => expect(band.getBoundingClientRect().top).toBeGreaterThan(view.innerHeight + 200));
      /* Give both visibility observers a frame before checking that the video has not mounted. */
      await new Promise((resolve) => view.requestAnimationFrame(() => view.requestAnimationFrame(resolve)));
      await expect(band.querySelector('video')).toBeNull();
      band.scrollIntoView({ behavior: 'instant' });
      await waitFor(() => expect(band.querySelector('video')).not.toBeNull());
      const video = band.querySelector('video')!;
      view.scrollTo({ top: 0, behavior: 'instant' });
      await waitFor(() => expect(video.paused).toBe(true));
      await expect(band.querySelector('video')).toBe(video);
    } finally {
      view.scrollTo({ top: 0, behavior: 'instant' });
    }
  },
});
