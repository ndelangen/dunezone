import preview from '@sb/preview';
import { GF9_NEXUS_CARDS } from '@shared/assets/gf9Nexus';
import { expect, waitFor } from 'storybook/test';

import { NexusCard } from './Nexus';

const { about: _about, ...face } = GF9_NEXUS_CARDS[0]!;
const meta = preview.meta({ component: NexusCard, globals: { viewport: { value: 'card' } }, args: face });

export const Atreides = meta.story({
  play: async ({ canvasElement }) => {
    const emblems = canvasElement.querySelectorAll<HTMLImageElement>('img[src="/vector/logo/atreides.svg"]');
    await expect(emblems).toHaveLength(1);
    for (const emblem of emblems) {
      await expect(getComputedStyle(emblem).mixBlendMode).toBe('normal');
      await expect(getComputedStyle(emblem).filter).toContain('invert(1)');
    }
  },
});
export const Emperor = meta.story({ args: GF9_NEXUS_CARDS.find(({ faction }) => faction === 'Emperor')! });
export const LongEffects = meta.story({
  args: {
    faction: 'A faction with a long name of forty chars',
    betrayal: 'W'.repeat(400),
    cunning: '沙漠'.repeat(200),
    secretAlly: Array.from({ length: 6 }, () => 'Long rules text with several words. '.repeat(1)).join('\n'),
  },
  play: async ({ canvasElement }) => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(canvasElement.querySelectorAll('section'), async (section) => {
        const rules = section.lastElementChild as HTMLElement;
        await waitFor(() => {
          expect(rules.scrollHeight).toBeLessThanOrEqual(rules.clientHeight + 1);
          expect(rules.scrollWidth).toBeLessThanOrEqual(rules.clientWidth + 1);
          expect(section.getBoundingClientRect().bottom).toBeLessThanOrEqual(
            section.parentElement!.getBoundingClientRect().bottom + 1
          );
        });
      })
    );
  },
});
