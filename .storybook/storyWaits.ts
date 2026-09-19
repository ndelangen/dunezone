import { configure, prettyDOM } from 'storybook/test';

/*
 * Every story wait (findBy*, waitFor) runs against Testing Library's asyncUtilTimeout, a wall clock.
 * Menus, tooltips, popovers and the review plane enter the accessibility tree only from inside
 * requestAnimationFrame callbacks, and all stories share one Chromium page, so on the runner a
 * frame can arrive seconds after it was asked for while the story is otherwise correct. Measured on
 * the ubuntu runner across one suite: 281,976 frames more than 100 ms late, p99 831 ms, the longest
 * 6,369 ms; timers up to 4,408 ms late. The bound covers the longest with margin; a story that
 * passes pays nothing, since a wait resolves on the mutation that satisfies it, and a story whose
 * element never appears fails at the bound naming the element.
 * https://github.com/ndelangen/dunezone/issues/1248
 */
const STORY_WAIT_TIMEOUT_MS = 10_000;

let longestFrameLagMs = 0;

/** The first line of a failed wait says how late frames ran, so the next occurrence names its cause. */
export function resetFrameLag() {
  longestFrameLagMs = 0;
}

function recordFrameLag() {
  const originalRequest = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
    const requestedAt = performance.now();
    return originalRequest((time) => {
      longestFrameLagMs = Math.max(longestFrameLagMs, performance.now() - requestedAt);
      callback(time);
    });
  };
}

/* The tester page carries Storybook's hidden wrappers before the story's root; the dump shows the story. */
function storyDom(container: Element | null): string {
  if (container !== document.body) {
    return prettyDOM(container ?? undefined) || '';
  }
  return Array.from(document.body.children)
    .filter((child) => !child.classList.contains('sb-wrapper'))
    .map((child) => prettyDOM(child) || '')
    .join('\n');
}

function storyElementError(message: string | null, container: Element | null) {
  const error = new Error(
    [
      message,
      `The longest animation-frame lag during this story was ${Math.round(longestFrameLagMs)} ms.`,
      `Ignored nodes: comments, script, style, Storybook wrappers\n${storyDom(container)}`,
    ]
      .filter(Boolean)
      .join('\n\n')
  );
  error.name = 'TestingLibraryElementError';
  return error;
}

recordFrameLag();
configure({ asyncUtilTimeout: STORY_WAIT_TIMEOUT_MS, getElementError: storyElementError });
