import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { AppRoot } from './AppRoot';
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
          'The persistent chrome: the masthead band, the route below it, the footer, and the document-level effects. Scrolling is the part worth watching. The shell measures how far down the page is and writes it to `--scroll-pct` on the document element, and `page.css` uses it to pan the desert photograph behind everything. These stories carry that stylesheet for their own lifetime only.',
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
});

export const DefaultMobile = meta.story({
  globals: { viewport: { value: 'appMobile' } },
});

export const HeaderlessPage = meta.story({
  globals: { viewport: { value: 'appDesktop' } },
  args: { children: shellPageOptionLabels[2] },
});

export const HeaderlessPageMobile = meta.story({
  globals: { viewport: { value: 'appMobile' } },
  args: { children: shellPageOptionLabels[2] },
});

async function playViewportHeight({ canvasElement }: { canvasElement: HTMLElement }) {
  const documentElement = canvasElement.ownerDocument.documentElement;
  const view = canvasElement.ownerDocument.defaultView;
  const shell = canvasElement.querySelector<HTMLElement>('[data-app-root]');
  const navigation = canvasElement.querySelector<HTMLElement>('nav');
  const toolbar = canvasElement.querySelector<HTMLElement>('[data-page-layout-toolbar]');
  const content = canvasElement.querySelector<HTMLElement>('[data-page-layout-content]');
  const footer = shell?.querySelector<HTMLElement>('footer');
  if (!view || !shell || !navigation || !toolbar || !content || !footer) {
    throw new Error('The viewport story must mount the complete application shell.');
  }

  view.scrollTo({ top: 0 });
  await waitFor(() => {
    const shellRect = shell.getBoundingClientRect();
    const navigationRect = navigation.getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();

    expect(shellRect.height).toBeCloseTo(view.innerHeight, 0);
    expect(navigationRect.top).toBeGreaterThanOrEqual(0);
    expect(navigationRect.bottom).toBeLessThanOrEqual(toolbarRect.top);
    expect(toolbarRect.bottom).toBeLessThanOrEqual(contentRect.top);
    expect(contentRect.height).toBeGreaterThan(200);
    expect(contentRect.bottom).toBeLessThanOrEqual(view.innerHeight);
    expect(contentRect.left).toBeGreaterThanOrEqual(0);
    expect(contentRect.right).toBeLessThanOrEqual(documentElement.clientWidth);
    expect(content.scrollHeight).toBeGreaterThan(content.clientHeight);
    expect(documentElement.scrollHeight).toBeLessThanOrEqual(documentElement.clientHeight + 1);
    expect(view.getComputedStyle(footer).display).toBe('none');

    const navigationLink = navigation.querySelector('a');
    const linkRect = navigationLink?.getBoundingClientRect();
    expect(linkRect).toBeDefined();
    if (linkRect) {
      const hit = canvasElement.ownerDocument.elementFromPoint(
        linkRect.left + linkRect.width / 2,
        linkRect.top + linkRect.height / 2
      );
      expect(navigationLink?.contains(hit)).toBe(true);
    }
  });

  content.scrollTop = 100;
  await waitFor(() => {
    expect(content.scrollTop).toBe(100);
    expect(view.scrollY).toBe(0);
  });
}

export const ViewportHeight = meta.story({
  globals: { viewport: { value: 'appLarge' } },
  args: { children: 'viewport height' },
  play: playViewportHeight,
});

