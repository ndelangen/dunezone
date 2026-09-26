/**
 * Registers the story image worker (`static/story-images.sw.js`) and settles once it controls this page, so a story's first image request already goes through it.
 * Use it as the loader of a story that slows an image;
 * a story that does not slow one renders without it.
 * The worker stays registered, and every request it does not name passes through.
 */
export async function serveStoryImages() {
  /* The DOM types promise a container, but some private windows leave it undefined. */
  const serviceWorker: ServiceWorkerContainer | undefined = navigator.serviceWorker;
  if (!serviceWorker) {
    throw new Error('This story slows its images with a service worker, and this page cannot register one.');
  }
  if (serviceWorker.controller) {
    return {};
  }
  const controlled = new Promise((resolve) =>
    serviceWorker.addEventListener('controllerchange', resolve, { once: true })
  );
  const registration = await serviceWorker.register('/story-images.sw.js');
  /* After a hard reload the worker is already active but does not control the page, and only the worker can claim it. */
  registration.active?.postMessage('claim');
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
