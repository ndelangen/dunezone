import { configure, prettyDOM, waitFor } from 'storybook/test';

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
let storyStartedAt = 0;

/** A failed query states how late frames ran right after the line naming the element, so the next occurrence names its cause. */
export function resetFrameLag() {
  longestFrameLagMs = 0;
  storyStartedAt = performance.now();
}

/**
 * A Mantine tooltip, menu or popover fades in on a CSS opacity transition, and Chromium holds the computed opacity at 0 until it draws the frames that advance it.
 * On a runner whose frames arrive seconds late, a visibility wait can reach the bound above while the pane's inline opacity is already 1 (https://github.com/ndelangen/dunezone/issues/1303).
 * A keyframe entrance such as the battle wheel's `reveal` starts at opacity 0 and waits on drawn frames the same way (https://github.com/ndelangen/dunezone/issues/1422).
 * Wrap the element a visibility wait checks: this finishes the CSS transitions and finite CSS animations on it and on its ancestors, so `toBeVisible` reads the values they are heading to without waiting for another frame.
 * An infinite animation has no end to finish at and is left alone, and an element whose settled style is hidden still fails.
 */
export function finishTransitions<T extends Element>(element: T) {
  for (let node: Element | null = element; node; node = node.parentElement) {
    for (const animation of node.getAnimations()) {
      if (
        animation instanceof CSSTransition ||
        (animation instanceof CSSAnimation && Number.isFinite(animation.effect?.getComputedTiming().endTime))
      ) {
        animation.finish();
      }
    }
  }
  return element;
}

/* Callbacks the page asked a frame for that no frame has run yet, by request id, with when each was asked for. */
const waitingFrames = new Map<number, { callback: FrameRequestCallback; requestedAt: number }>();
const nativeCancelFrame = window.cancelAnimationFrame.bind(window);

/**
 * Runs the animation-frame callbacks waiting now, as the next drawn frame would.
 * A Mantine tooltip, menu or popover renders its content only from inside such a callback, so on a page that draws no frames the content never reaches the DOM and `finishTransitions` has no element to finish.
 * Call it inside a polling wait: each poll moves the page on by one frame, and a callback requested during this call waits for the next poll or a real frame, whichever comes first.
 * It runs every callback this story asked for, not only the one a wait needs, and each callback runs once.
 * A callback an earlier story asked for is left to a real frame, since the component that asked may be gone.
 * A callback that an earlier one cancels during this call does not run.
 * A callback that throws is reported as a frame would report it, and the rest still run.
 */
export function advanceFrame() {
  const time = performance.now();
  /* The ids are copied so a callback requested during this call waits, and each is looked up again before it runs, since a drawn frame skips one that an earlier callback cancelled. */
  const due = [...waitingFrames.keys()];
  for (const id of due) {
    const waiting = waitingFrames.get(id);
    if (!waiting || waiting.requestedAt < storyStartedAt) {
      continue;
    }
    waitingFrames.delete(id);
    nativeCancelFrame(id);
    try {
      waiting.callback(time);
    } catch (error) {
      reportError(error);
    }
  }
}

/**
 * A polling wait that runs the waiting animation-frame callbacks before each check, for an element that enters the DOM or its accessibility tree only from inside such a callback: a Mantine tooltip, menu or popover.
 * On a page that draws no frames for the whole bound, a plain wait fails although the element is one frame away (https://github.com/ndelangen/dunezone/issues/1443).
 */
export function waitForFrame<T>(check: () => T | Promise<T>, options?: Parameters<typeof waitFor>[1]) {
  return waitFor(() => {
    advanceFrame();
    return check();
  }, options);
}

/** The line a failed query adds after naming the element: the latest frame that ran, and the oldest one this story asked for that has not. */
function frameLagLine() {
  let oldest = Number.POSITIVE_INFINITY;
  for (const { requestedAt } of waitingFrames.values()) {
    if (requestedAt >= storyStartedAt) {
      oldest = Math.min(oldest, requestedAt);
    }
  }
  const waiting = Number.isFinite(oldest)
    ? `The oldest frame still waiting was asked for ${Math.round(performance.now() - oldest)} ms ago.`
    : 'No frame was waiting.';
  return `${LAG_LINE} ${Math.round(longestFrameLagMs)} ms. ${waiting}`;
}

function recordFrameLag() {
  const originalRequest = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
    const requestedAt = performance.now();
    const id = originalRequest((time) => {
      if (!waitingFrames.delete(id)) {
        return;
      }
      longestFrameLagMs = Math.max(longestFrameLagMs, performance.now() - requestedAt);
      callback(time);
    });
    waitingFrames.set(id, { callback, requestedAt });
    return id;
  };
  window.cancelAnimationFrame = (id: number) => {
    waitingFrames.delete(id);
    nativeCancelFrame(id);
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
    : [message, frameLagLine(), `Ignored nodes: comments, script, style, Storybook wrappers\n${storyDom(container)}`]
        .filter(Boolean)
        .join('\n\n');
  const error = new Error(text);
  error.name = 'TestingLibraryElementError';
  return error;
}

recordFrameLag();
configure({ asyncUtilTimeout: STORY_WAIT_TIMEOUT_MS, getElementError: storyElementError });
