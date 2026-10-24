import preview from '@sb/preview';
import { GF9_LEADER_SKILL_DECK_BACK } from '@shared/assets/gf9LeaderSkills';
import { GF9_STRONGHOLD_DECK } from '@shared/assets/gf9StrongholdDeck';
import { STANDARD_STORM_CARDBACK } from '@shared/assets/standardStormDeck';
import { expect } from 'storybook/test';

import { backgroundPresets } from '../../data/backgrounds';
import { CardBack } from './Back';
import { verifyLabelPaint } from './Back.stories.fixture';

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

export const LongLabel = meta.story({
  args: { ...STANDARD_STORM_CARDBACK, name: 'A very long custom storm deck label' },
  play: verifyLabelPaint,
});
export const LegacyLabelSize = meta.story({
  args: { ...STANDARD_STORM_CARDBACK, nameScale: 2, nameFont: 'C_Busorama_Bold' },
  play: async (context) => {
    await verifyLabelPaint(context);
    for (const text of context.canvasElement.querySelectorAll('text')) {
      await expect(getComputedStyle(text).fontSize).toBe('90px');
      /* The legacy bold font renders as regular C_Busorama. */
      await expect(getComputedStyle(text).fontFamily).toBe('C_Busorama');
    }
  },
});
export const TintedEmblemBackground = meta.story({
  args: {
    ...GF9_LEADER_SKILL_DECK_BACK,
    emblemBackground: { color: '#4466aa', intensity: 1 },
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
