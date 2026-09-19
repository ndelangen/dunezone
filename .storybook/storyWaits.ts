import { configure, prettyDOM } from 'storybook/test';

/*
 * Every story wait (findBy*, waitFor) runs against Testing Library's asyncUtilTimeout, a wall clock.
 * Menus, tooltips, popovers and the review plane enter the accessibility tree only from inside
 * requestAnimationFrame callbacks, and all stories share one Chromium page, so on the runner a
 * frame can arrive seconds after it was asked for while the story is otherwise correct. Measured on
 * the ubuntu runner across one suite: 281,976 frames more than 100 ms late, p99 831 ms, the longest
 * 6,369 ms; timers up to 4,408 ms late. The bound covers the longest with margin. A story that
 * passes pays nothing for it, since a wait resolves on the mutation or the 50 ms poll that
 * satisfies it, never at the bound; a story whose element never appears fails at the bound naming
 * the element. A per-wait `timeout` is for a wait that needs more than this, not for anything that
 * opens on a frame.
 * https://github.com/ndelangen/dunezone/issues/1248
 */
const STORY_WAIT_TIMEOUT_MS = 10_000;
const DUMP_LENGTH = 7000;
const LAG_LINE = 'The longest animation-frame lag during this story was';

let longestFrameLagMs = 0;

/** A failed query states how late frames ran right after the line naming the element, so the next occurrence names its cause. */
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

/*
 * The tester page carries Storybook's hidden wrappers before the story's root, and a waitFor
 * timeout hands over the Document rather than the body; the dump shows the story, capped once.
 */
function storyDom(container: Element | Document | null): string {
  const root = container?.nodeType === Node.DOCUMENT_NODE ? (container as Document).body : container;
  const dump =
    root === document.body
      ? Array.from(document.body.children)
          .filter((child) => !child.classList.contains('sb-wrapper'))
          .map((child) => prettyDOM(child, Number.POSITIVE_INFINITY) || '')
          .join('\n')
      : prettyDOM(root ?? undefined, Number.POSITIVE_INFINITY) || '';
  return dump.length > DUMP_LENGTH ? `${dump.slice(0, DUMP_LENGTH)}...` : dump;
}

function storyElementError(message: string | null, container: Element | Document | null) {
  /* A waitFor timeout wraps the query's own error, which already carries the lag line and the dump. */
  const text = message?.includes(LAG_LINE)
    ? message
    : [
        message,
        `${LAG_LINE} ${Math.round(longestFrameLagMs)} ms.`,
        `Ignored nodes: comments, script, style, Storybook wrappers\n${storyDom(container)}`,
      ]
        .filter(Boolean)
        .join('\n\n');
  const error = new Error(text);
  error.name = 'TestingLibraryElementError';
  return error;
}

recordFrameLag();
configure({ asyncUtilTimeout: STORY_WAIT_TIMEOUT_MS, getElementError: storyElementError });
