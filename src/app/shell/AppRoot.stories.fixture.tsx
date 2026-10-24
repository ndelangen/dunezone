import { Button } from '@mantine/core';
import { PageTitle } from '@ui/block/PageTitle';
import { PageLayout } from '@ui/layout/PageLayout';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

export function HeaderResizePage() {
  const [showHeader, setShowHeader] = useState(false);

  return (
    <PageLayout>
      {showHeader && (
        <PageLayout.Header size="compact">
          <PageTitle title="Header resize example" />
        </PageLayout.Header>
      )}
      <PageLayout.Toolbar>
        <Button onClick={() => setShowHeader(!showHeader)}>
          {showHeader ? 'Hide page header' : 'Show page header'}
        </Button>
      </PageLayout.Toolbar>
      <PageLayout.Content>Use the control to expand and collapse the page header.</PageLayout.Content>
    </PageLayout>
  );
}

/* The band's `height 0.2s` transition in `AppHeader.module.css`. */
const BAND_TRANSITION_MS = 200;

/**
 * Takes hold of the band's height transition if it has not finished.
 * A finished transition leaves the element's animations, and one still listed is skipped, so the previous leg's transition cannot be rewound and read as this one's.
 * It pauses the transition, seeks it half way, reads the band's height there and finishes it, and returns that height.
 * Reading the animations flushes style, so a transition the last style change started is already there, whether or not a frame has run since.
 */
function holdHalfWay(header: HTMLElement, view: Window & typeof globalThis) {
  const transition = header
    .getAnimations()
    .find(
      (animation): animation is CSSTransition =>
        animation instanceof view.CSSTransition &&
        animation.transitionProperty === 'height' &&
        animation.playState !== 'finished'
    );
  if (!transition) {
    return undefined;
  }
  transition.pause();
  transition.currentTime = BAND_TRANSITION_MS / 2;
  const midway = header.getBoundingClientRect().height;
  transition.finish();
  return midway;
}

/**
 * In Chromium, as measured for this story, a CSS transition advances only on drawn frames, and its `transitionend` reaches the page from inside one.
 * When the GPU process is busy the page can draw no frame for seconds while its timers, and a wait's polls, keep running.
 * The transition then sits at one point until the wait's bound, so a story that waits for the end event times the runner rather than the band (https://github.com/ndelangen/dunezone/issues/1180).
 * So the story takes hold of the transition itself, from a mutation observer: its callback runs in the microtask after the click's render is committed, before any frame can advance or end the transition that render started.
 * A height strictly between the two resting heights proves the band animates, and none of that waits for a frame.
 * The story reads no transition events, so events a finished transition delivers late cannot stand in for a later change that did not animate.
 */
export async function playHeaderResize({ canvasElement }: { canvasElement: HTMLElement }, motion: 'reduce' | 'ok') {
  const canvas = within(canvasElement);
  const root = canvasElement.ownerDocument.documentElement;
  const view = canvasElement.ownerDocument.defaultView;
  /* The band is artwork and site navigation; the page's own header is the banner landmark. */
  const header = canvasElement.querySelector<HTMLElement>('[data-app-band]');
  if (!view || !header) {
    throw new Error('The header resize story requires a browser window and a mounted band.');
  }

  await waitFor(async () => {
    await expect(root).toHaveAttribute('data-motion', motion);
    await expect(header.getBoundingClientRect().height).toBe(51);
  });

  for (const expanded of [true, false]) {
    const from = header.getBoundingClientRect().height;
    let midway: number | undefined;
    const observer = new view.MutationObserver(() => {
      midway ??= holdHalfWay(header, view);
      if (midway !== undefined) {
        observer.disconnect();
      }
    });
    observer.observe(canvasElement, { attributes: true, childList: true, subtree: true });
    try {
      await userEvent.click(canvas.getByRole('button', { name: expanded ? 'Show page header' : 'Hide page header' }));
    } finally {
      observer.disconnect();
    }
    /* The band transitions its height alone; the immersive grow and shrink run as animations in bandMotion.ts. */
    const durations = new Set(view.getComputedStyle(header).transitionDuration.split(', '));
    await expect([...durations]).toEqual([motion === 'reduce' ? '0s' : '0.2s']);
    await waitFor(async () => {
      await expect(canvasElement.querySelector('[data-app-band]')).toBe(header);
      if (expanded) {
        await expect(header.getBoundingClientRect().height).toBeGreaterThan(51);
      } else {
        await expect(header.getBoundingClientRect().height).toBe(51);
      }
    });
    if (motion === 'reduce') {
      await expect(midway).toBeUndefined();
    } else {
      await expect(
        midway,
        `The band's height started no transition when the page header was ${expanded ? 'shown' : 'hidden'}.`
      ).toBeDefined();
      const to = header.getBoundingClientRect().height;
      await expect(midway).toBeGreaterThan(Math.min(from, to));
      await expect(midway).toBeLessThan(Math.max(from, to));
    }
  }
}
