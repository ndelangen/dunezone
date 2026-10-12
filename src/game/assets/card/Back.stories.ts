import preview from '@sb/preview';
import { GF9_LEADER_SKILL_DECK_BACK } from '@shared/assets/gf9LeaderSkills';
import { GF9_STRONGHOLD_DECK } from '@shared/assets/gf9StrongholdDeck';
import { STANDARD_STORM_CARDBACK } from '@shared/assets/standardStormDeck';
import { expect } from 'storybook/test';

import { backgroundPresets } from '../../data/backgrounds';
import { CardBack } from './Back';

const meta = preview.meta({
  component: CardBack,
  globals: {
    viewport: {
      value: 'card',
    },
  },
});

export const Icon = meta.story({
  args: {
    name: 'Traitor',
    background: backgroundPresets.traitor,
    image: '/vector/icon/traitor.svg',
    imageOffset: [0, 10],
    imageScale: 1.1,
  },
});

export const FactionLogo = meta.story({
  args: {
    name: 'Prescience',
    background: backgroundPresets.atreides,
    image: '/vector/logo/atreides.svg',
    imageOffset: [0, 5],
    imageScale: 1.1,
  },
});

export const CompactSymbol = meta.story({
  args: {
    name: 'Storm',
    background: backgroundPresets.storm,
    image: '/vector/icon/storrm_standalone.svg',
    imageOffset: [0, 5],
    imageScale: 0.8,
  },
});

export const OversizedSymbol = meta.story({
  args: {
    name: 'Alliance',
    background: backgroundPresets.alliance,
    image: '/vector/icon/alliance.svg',
    imageOffset: [-5, 20],
    imageScale: 1.35,
  },
});

export const LeaderSkillDeck = meta.story({ args: GF9_LEADER_SKILL_DECK_BACK });
async function verifyLabelPaint({ canvasElement }: { canvasElement: HTMLElement }) {
  await Promise.all([
    document.fonts.load('128.7px C_Busorama_Bold', 'STORM'),
    document.fonts.load('bold 128.7px C_Busorama', 'S'),
  ]);
  const label = canvasElement.querySelector<SVGTextElement>('text')!.ownerSVGElement!;
  const glyphs = Array.from(label.querySelectorAll<SVGTextElement>('text'));
  const paints = Array.from(label.querySelectorAll<SVGRectElement>('rect[mask]'));
  for (const paint of paints) {
    const painted = paint.getBBox();
    for (const glyph of glyphs) {
      const bounds = glyph.getBBox();
      await expect(painted.y).toBeLessThanOrEqual(bounds.y);
      await expect(painted.y + painted.height).toBeGreaterThanOrEqual(bounds.y + bounds.height);
    }
  }
}

export const StormDeckLabel = meta.story({ args: STANDARD_STORM_CARDBACK, play: verifyLabelPaint });
export const LargestStormLabel = meta.story({
  args: { ...STANDARD_STORM_CARDBACK, nameScale: 2 },
  play: verifyLabelPaint,
});
export const TintedEmblemBackground = meta.story({
  args: {
    ...GF9_LEADER_SKILL_DECK_BACK,
    emblemBackground: { color: '#4466aa', intensity: 1 },
  },
});
export const GentleEmblemBackground = meta.story({
  args: {
    ...GF9_LEADER_SKILL_DECK_BACK,
    emblemBackground: { color: '#4466aa', intensity: 0.35 },
  },
});
export const OriginalEmblemBackground = meta.story({
  args: {
    ...GF9_LEADER_SKILL_DECK_BACK,
    emblemBackground: { color: '#4466aa', intensity: 0 },
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('feColorMatrix')).toBeNull();
  },
});
export const StrongholdDeck = meta.story({
  args: GF9_STRONGHOLD_DECK.cardback,
  play: async ({ canvasElement }) => {
    const images = canvasElement.querySelectorAll('img');
    await expect(images).toHaveLength(1);
    const image = images[0]!;
    await image.decode();
    await expect(getComputedStyle(image).mixBlendMode).toBe('normal');
    await expect(image.getBoundingClientRect().height).toBe(286);
  },
});
