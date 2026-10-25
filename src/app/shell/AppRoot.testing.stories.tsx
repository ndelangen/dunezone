import { testingPreview } from '@sb/preview';
import { expect, userEvent, within, waitFor } from 'storybook/test';

import { AppRoot } from './AppRoot';
import {
  HeaderResizePage,
  playHeaderResize,
  fullscreenElements,
  playFullscreenHeight,
} from './AppRoot.stories.fixture';
import {
  ShellPageBackdrop,
  shellPageOptionLabels,
  shellPageOptions,
  FullscreenShellPage,
} from './ShellStoryPage.stories.fixture';

const meta = testingPreview.meta({
  title: 'AppRoot',
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

/**
 * The page has one banner, the page's own header, and one main;
 * the band above is artwork and site navigation.
 * The first Tab shows a skip link, and following it puts focus on the main, past the navigation.
 */
export const SkipToContent = meta.story({
  globals: { viewport: { value: 'appDesktop' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const view = canvasElement.ownerDocument.defaultView;
    await expect(canvas.getAllByRole('banner')).toHaveLength(1);
    await expect(canvas.getAllByRole('main')).toHaveLength(1);
    const main = canvas.getByRole('main');
    const skip = canvas.getByRole('link', { name: 'Skip to content' });
    await expect(skip.getBoundingClientRect().width).toBe(1);
    canvasElement.ownerDocument.body.focus();
    await userEvent.tab();
    await expect(skip).toHaveFocus();
    await expect(skip.getBoundingClientRect().width).toBeGreaterThan(1);
    await expect(skip).toHaveAttribute('href', `#${main.id}`);
    const hash = view?.location.hash;
    await userEvent.keyboard('{Enter}');
    await expect(main).toHaveFocus();
    await expect(view?.location.hash).toBe(hash);
    /* The main holds focus only while it has it, so a later click inside it never lands there. */
    await userEvent.tab();
    await expect(main).not.toHaveAttribute('tabindex');
  },
});

export const AnimatedHeaderResize = meta.story({
  globals: { viewport: { value: 'appDesktop' }, motion: 'on' },
  args: { children: <HeaderResizePage /> },
  play: (context) => playHeaderResize(context, 'ok'),
});

/** The stars traverse their parallax range while the planet's frame stays anchored. */
async function playBackgroundPan({ canvasElement }: { canvasElement: HTMLElement }) {
  const view = canvasElement.ownerDocument.defaultView;
  const root = canvasElement.ownerDocument.documentElement;
  const stars = canvasElement.querySelector<HTMLElement>('[data-background-stars]');
  const planet = canvasElement.querySelector<HTMLElement>('[data-background-planet]');
  if (!view || !stars || !planet) {
    throw new Error('The scroll story requires the orbital background.');
  }
  const readProgress = () => Number.parseFloat(stars.style.getPropertyValue('--scroll-progress'));
  view.scrollTo({ top: 0 });
  await waitFor(async () => {
    await expect(view.scrollY).toBe(0);
    await expect(readProgress()).toBe(0);
  });
  const planetTop = planet.getBoundingClientRect().top;
  const starTop = stars.getBoundingClientRect().top;
  await expect((view.innerHeight - planetTop) / planet.getBoundingClientRect().height).toBeCloseTo(0.2, 3);
  view.scrollTo({ top: root.scrollHeight, behavior: 'instant' });
  await waitFor(async () => {
    await expect(view.scrollY).toBeGreaterThan(0);
    await expect(readProgress()).toBeGreaterThanOrEqual(0.995);
    await expect(stars.getBoundingClientRect().top).toBeLessThan(starTop);
    await expect(planet.getBoundingClientRect().top).toBe(planetTop);
  });
}

export const ReducedMotionHeaderResize = meta.story({
  globals: { viewport: { value: 'appDesktop' }, motion: 'reduce' },
  args: { children: <HeaderResizePage /> },
  play: (context) => playHeaderResize(context, 'reduce'),
});

export const FullscreenExitRestoresDocument = meta.story({
  globals: { viewport: { value: 'appLarge' } },
  args: { children: <FullscreenShellPage /> },
  play: async ({ canvasElement }) => {
    await playFullscreenHeight({ canvasElement });
    const { root, view, navigation, content, footer } = fullscreenElements(canvasElement);
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Exit fullscreen' }));

    await waitFor(async () => {
      await expect(canvasElement.querySelector('[data-page-layout-height="fullscreen"]')).toBeNull();
      await expect(navigation).toBeVisible();
      await expect(footer).toBeVisible();
      await expect(root.scrollHeight).toBeGreaterThan(root.clientHeight);
      await expect(content.getBoundingClientRect().width).toBeLessThan(view.innerWidth);
      const background = canvasElement.querySelector<HTMLElement>('[data-app-background]');
      await expect(view.getComputedStyle(background!).visibility).toBe('visible');
      await expect(view.getComputedStyle(root).scrollbarGutter).toBe('stable both-edges');
    });

    view.scrollTo({ top: 100 });
    await waitFor(() => expect(view.scrollY).toBe(100));
    view.scrollTo({ top: 0 });
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Enter fullscreen' }));
    await playFullscreenHeight({ canvasElement });
  },
});

export const ScrollingBackground = meta.story({
  globals: { viewport: { value: 'appDesktop' }, motion: 'on' },
  parameters: {
    docs: {
      description: {
        story: 'The stars move in parallax while the shaded planet remains anchored with its upper 20% visible.',
      },
    },
  },
  play: playBackgroundPan,
});
