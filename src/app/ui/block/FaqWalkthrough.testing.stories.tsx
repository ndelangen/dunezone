import { testingPreview } from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { FaqWalkthrough } from './FaqWalkthrough';
import { exchange } from './FaqWalkthrough.stories.fixture';

const meta = testingPreview.meta({
  title: 'FaqWalkthrough',
  component: FaqWalkthrough,
  parameters: { layout: 'padded' },
  args: exchange,
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
        for (const phase of [
          { progress: 0.7, first: 'Stilgar' },
          { progress: 0.92, first: 'Liet' },
        ]) {
          seek(phase.progress);
          const rows = Array.from(list.children).sort(
            (a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top
          );
          await expect(rows[0]).toHaveTextContent(phase.first);
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
