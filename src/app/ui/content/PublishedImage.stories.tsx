import preview from '@sb/preview';
import { heldImage, imageAfter, serveStoryImages } from '@sb/storyImages';
import { expect, waitFor, within } from 'storybook/test';

import { PublishedImage } from './PublishedImage';
import { decodedImage } from './PublishedImage.stories.fixture';
import { arrivalKeyframes } from './PublishedImage.stories.fixture';

/* The slot fades in over 240 ms, a reduced-motion arrival is a 160 ms fade, and the develop runs 450 ms. */
function animationDurations(canvasElement: HTMLElement) {
  return canvasElement.getAnimations({ subtree: true }).map((animation) => animation.effect?.getTiming().duration);
}

const meta = preview.meta({
  component: PublishedImage,
  parameters: { layout: 'padded' },
  args: { src: decodedImage, name: 'Atreides', aspect: 1, radius: '50%', raised: true },
});

/** Decoded before the grace window ends, so it appears at once, with nothing to arrive from. */
export const Arrived = meta.story({
  play: async ({ canvasElement }) => {
    const image = await within(canvasElement).findByRole<HTMLImageElement>('img', { name: 'Atreides' });
    await waitFor(() => expect(image.closest('[aria-busy]')).toBeNull());
    await expect(image.naturalWidth).toBe(600);
    await expect(canvasElement.getAnimations({ subtree: true })).toHaveLength(0);
  },
});

/** Still on its way: a faint glass slot at the image's exact size, drawn after the grace window, with no placeholder artwork. */
export const Loading = meta.story({
  args: { src: heldImage('loading') },
  loaders: [serveStoryImages],
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(animationDurations(canvasElement)).toContain(240));
    await expect(canvasElement.querySelector('[aria-busy="true"]')).not.toBeNull();
    await expect(within(canvasElement).queryByRole('img', { name: /preview unavailable/ })).toBeNull();
  },
});

/** No publication: matte and still, a glyph and the name, which never reads as loading. */
export const Missing = meta.story({
  args: { src: null },
  play: async ({ canvasElement }) => {
    const missing = within(canvasElement).getByRole('img', { name: 'Atreides: preview unavailable' });
    await expect(missing).toBeVisible();
    await expect(missing).not.toHaveAttribute('aria-busy');
    await expect(canvasElement.querySelectorAll('img')).toHaveLength(0);
  },
});

/** Reduced motion keeps the arrival as a short fade, with no blur and no scale. */
export const ArrivingWithReducedMotion = meta.story({
  args: { src: imageAfter(600, 'reduced-motion') },
  loaders: [serveStoryImages],
  globals: { motion: 'reduce' },
  play: async ({ canvasElement }) => {
    const image = await within(canvasElement).findByRole('img', { name: 'Atreides' });
    await waitFor(() => expect(image.closest('[aria-busy]')).toBeNull());
    await expect(animationDurations(canvasElement)).toContain(160);
    const keyframes = arrivalKeyframes(canvasElement);
    await expect(keyframes.some((frame) => 'filter' in frame || 'transform' in frame)).toBe(false);
  },
});
