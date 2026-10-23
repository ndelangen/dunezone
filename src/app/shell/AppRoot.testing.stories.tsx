import { testingPreview } from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { AppRoot } from './AppRoot';
import { HeaderResizePage, playHeaderResize } from './AppRoot.stories.fixture';
import { ShellPageBackdrop, shellPageOptionLabels, shellPageOptions } from './ShellStoryPage.stories.fixture';

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
