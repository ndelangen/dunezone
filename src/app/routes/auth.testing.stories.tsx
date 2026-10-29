import { testingPreview } from '@sb/preview';
import { createMemoryHistory } from '@tanstack/react-router';
import { expect, waitFor, within } from 'storybook/test';

import { lastSignedInWithDiscord } from './auth.stories.fixture';
import { StorybookPage } from './storybook';
import { pageStoryMeta } from './storybookConfig';

const meta = testingPreview.meta({
  title: 'Auth',
  ...pageStoryMeta,
});

let history = createMemoryHistory({ initialEntries: ['/play/create'] });

/*
 * Chromium advances the band's Web Animations only on drawn frames, and a busy GPU process can draw none for seconds while timers and waits keep polling
 * (https://github.com/ndelangen/dunezone/issues/1180), so a wait for the 700 ms grow or shrink to run out times the runner rather than the band.
 * Each poll finishes whatever the band is playing, which settles it through the same `finished` callbacks a drawn last frame would.
 * An animation the band fails to clean up stays listed with its end state held, so the waits still fail on a band that never settles.
 */
function finishBandMotion(band: Element) {
  for (const animation of band.getAnimations()) {
    animation.finish();
  }
  return band.getAnimations();
}

/* Arriving at sign-in grows the band to the window, and leaving shrinks it back over the arriving page. */
export const BandGrowsAndShrinks = meta.story({
  args: { path: '/play/create' },
  parameters: { identity: null },
  globals: { motion: 'on' },
  beforeEach: () => {
    history = createMemoryHistory({ initialEntries: ['/play/create'] });
  },
  render: (args) => <StorybookPage {...args} history={history} />,
  play: async ({ canvasElement }) => {
    const document = canvasElement.ownerDocument;
    const page = within(document.body);
    const frame = document.querySelector('[data-app-frame]')!;
    await page.findByRole('heading', { name: 'Create a game', level: 1 }, { timeout: 30_000 });
    history.push('/auth/login');
    await page.findByRole('button', { name: 'Continue with Google' }, { timeout: 30_000 });
    /* The grow holds its end state, so the shrink starts from the window-sized band. */
    const band = frame.querySelector('[data-app-band]')!;
    /* The band cancels its companion animations when it settles; their finished promises can reject. */
    await waitFor(() => expect(finishBandMotion(band)).toHaveLength(0));
    await expect(band.getBoundingClientRect().height).toBe(document.defaultView!.innerHeight);
    history.push('/faq');
    await waitFor(() => expect(frame).toHaveAttribute('data-band-unwinding'));
    await waitFor(() => {
      finishBandMotion(band);
      return expect(frame).not.toHaveAttribute('data-band-unwinding');
    });
  },
});

/** On a phone the mark stays on the logo without clipping the label. */
export const LoginLastUsedMobile = meta.story({
  args: { path: '/auth/login' },
  parameters: { identity: null },
  globals: { viewport: { value: 'appMobile' } },
  beforeEach: lastSignedInWithDiscord,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const discord = await page.findByRole('button', { name: /^Continue with Discord/ }, { timeout: 30_000 });
    await expect(discord).toHaveAccessibleName('Continue with Discord Last used');
    await expect(discord.scrollWidth).toBeLessThanOrEqual(discord.clientWidth);
    await expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
});
