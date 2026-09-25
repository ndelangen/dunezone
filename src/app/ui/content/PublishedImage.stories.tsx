import preview from '@sb/preview';
import { heldImage, imageAfter, serveStoryImages } from '@sb/storyImages';
import { expect, waitFor, within } from 'storybook/test';

import { PublishedImage } from './PublishedImage';

/* A self-contained image lands inside the grace window, which is how a cached publication behaves. */
const decodedImage = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><circle cx="300" cy="300" r="300" fill="#4b4c0d"/><circle cx="300" cy="300" r="285" fill="none" stroke="#e3dbb3" stroke-width="8"/><text x="300" y="340" text-anchor="middle" font-family="serif" font-size="120" fill="#e3dbb3">AT</text></svg>')}`;
const brokenImage = 'data:image/png;base64,not-an-image';

/* The slot fades in over 240 ms, a reduced-motion arrival is a 160 ms fade, and the develop runs 450 ms. */
function animationDurations(canvasElement: HTMLElement) {
  return canvasElement.getAnimations({ subtree: true }).map((animation) => animation.effect?.getTiming().duration);
}

function arrivalKeyframes(canvasElement: HTMLElement) {
  return canvasElement
    .getAnimations({ subtree: true })
    .flatMap((animation) => (animation.effect instanceof KeyframeEffect ? animation.effect.getKeyframes() : []));
}

const meta = preview.meta({
  component: PublishedImage,
  parameters: { layout: 'padded' },
  args: { src: decodedImage, name: 'Atreides', aspect: 1, radius: '50%', raised: true },
  loaders: [serveStoryImages],
});

/** Decoded before the grace window ends, so it appears at once, with nothing to arrive from. */
export const Arrived = meta.story({
  play: async ({ canvasElement }) => {
    const image = await within(canvasElement).findByRole<HTMLImageElement>('img', { name: 'Atreides' });
    await waitFor(() => expect(image.closest('[aria-busy]')).toBeNull());
    expect(image.naturalWidth).toBe(600);
    expect(canvasElement.getAnimations({ subtree: true })).toHaveLength(0);
  },
});

/** Still on its way: a faint glass slot at the image's exact size, drawn after the grace window, with no placeholder artwork. */
export const Loading = meta.story({
  args: { src: heldImage('loading') },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(animationDurations(canvasElement)).toContain(240));
    expect(canvasElement.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(within(canvasElement).queryByRole('img', { name: /preview unavailable/ })).toBeNull();
  },
});

/** No publication: matte and still, a glyph and the name, which never reads as loading. */
export const Missing = meta.story({
  args: { src: null },
  play: async ({ canvasElement }) => {
    const missing = within(canvasElement).getByRole('img', { name: 'Atreides: preview unavailable' });
    expect(missing).toBeVisible();
    expect(missing).not.toHaveAttribute('aria-busy');
    expect(canvasElement.querySelectorAll('img')).toHaveLength(0);
  },
});

/** A publication that fails to load is missing too. */
export const FailedLoad = meta.story({
  args: { src: brokenImage },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).findByRole('img', { name: 'Atreides: preview unavailable' })
    ).resolves.toBeVisible();
    expect(canvasElement.querySelectorAll('img')).toHaveLength(0);
  },
});

/** Landing after the slot has shown, the image develops out of a blur and a slight scale, and its shadow comes in with it. */
export const Arriving = meta.story({
  args: { src: imageAfter(600, 'arriving') },
  play: async ({ canvasElement }) => {
    const image = await within(canvasElement).findByRole('img', { name: 'Atreides' });
    await waitFor(() => expect(image.closest('[aria-busy]')).toBeNull());
    const keyframes = arrivalKeyframes(canvasElement);
    expect(keyframes).toContainEqual(expect.objectContaining({ filter: 'blur(12px)', transform: 'scale(1.03)' }));
  },
});

/** Reduced motion keeps the arrival as a short fade, with no blur and no scale. */
export const ArrivingWithReducedMotion = meta.story({
  args: { src: imageAfter(600, 'reduced-motion') },
  globals: { motion: 'reduce' },
  play: async ({ canvasElement }) => {
    const image = await within(canvasElement).findByRole('img', { name: 'Atreides' });
    await waitFor(() => expect(image.closest('[aria-busy]')).toBeNull());
    expect(animationDurations(canvasElement)).toContain(160);
    const keyframes = arrivalKeyframes(canvasElement);
    expect(keyframes.some((frame) => 'filter' in frame || 'transform' in frame)).toBe(false);
  },
});
