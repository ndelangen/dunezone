import preview from '@sb/preview';
import { resolveAsset } from '@shared/media/resolveAsset';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { FaqWalkthrough } from './FaqWalkthrough';
import type { FaqWalkthroughProps } from './FaqWalkthrough';

const exchange: FaqWalkthroughProps = {
  asker: 'Chani',
  askerImage: resolveAsset('/image/leader/official/chani.png', 'small'),
  question: 'Can I ship troops into the storm?',
  answers: [
    {
      author: 'Stilgar',
      image: resolveAsset('/image/leader/official/stilgar.png', 'small'),
      text: 'No. Shipment into a territory under the storm is never allowed.',
    },
    {
      author: 'Liet',
      image: resolveAsset('/image/leader/official/liet.jpg', 'small'),
      text: 'The storm blocks shipment and movement into it, and troops already there are lost when it moves over them.',
    },
    {
      author: 'Jessica',
      image: resolveAsset('/image/leader/official/jessica.png', 'small'),
      text: 'Unless your faction has an advantage that says otherwise. Check your sheet.',
    },
  ],
  accepted: 1,
};

const meta = preview.meta({
  component: FaqWalkthrough,
  parameters: { layout: 'padded' },
  args: exchange,
});

/** Replies arrive in order, then the accepted reply moves first. The reader can pause the example. */
export const Animated = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Can I ship troops into the storm?')).toBeInTheDocument();
    await expect(canvas.getByText('Accepted answer')).toBeInTheDocument();
    /* One name throughout, with the pressed state saying whether it holds. */
    const pause = canvas.getByRole('button', { name: 'Pause animation' });
    await expect(pause).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(pause);
    await expect(pause).toHaveAttribute('aria-pressed', 'true');
    const stage = canvas.getByRole('list', { name: 'Example answers' }).parentElement!;
    await expect(stage.getAnimations({ subtree: true }).every((frame) => frame.playState === 'paused')).toBe(true);
    await userEvent.click(pause);
    await expect(pause).toHaveAttribute('aria-pressed', 'false');
  },
});

/** With the site's motion off, the end of the story stands still: every reply in, one of them accepted. */
export const Still = meta.story({
  globals: { motion: 'reduce' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Accepted answer')).toBeVisible();
    const rows = canvas.getAllByRole('listitem');
    await expect(rows.find((row) => row.textContent?.includes('Liet'))!.getBoundingClientRect().top).toBeLessThan(
      rows[0]!.getBoundingClientRect().top
    );
    await expect(canvas.getByText('Accepted by Chani just now')).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Accept answer' })).toBeNull();
    await expect(canvas.getByText(exchange.answers[2]!.text)).toBeVisible();
    /* Nothing moves, so there is nothing to pause. */
    await expect(canvas.queryByRole('button', { name: /animation/ })).toBeNull();
  },
});

export const Phone = meta.story({ globals: { motion: 'reduce', viewport: { value: 'appMobileNarrow' } } });

