/**
 * Registers the story image worker (`static/story-images.sw.js`) and settles once it controls this page, so a story's first image request already goes through it.
 * Use it as a story's loader.
 * The worker stays registered, and every request it does not name passes through.
 */
export async function serveStoryImages() {
  const { serviceWorker } = navigator;
  const controlled = serviceWorker.controller
    ? Promise.resolve()
    : new Promise((resolve) => serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  await serviceWorker.register('/story-images.sw.js');
  await controlled;
  return {};
}

/** An image URL that never answers, for a story that shows loading. */
export function heldImage(name: string) {
  return `/__story-images/held/${name}`;
}

/** An image URL that answers after `ms`, for a story that shows an arrival; give each story its own name, since a decoded URL appears at once the next time. */
export function imageAfter(ms: number, name: string) {
  return `/__story-images/after/${ms}/${name}.svg`;
}
