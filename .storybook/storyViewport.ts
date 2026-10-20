import { waitFor } from 'storybook/test';

let resizedWidth = window.innerWidth;
let resizedHeight = window.innerHeight;

window.addEventListener('resize', () => {
  resizedWidth = window.innerWidth;
  resizedHeight = window.innerHeight;
});

/*
 * Vitest's viewport command can return before Chromium delivers the iframe's resize event.
 * Radix Select closes on that event, so a story must not open its menu while the event is pending.
 * Unchanged dimensions need no frame; changed dimensions wait for the browser's acknowledgement.
 */
export async function settleStoryViewport() {
  await waitFor(() => {
    if (resizedWidth !== window.innerWidth || resizedHeight !== window.innerHeight) {
      throw new Error(
        `The story viewport is ${window.innerWidth}x${window.innerHeight}, but its last resize event acknowledged ${resizedWidth}x${resizedHeight}.`
      );
    }
  });
}
