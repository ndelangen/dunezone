import { testingPreview } from '@sb/preview';
import { expect, waitFor, within } from 'storybook/test';

import { gameMeta, install } from '../game.stories.fixture';
import { productTransport } from '../product.stories.fixture';

const meta = testingPreview.meta({
  ...gameMeta,
  title: 'Play/Compass controls',
  globals: { motion: 'reduce' },
  beforeEach: [
    install(() => productTransport('seat-2')),
    () => {
      const previous = localStorage.getItem('dunezone-compass:slots');
      localStorage.removeItem('dunezone-compass:slots');
      return () => {
        if (previous === null) {
          localStorage.removeItem('dunezone-compass:slots');
        } else {
          localStorage.setItem('dunezone-compass:slots', previous);
        }
      };
    },
  ],
});

async function chatBar(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  const chats = await page.findByRole('navigation', { name: 'Chats' }, { timeout: 30_000 });
  const launcher = page.getByRole('button', { name: /^Controls/ });
  const own = page.getByRole('button', { name: /^Hand & spice, you are playing as/ });
  const buttons = within(chats).getAllByRole('button');
  await expect(buttons).toHaveLength(6);
  return { chats, launcher, own, buttons };
}

/** A centered bar uses both halves of the table before wrapping any chat tokens. */
export const ChatBarUsesTableWidth = meta.story({
  globals: { viewport: { value: 'contentColumn' } },
  play: async ({ canvasElement }) => {
    const { chats, launcher, own, buttons } = await chatBar(canvasElement);
    await waitFor(async () => {
      const chat = chats.getBoundingClientRect();
      const control = launcher.getBoundingClientRect();
      await expect(chat.left).toBeGreaterThanOrEqual(control.right);
      await expect(Math.abs(chat.top - control.top)).toBeLessThan(2);
      await expect(own.getBoundingClientRect().right).toBeLessThanOrEqual(control.left);
      const tops = buttons.map((button) => Math.round(button.getBoundingClientRect().top));
      await expect(new Set(tops).size).toBe(1);
    });
  },
});

/** When the whole bar cannot fit, chats take a second row without shrinking or leaving the table. */
export const ChatBarWrapsOnNarrowTables = meta.story({
  globals: { viewport: { value: 'appMobileNarrow' } },
  play: async ({ canvasElement }) => {
    const { chats, launcher, own, buttons } = await chatBar(canvasElement);
    await waitFor(async () => {
      const chat = chats.getBoundingClientRect();
      const control = launcher.getBoundingClientRect();
      await expect(chat.top).toBeGreaterThanOrEqual(control.bottom);
      await expect(chat.left).toBeGreaterThanOrEqual(12);
      await expect(chat.right).toBeLessThanOrEqual(window.innerWidth - 12);
      await expect(own.getBoundingClientRect().width).toBeCloseTo(own.getBoundingClientRect().height, 0);
      const tops = buttons.map((button) => Math.round(button.getBoundingClientRect().top));
      await expect(new Set(tops).size).toBe(1);
      for (const button of buttons) {
        const bounds = button.getBoundingClientRect();
        await expect(bounds.width).toBeCloseTo(bounds.height, 0);
      }
    });
  },
});
