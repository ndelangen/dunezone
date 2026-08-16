/* The channel event the Controls panel itself sends. A play function has no `updateArgs`, and the
   band's height is only reachable through args, so driving the arg is the one way to play the
   transition automatically. */
import { UPDATE_STORY_ARGS } from 'storybook/internal/core-events';
import { addons } from 'storybook/preview-api';

import { shellPageOptionLabels } from './ShellStoryPage.stories.fixture';

const SETTLE_MS = 400;
const SAMPLE_INTERVAL_MS = 20;

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export interface BandResizeReport {
  /** The height the band came to rest at after each route state, in order. */
  settledHeights: number[];
  /**
   * A height that changed without passing through a single intermediate size — the band cutting straight to its new height instead of transitioning to it.
   */
  jumped: boolean;
  /** Whether any arg change replaced the band element instead of resizing the mounted one. */
  remounted: boolean;
}

/**
 * Steps a mounted `AppHeader` through every route state and reports how the band got there.
 *
 * Sampling is the point: the height is a CSS transition, so the only evidence it animated is a frame that is neither where it started nor where it ended, measured on the very same element.
 *
 * Only the interactive preview has a manager to accept the arg updates;
 * under the test runner the emit is a no-op and the band simply holds its opening height.
 * So the findings are phrased as "no change was ever a jump" and "the element was never replaced" — both true whether the story moved through one state or all of them.
 */
export async function playHeaderResize({
  canvasElement,
  id,
}: {
  canvasElement: HTMLElement;
  id: string;
}): Promise<BandResizeReport> {
  const band = canvasElement.querySelector('header');
  if (band == null) {
    throw new Error('The masthead band never rendered, so the resize cannot be measured.');
  }

  const channel = addons.getChannel();
  const height = () => Math.round(band.getBoundingClientRect().height);
  const settledHeights: number[] = [height()];
  let jumped = false;
  let remounted = false;

  /* Ends back on the opening state: the arg is what the Controls panel reads, and a story left on a
     value it did not declare shows Storybook's "you modified this story" save prompt. */
  const [opening, ...rest] = shellPageOptionLabels;

  for (const label of [...rest, opening]) {
    const from = height();
    channel.emit(UPDATE_STORY_ARGS, { storyId: id, updatedArgs: { children: label } });

    const seen: number[] = [];
    for (let elapsed = 0; elapsed < SETTLE_MS; elapsed += SAMPLE_INTERVAL_MS) {
      seen.push(height());
      await wait(SAMPLE_INTERVAL_MS);
    }

    const to = height();
    const intermediates = seen.filter((sample) => sample !== from && sample !== to);
    jumped = jumped || (to !== from && intermediates.length === 0);
    remounted = remounted || band !== canvasElement.querySelector('header');
    settledHeights.push(to);
  }

  return { settledHeights, jumped, remounted };
}
