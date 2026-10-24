import { testingPreview } from '@sb/preview';
import { imageFailingOnce, serveStoryImages, imageAfter } from '@sb/storyImages';
import { expect, waitFor, within } from 'storybook/test';

import { PublishedImage } from './PublishedImage';
import { decodedImage, arrivalKeyframes } from './PublishedImage.stories.fixture';

const meta = testingPreview.meta({
  title: 'PublishedImage',
  component: PublishedImage,
  parameters: { layout: 'padded' },
  args: { src: decodedImage, name: 'Atreides', aspect: 1, radius: '50%', raised: true },
});

/** A publication that fails to load is missing too; it is fetched again out of sight after 5 s, and replaces the missing state when it lands. */
export const RecoversAfterFailedLoad = meta.story({
  /* Each render gets a URL of its own, so a rerun fails once again instead of showing the image decoded last time. */
  loaders: [async () => ({ ...(await serveStoryImages()), src: imageFailingOnce(`recovers-${crypto.randomUUID()}`) })],
  render: (args, { loaded }) => <PublishedImage {...args} src={loaded.src as string} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByRole('img', { name: 'Atreides: preview unavailable' })).resolves.toBeVisible();
    /* A publication that fails to load is missing too, with no img left behind. */
    await expect(canvasElement.querySelectorAll('img')).toHaveLength(0);
    /*
     * The first retry waits 5 s and the next two 10 s and 20 s.
     * The worker forgets which paths failed if the browser stops it while idle, so the wait covers a first retry answered with another 503.
     */
    const image = await canvas.findByRole<HTMLImageElement>('img', { name: 'Atreides' }, { timeout: 40_000 });
    await waitFor(() => expect(image.closest('[aria-busy]')).toBeNull());
    await expect(image.naturalWidth).toBe(600);
    await expect(canvas.queryByRole('img', { name: 'Atreides: preview unavailable' })).toBeNull();
  },
});

/** Landing after the slot has shown, the image develops out of a blur and a slight scale, and its shadow comes in with it. */
export const Arriving = meta.story({
  globals: { motion: 'on' },
  args: { src: imageAfter(600, 'arriving') },
  loaders: [serveStoryImages],
  play: async ({ canvasElement }) => {
    const image = await within(canvasElement).findByRole('img', { name: 'Atreides' });
    await waitFor(() => expect(image.closest('[aria-busy]')).toBeNull());
    const keyframes = arrivalKeyframes(canvasElement);
    await expect(keyframes).toContainEqual(expect.objectContaining({ filter: 'blur(12px)', transform: 'scale(1.03)' }));
  },
});
