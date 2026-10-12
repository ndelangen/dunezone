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
  await document.fonts.load('128.7px C_Busorama', 'STORM');
  const label = canvasElement.querySelector<SVGTextElement>('text')!.ownerSVGElement!;
  const glyphs = Array.from(label.querySelectorAll<SVGTextElement>('text'));
  const paints = Array.from(label.querySelectorAll<SVGRectElement>('rect[mask]'));
  /* Glyph cells include blank font space, so the canvas metrics locate their painted ink. */
  const context = document.createElement('canvas').getContext('2d')!;
  for (const paint of paints) {
    const painted = paint.getBBox();
    for (const glyph of glyphs) {
      const nodes = document.createTreeWalker(glyph, NodeFilter.SHOW_TEXT);
      let characterIndex = 0;
      while (nodes.nextNode()) {
        const node = nodes.currentNode;
        const font = getComputedStyle(node.parentElement!);
        context.font = `${font.fontStyle} ${font.fontWeight} ${font.fontSize} ${font.fontFamily}`;
        for (const character of node.textContent!.toUpperCase()) {
          const cell = glyph.getExtentOfChar(characterIndex++);
          const ink = context.measureText(character);
          const baseline = cell.y + ink.fontBoundingBoxAscent;
          await expect(painted.y).toBeLessThanOrEqual(baseline - ink.actualBoundingBoxAscent);
          await expect(painted.y + painted.height).toBeGreaterThanOrEqual(baseline + ink.actualBoundingBoxDescent);
        }
      }
    }
  }
}

export const SmallestStormLabel = meta.story({
  args: { ...STANDARD_STORM_CARDBACK, nameScale: 0.5 },
  play: verifyLabelPaint,
});
export const DefaultStormLabel = meta.story({
  args: { ...STANDARD_STORM_CARDBACK, nameScale: 1 },
  play: verifyLabelPaint,
});
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

export const LegacyBoldLabel = meta.story({
  args: { ...GF9_LEADER_SKILL_DECK_BACK, nameFont: 'C_Busorama_Bold' },
  play: async ({ canvasElement }) => {
    for (const text of canvasElement.querySelectorAll('text')) {
      await expect(getComputedStyle(text).fontFamily).toBe('C_Busorama');
    }
  },
});
