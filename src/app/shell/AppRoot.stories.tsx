import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { AppRoot } from './AppRoot';
import { HeaderResizePage, playHeaderResize } from './AppRoot.stories.fixture';
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

export const ReducedMotionHeaderResize = meta.story({
  globals: { viewport: { value: 'appDesktop' }, motion: 'reduce' },
  args: { children: <HeaderResizePage /> },
  play: (context) => playHeaderResize(context, 'reduce'),
});

function fullscreenElements(canvasElement: HTMLElement) {
  const root = canvasElement.ownerDocument.documentElement;
  const view = canvasElement.ownerDocument.defaultView;
  const shell = canvasElement.querySelector<HTMLElement>('[data-app-root]');
  const navigation = canvasElement.querySelector<HTMLElement>('nav');
  const content = canvasElement.querySelector<HTMLElement>('[data-page-layout-content]');
  const scroller = canvasElement.querySelector<HTMLElement>('[data-shell-workspace]');
  const footer = shell?.querySelector<HTMLElement>('footer');
  const heading = within(canvasElement).getByRole('heading', { level: 1, name: 'Fullscreen workspace' });
  const header = heading.closest<HTMLElement>('[data-scheme-paper]');
  if (!view || !shell || !navigation || !content || !scroller || !footer || !header) {
    throw new Error('The fullscreen story must mount the complete shell and a child-owned scroll area.');
  }
  return { root, view, shell, navigation, content, scroller, footer, header };
}

async function playFullscreenHeight({ canvasElement }: { canvasElement: HTMLElement }) {
  const { root, view, navigation, content, scroller, footer, header } = fullscreenElements(canvasElement);
  const canvas = within(canvasElement);

  await waitFor(async () => {
    const bounds = content.getBoundingClientRect();
    await expect(bounds.top).toBe(0);
    await expect(bounds.left).toBe(0);
    await expect(bounds.width).toBe(view.innerWidth);
    await expect(bounds.height).toBe(view.innerHeight);
    await expect(root.scrollHeight).toBeLessThanOrEqual(root.clientHeight + 1);
    await expect(root.scrollWidth).toBe(root.clientWidth);
    await expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight);
    await expect(canvas.queryByRole('navigation')).toBeNull();
    await expect(navigation).not.toBeVisible();
    await expect(footer).not.toBeVisible();
    await expect(canvas.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    await expect(header.getBoundingClientRect().width).toBe(1);
    await expect(header.getBoundingClientRect().height).toBe(1);
    await expect(view.getComputedStyle(header).clipPath).toBe('inset(50%)');
    const background = canvasElement.querySelector<HTMLElement>('[data-app-background]');
    await expect(background).not.toBeNull();
    await expect(view.getComputedStyle(background!).visibility).toBe('hidden');
    /* The band is hidden, so its video never mounts and never downloads. */
    await expect(canvasElement.querySelector('video')).toBeNull();
  });

  const exit = canvas.getByRole('button', { name: 'Exit fullscreen' });
  exit.focus();
  await userEvent.tab();
  await expect(canvasElement.ownerDocument.activeElement).toBe(canvasElement.ownerDocument.body);
  /* The skip link is the first stop, and the workspace's own control the next. */
  await userEvent.tab();
  await expect(canvas.getByRole('link', { name: 'Skip to content' })).toHaveFocus();
  await userEvent.tab();
  await expect(exit).toHaveFocus();

  scroller.scrollTop = 100;
  view.scrollTo({ top: 100, left: 100 });
  await waitFor(async () => {
    await expect(scroller.scrollTop).toBe(100);
    await expect(view.scrollY).toBe(0);
    await expect(view.scrollX).toBe(0);
  });
  scroller.scrollTop = 0;
}

export const FullscreenHeightMobile = meta.story({
  globals: { viewport: { value: 'appMobile' } },
  args: { children: <FullscreenShellPage /> },
  play: playFullscreenHeight,
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
