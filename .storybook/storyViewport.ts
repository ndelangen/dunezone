import { waitFor } from 'storybook/test';

let resizedWidth = window.innerWidth;
let resizedHeight = window.innerHeight;
const viewportEvents: { kind: string; at: number; width: number; height: number }[] = [];

function recordViewportEvent(kind: string) {
  viewportEvents.push({ kind, at: performance.now(), width: window.innerWidth, height: window.innerHeight });
  if (viewportEvents.length > 8) {
    viewportEvents.shift();
  }
}

recordViewportEvent('loaded');

window.addEventListener('resize', () => {
  resizedWidth = window.innerWidth;
  resizedHeight = window.innerHeight;
  recordViewportEvent('window resize');
});
window.visualViewport?.addEventListener('resize', () => recordViewportEvent('visual viewport resize'));
document.addEventListener('visibilitychange', () => recordViewportEvent(`visibility ${document.visibilityState}`));

/*
 * Vitest's viewport command can return before Chromium delivers the iframe's resize event.
 * Radix Select closes on that event, so a story must not open its menu while the event is pending.
 * Unchanged dimensions need no frame; changed dimensions wait for the browser's acknowledgement.
 */
export async function settleStoryViewport() {
  const startedAt = performance.now();
  await waitFor(() => {
    if (resizedWidth !== window.innerWidth || resizedHeight !== window.innerHeight) {
      const now = performance.now();
      const history = viewportEvents
        .map((event) => `${event.kind} ${event.width}x${event.height} ${Math.round(now - event.at)}ms ago`)
        .join('; ');
      const visual = window.visualViewport;
      throw new Error(
        `The story viewport is ${window.innerWidth}x${window.innerHeight}, but its last resize event acknowledged ${resizedWidth}x${resizedHeight}.\n` +
          `Readiness waited ${Math.round(now - startedAt)}ms; document is ${document.visibilityState}; layout viewport is ${document.documentElement.clientWidth}x${document.documentElement.clientHeight}; visual viewport is ${visual ? `${visual.width}x${visual.height}` : 'unavailable'}.\n` +
          `Viewport events, oldest first: ${history}.`
      );
    }
  });
}
