import { testingPreview } from '@sb/preview';
import { expect, waitFor, within } from 'storybook/test';

import { ReviewFixture, openReview, storyFaction } from './FactionSheetReview.stories.fixture';

const meta = testingPreview.meta({
  component: ReviewFixture,
  globals: {
    viewport: {
      value: 'appDesktop',
    },
  },
  parameters: {
    layout: 'fullscreen',
  },
});

/** Resolves after the next frame's resize observers have run, so a check that nothing moved is not made before they could move it. */
async function afterResizeObservers(view: Window) {
  await new Promise<void>((resolve) => view.requestAnimationFrame(() => view.requestAnimationFrame(() => resolve())));
}

/**
 * A stage that narrows below the review's width closes an open review the way its close button does, so focus goes back to the button that opened it instead of dropping to the page body when the panel goes inert.
 * Once the review is closed, a stage resize leaves focus where it is.
 */
export const NarrowingStageClosesReview = meta.story({
  args: {
    faction: storyFaction,
  },
  globals: {
    viewport: {
      value: 'appLarge',
    },
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const view = canvasElement.ownerDocument.defaultView;
    const stage = canvasElement.querySelector<HTMLElement>('[data-faction-sheet-review]');
    const stageHost = stage?.parentElement;
    if (!view || !stage || !stageHost) {
      throw new Error('The review stage never rendered, so it cannot be narrowed.');
    }
    const trigger = page.getByRole('button', { name: 'Review faction sheet' });

    await openReview(canvasElement);
    await waitFor(() => expect(page.getByRole('button', { name: 'Close faction sheet review' })).toHaveFocus());

    stageHost.style.width = '30rem';
    await waitFor(() => expect(stage).not.toHaveAttribute('data-review-open'));
    await expect(trigger).toHaveFocus();

    trigger.blur();
    stageHost.style.width = '78rem';
    await afterResizeObservers(view);
    stageHost.style.width = '30rem';
    await afterResizeObservers(view);
    await expect(trigger).not.toHaveFocus();
  },
});
