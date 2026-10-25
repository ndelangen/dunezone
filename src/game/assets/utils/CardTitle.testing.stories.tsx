import { testingPreview } from '@sb/preview';
import { expect, spyOn, userEvent, within } from 'storybook/test';

import { ChangingCardTitle } from './CardTitle.stories.fixture';
import { settleCardTitles } from './cardTitleFit';

const meta = testingPreview.meta({
  title: 'CardTitle',
  component: ChangingCardTitle,
  args: { path: 'custom', scale: 1 },
});

export const FontSettlement = meta.story({
  args: { path: 'custom' },
  play: async ({ canvasElement }) => {
    await settleCardTitles(canvasElement);
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Next title' }));
    await settleCardTitles(canvasElement);
    const title = canvasElement.querySelector<HTMLDivElement>('div[aria-label="Rock Outcroppings"]')!;
    const span = title.firstElementChild as HTMLSpanElement;
    const originalLoad = document.fonts.load.bind(document.fonts);
    let release!: () => void;
    const pendingFont = new Promise<void>((resolve) => {
      release = resolve;
    });
    const load = spyOn(document.fonts, 'load').mockImplementation(async (...args) => {
      await pendingFont;
      return originalLoad(...args);
    });
    try {
      span.style.fontSize = '60px';
      let settled = false;
      const pending = settleCardTitles(canvasElement).then(() => {
        settled = true;
      });
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await expect(settled).toBe(false);
      const controller = new AbortController();
      const cancelled = settleCardTitles(canvasElement, controller.signal);
      controller.abort(new Error('Capture unmounted'));
      await expect(cancelled).rejects.toThrow('Capture unmounted');
      release();
      await pending;
      await expect(settled).toBe(true);
      await expect(Number.parseFloat(span.style.fontSize)).toBeLessThan(60);
      await expect(span.getBoundingClientRect().width).toBeLessThanOrEqual(title.clientWidth);
      load.mockImplementation(async () => []);
      await expect(settleCardTitles(canvasElement)).rejects.toThrow('Required publisher font failed to load exactly');
    } finally {
      release();
      load.mockRestore();
    }
  },
});
