import preview from '@sb/preview';
import { GF9_LEADER_SKILL_DECK_BACK } from '@shared/assets/gf9LeaderSkills';
import { GF9_STRONGHOLD_DECK } from '@shared/assets/gf9StrongholdDeck';
import { NEXUS_HEAD } from '@shared/assets/nexusTemplate';
import { STANDARD_STORM_CARDBACK } from '@shared/assets/standardStormDeck';
import { expect, waitFor } from 'storybook/test';

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

export const EnlargedNexusEmblem = meta.story({
  args: {
    name: 'Nexus',
    background: backgroundPresets.nexus,
    image: '/vector/icon/nexus.svg',
    imageOffset: [0, 0],
    imageScale: 1.8,
  },
  play: verifyEmblemWindow,
});

export const ShiftedMulticolorEmblem = meta.story({
  args: { ...GF9_STRONGHOLD_DECK.cardback, imageScale: 3, imageOffset: [100, 50] },
  play: verifyEmblemWindow,
});

export const LeaderSkillDeck = meta.story({ args: GF9_LEADER_SKILL_DECK_BACK });
async function verifyLabelPaint({ canvasElement }: { canvasElement: HTMLElement }) {
  await document.fonts.load('90px C_Busorama', 'STORM');
  const label = canvasElement.querySelector<SVGTextElement>('text')!.ownerSVGElement!;
  const glyphs = Array.from(label.querySelectorAll<SVGTextElement>('text'));
  const paints = Array.from(label.querySelectorAll<SVGRectElement>('rect[mask]'));
  await waitFor(() => {
    for (const glyph of glyphs) {
      expect(glyph.getComputedTextLength()).toBeLessThanOrEqual(680);
      expect(Number.parseFloat(getComputedStyle(glyph).fontSize)).toBeLessThanOrEqual(90);
    }
  });
  /* Glyph cells include blank font space, so the canvas metrics locate their painted ink. */
  const context = document.createElement('canvas').getContext('2d')!;
  for (const glyph of glyphs) {
    const font = getComputedStyle(glyph);
    context.font = `${font.fontStyle} ${font.fontWeight} ${font.fontSize} ${font.fontFamily}`;
    const ink = context.measureText(glyph.textContent!.toUpperCase());
    const baseline = glyph.getExtentOfChar(0).y + ink.fontBoundingBoxAscent;
    for (const paint of paints) {
      const painted = paint.getBBox();
      await expect(painted.y).toBeLessThanOrEqual(baseline - ink.actualBoundingBoxAscent);
      await expect(painted.y + painted.height).toBeGreaterThanOrEqual(baseline + ink.actualBoundingBoxDescent);
    }
  }
}

export const LongLabel = meta.story({
  args: { ...STANDARD_STORM_CARDBACK, name: 'A very long custom storm deck label' },
  play: verifyLabelPaint,
});
export const StormDeckLabel = meta.story({ args: STANDARD_STORM_CARDBACK, play: verifyLabelPaint });
export const LegacyLabelSize = meta.story({
  args: { ...STANDARD_STORM_CARDBACK, nameScale: 2, nameFont: 'C_Busorama_Bold' },
  play: async (context) => {
    await verifyLabelPaint(context);
    for (const text of context.canvasElement.querySelectorAll('text')) {
      await expect(getComputedStyle(text).fontSize).toBe('90px');
    }
  },
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

export const EmblemStaysInsideDisc = meta.story({
  args: {
    ...STANDARD_STORM_CARDBACK,
    name: 'Nexus',
    image: '/vector/icon/nexus.svg',
    background: NEXUS_HEAD,
    imageScale: 1.49,
    imageOffset: [0, 9],
  },
  play: verifyEmblemWindow,
});

async function verifyEmblemWindow({ canvasElement }: { canvasElement: HTMLElement }) {
  const images = Array.from(canvasElement.querySelectorAll('img'));
  await Promise.all(images.map((image) => image.decode()));
  const bounds = canvasElement.querySelector('img')!.parentElement!.parentElement!.getBoundingClientRect();
  /* The oversized image covers these corners, but the circular emblem window must exclude them. */
  await Promise.all(
    [
      [340, 345],
      [560, 345],
      [340, 565],
      [560, 565],
    ].flatMap(([x, y]) => {
      const painted = document.elementsFromPoint(bounds.x + x!, bounds.y + y!);
      return images.map((image) => expect(painted).not.toContain(image));
    })
  );
  await expect(document.elementsFromPoint(bounds.x + 450, bounds.y + 455)).toContain(images[0]);
}
