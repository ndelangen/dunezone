import preview from '@sb/preview';
import { expect, waitFor } from 'storybook/test';

import { AppRoot } from './AppRoot';
import { ShellPageBackdrop, shellPageOptionLabels, shellPageOptions } from './ShellStoryPage.stories.fixture';

const meta = preview.meta({
  component: AppRoot,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The persistent chrome: the masthead band, the route below it, the footer, and the document-level effects. Scrolling is the part worth watching — the shell measures how far down the page is and writes it to `--scroll-pct` on the document element, and `page.css` uses it to pan the desert photograph behind everything. These stories carry that stylesheet for their own lifetime only.',
      },
    },
  },
  args: {
    pathname: '/factions',
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

/**
 * Scrolls the preview to the bottom on open so the backdrop travels without being touched, then checks the shell actually drove it: `--scroll-pct` reaching the bottom of its range is what moves `background-position`.
 * The variable is written from a requestAnimationFrame handler, so under load the last update can land a hair short of 100, wait
 * (with generous headroom for a loaded suite) for it to settle into [99.5, 100] rather than demand exactly 100.
 */
async function playBackgroundPan({ canvasElement }: { canvasElement: HTMLElement }) {
  const view = canvasElement.ownerDocument.defaultView;
  const root = canvasElement.ownerDocument.documentElement;
  if (view == null) {
    throw new Error('The story has no window, so scroll progress cannot be driven.');
  }

  const readPosition = () => view.getComputedStyle(root).backgroundPosition;
  const atTop = readPosition();

  view.scrollTo({ top: root.scrollHeight, behavior: 'smooth' });
  await waitFor(
    () => {
      const pct = Number.parseFloat(root.style.getPropertyValue('--scroll-pct'));
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