/** Every phase shares one paused clock, including the smooth change in answer order. */
export const Choreography = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Pause animation' }));
    const list = canvas.getByRole('list', { name: 'Example answers' });
    const stage = list.parentElement!;
    const frames = stage.getAnimations({ subtree: true });
    const seek = (progress: number) => {
      for (const frame of frames) {
        const timing = frame.effect!.getTiming();
        frame.currentTime = (timing.delay ?? 0) + Number(timing.duration) * (1 + progress);
      }
    };
    const first = canvas.getByRole('article', { name: "Stilgar's example answer" });
    const chosen = canvas.getByRole('article', { name: "Liet's example answer" });
    const last = canvas.getByRole('article', { name: "Jessica's example answer" });
    await expect(list.children[0]).toHaveTextContent('Stilgar');
    const height = stage.getBoundingClientRect().height;
    const rows = Array.from(list.children);
    for (const [progress, visibleCount] of [
      [0.45, 1],
      [0.55, 2],
      [0.65, 3],
    ] as const) {
      seek(progress);
      for (const [index, row] of rows.entries()) {
        await expect(Number(getComputedStyle(row).opacity)).toBe(index < visibleCount ? 1 : 0);
      }
    }
    seek(0.7);
    await expect(canvas.getByText('Open question')).toBeVisible();
    await expect(canvas.getByText('Accepted answer')).not.toBeVisible();
    const gap = Number.parseFloat(getComputedStyle(list).rowGap);
    const firstBox = first.getBoundingClientRect();
    const chosenBox = chosen.getBoundingClientRect();
    const lastBox = last.getBoundingClientRect();
    await expect(chosenBox.top - firstBox.bottom).toBeCloseTo(gap, 0);
    await expect(lastBox.top - chosenBox.bottom).toBeCloseTo(gap, 0);
    const before = chosenBox.top;
    await expect(first.getBoundingClientRect().top).toBeLessThan(before);
    await expect(before).toBeLessThan(last.getBoundingClientRect().top);
    seek(0.84);
    const during = chosen.getBoundingClientRect().top;
    seek(0.92);
    const after = chosen.getBoundingClientRect().top;
    await expect(during).toBeLessThan(before);
    await expect(during).toBeGreaterThan(after);
    await expect(after).toBeLessThan(first.getBoundingClientRect().top);
    await expect(canvas.getByText('Accepted by Chani just now')).toBeVisible();
    await expect(stage.getBoundingClientRect().height).toBe(height);
    await expect(frames.every((frame) => frame.playState === 'paused')).toBe(true);
  },
});

/** The natural clock must keep replies aligned without seeking their timelines. */
export const NaturalSpacing = meta.story({
  globals: { motion: 'on' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const list = canvas.getByRole('list', { name: 'Example answers' });
    const stage = list.parentElement!;
    await waitFor(
      async () => {
        const progress = stage.getAnimations()[0]!.effect!.getComputedTiming().progress!;
        await expect(progress).toBeGreaterThan(0.68);
        await expect(progress).toBeLessThan(0.74);
      },
      { timeout: 20_000 }
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Pause animation' }));
    const first = canvas.getByRole('article', { name: "Stilgar's example answer" }).getBoundingClientRect();
    const second = canvas.getByRole('article', { name: "Liet's example answer" }).getBoundingClientRect();
    const third = canvas.getByRole('article', { name: "Jessica's example answer" }).getBoundingClientRect();
    const gap = Number.parseFloat(getComputedStyle(list).rowGap);
    await expect(second.top - first.bottom).toBeCloseTo(gap, 0);
    await expect(third.top - second.bottom).toBeCloseTo(gap, 0);
  },
});

/** Reproduce resizing the actual preview during the arrival sequence. */
export const ViewportResize = meta.story({
  tags: ['!dev'],
  globals: { motion: 'on' },
  play: async ({ canvasElement }) => {
    const { page } = await import('vite-plus/test/browser/context');
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Pause animation' }));
    const list = canvas.getByRole('list', { name: 'Example answers' });
    const stage = list.parentElement!;
    const seek = (progress: number) => {
      for (const frame of stage.getAnimations({ subtree: true })) {
        const timing = frame.effect!.getTiming();
        frame.currentTime = (timing.delay ?? 0) + Number(timing.duration) * (1 + progress);
      }
    };
    seek(0.7);
    try {
      for (const width of [900, 700, 1200, 820, 400, 1200]) {
        await page.viewport(width, 1000);
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        for (const progress of [0.7, 0.92]) {
          seek(progress);
          const rows = Array.from(list.children).sort(
            (a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top
          );
          await expect(rows[0]).toHaveTextContent(progress === 0.7 ? 'Stilgar' : 'Liet');
          const gap = Number.parseFloat(getComputedStyle(list).rowGap);
          for (let i = 1; i < rows.length; i++) {
            await expect(
              Math.abs(rows[i]!.getBoundingClientRect().top - rows[i - 1]!.getBoundingClientRect().bottom - gap)
            ).toBeLessThan(1);
          }
        }
      }
    } finally {
      await page.viewport(1200, 900);
    }
  },
});