export const ViewportHeightMobile = meta.story({
  globals: { viewport: { value: 'appMobile' } },
  args: { children: 'viewport height' },
  play: playViewportHeight,
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

  await waitFor(() => {
    const bounds = content.getBoundingClientRect();
    expect(bounds.top).toBe(0);
    expect(bounds.left).toBe(0);
    expect(bounds.width).toBe(view.innerWidth);
    expect(bounds.height).toBe(view.innerHeight);
    expect(root.scrollHeight).toBeLessThanOrEqual(root.clientHeight + 1);
    expect(root.scrollWidth).toBe(root.clientWidth);
    expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight);
    expect(canvas.queryByRole('navigation')).toBeNull();
    expect(navigation).not.toBeVisible();
    expect(footer).not.toBeVisible();
    expect(canvas.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(header.getBoundingClientRect().width).toBe(1);
    expect(header.getBoundingClientRect().height).toBe(1);
    expect(view.getComputedStyle(header).clipPath).toBe('inset(50%)');
    expect(view.getComputedStyle(root).backgroundImage).toBe('none');
    expect(view.getComputedStyle(root, '::after').display).toBe('none');
  });

  const exit = canvas.getByRole('button', { name: 'Exit fullscreen' });
  exit.focus();
  await userEvent.tab();
  expect(canvasElement.ownerDocument.activeElement).toBe(canvasElement.ownerDocument.body);
  await userEvent.tab();
  expect(exit).toHaveFocus();

  scroller.scrollTop = 100;
  view.scrollTo({ top: 100, left: 100 });
  await waitFor(() => {
    expect(scroller.scrollTop).toBe(100);
    expect(view.scrollY).toBe(0);
    expect(view.scrollX).toBe(0);
  });
  scroller.scrollTop = 0;
}

export const FullscreenHeight = meta.story({
  globals: { viewport: { value: 'appLarge' } },
  args: { children: <FullscreenShellPage /> },
  play: playFullscreenHeight,
});

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

    await waitFor(() => {
      expect(canvasElement.querySelector('[data-page-layout-height="fullscreen"]')).toBeNull();
      expect(navigation).toBeVisible();
      expect(footer).toBeVisible();
      expect(root.scrollHeight).toBeGreaterThan(root.clientHeight);
      expect(content.getBoundingClientRect().width).toBeLessThan(view.innerWidth);
      expect(view.getComputedStyle(root).backgroundImage).not.toBe('none');
      expect(view.getComputedStyle(root, '::after').display).not.toBe('none');
      expect(view.getComputedStyle(root).scrollbarGutter).toBe('stable both-edges');
    });

    view.scrollTo({ top: 100 });
    await waitFor(() => expect(view.scrollY).toBe(100));
    view.scrollTo({ top: 0 });
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Enter fullscreen' }));
    await playFullscreenHeight({ canvasElement });
  },
});

/**
 * Scrolls the preview to the bottom on open so the backdrop travels without being touched, then checks the shell actually drove it: `--scroll-pct` reaching the bottom of its range is what moves `background-position`.
 * The variable is written from a requestAnimationFrame handler, so under load the last update can land a hair short of 100.
 * Wait (with generous headroom for a loaded suite) for it to settle into [99.5, 100] rather than demand exactly 100.
 *
 * Reaching the bottom of the range only says something about the shell if the page started at the top of it and had somewhere to travel, and neither is given.
 * A story that ran earlier leaves the preview wherever it stopped, so the starting sample can already be the end-of-range value and the pan reads as broken when it is not.
 * A page with nothing to scroll is the other way round: `AppRoot` reports 100 rather than 0 for it, so the range checks are met without the window having moved at all.
 * Driving to the top and waiting for the shell to write that measurement rules out the first, and requiring the window to have travelled rules out the second.
 * The wait cannot be skipped: on mount the shell seeds `--scroll-pct` with a literal 0 before it has measured anything, so a sample taken straight away says nothing about where the page is.
 */
async function playBackgroundPan({ canvasElement }: { canvasElement: HTMLElement }) {
  const view = canvasElement.ownerDocument.defaultView;
  const root = canvasElement.ownerDocument.documentElement;
  if (view == null) {
    throw new Error('The story has no window, so scroll progress cannot be driven.');
  }

  const readPosition = () => view.getComputedStyle(root).backgroundPosition;
  const readPercent = () => Number.parseFloat(root.style.getPropertyValue('--scroll-pct'));

  view.scrollTo({ top: 0 });
  await waitFor(
    () => {
      expect(view.scrollY).toBe(0);
      expect(readPercent()).toBe(0);
    },
    { timeout: 5000 }
  );
  const atTop = readPosition();

  view.scrollTo({ top: root.scrollHeight, behavior: 'smooth' });
  await waitFor(
    () => {
      expect(view.scrollY).toBeGreaterThan(0);
      const pct = readPercent();
      expect(pct).toBeGreaterThanOrEqual(99.5);
      expect(pct).toBeLessThanOrEqual(100);
      expect(readPosition()).not.toBe(atTop);
    },
    { timeout: 5000 }
  );
}

export const ScrollingBackground = meta.story({
  globals: { viewport: { value: 'appDesktop' } },
  parameters: {
    docs: {
      description: {
        story:
          'The backdrop pans as the page scrolls, at its own pace behind the band and the footer. Scroll back up to run it in reverse.',
      },
    },
  },
  play: playBackgroundPan,
});

export const ScrollingBackgroundMobile = meta.story({
  globals: { viewport: { value: 'appMobile' } },
  play: playBackgroundPan,
});
