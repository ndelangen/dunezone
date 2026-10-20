import preview from '@sb/preview';
import karama from '@shared/assets/fixtures/karamaReplacement.json';
import { TREACHERY_BACKGROUNDS } from '@shared/assets/treacheryStyles';
import { expect } from 'storybook/test';

import { treacheryCardFixtures } from '../../fixtures/treacheryCards';
import { TreacheryCard } from './Treachery';

const meta = preview.meta({
  component: TreacheryCard,
  play: async ({ canvasElement }) => {
    await document.fonts.ready;
    const text = canvasElement.querySelector<HTMLElement>('[data-component-part="name"] span');
    await expect(text).not.toBeNull();
    await expect(text!.scrollWidth).toBeLessThanOrEqual(text!.parentElement!.clientWidth + 1);
    const icon = canvasElement.querySelector('[data-component-part="icon"]');
    await expect(text!.getBoundingClientRect().right).toBeLessThanOrEqual(icon!.getBoundingClientRect().left);
  },
  globals: {
    viewport: {
      value: 'card',
    },
  },
});

export const Weapon = meta.story({ args: treacheryCardFixtures.lasgun });
export const FullBleedDecal = meta.story({ args: treacheryCardFixtures.weirdingWay });
export const Defense = meta.story({ args: treacheryCardFixtures.shield });
export const Special = meta.story({ args: treacheryCardFixtures.cheapHero });
export const Worthless = meta.story({ args: treacheryCardFixtures.baliset });
export const LongTitle = meta.story({
  args: { ...treacheryCardFixtures.cheapHero, name: 'An exceptionally long card title' },
});
export const WideTitle = meta.story({
  args: { ...treacheryCardFixtures.cheapHero, name: 'SMUGGLER MOVEMENT' },
});
export const FactionIcon = meta.story({ args: treacheryCardFixtures.richeseKarama });
export const ScaledIcon = meta.story({ args: treacheryCardFixtures.shaiHulud });
export const Voice = meta.story({ args: treacheryCardFixtures.noSnooper });
export const LayeredDecals = meta.story({ args: treacheryCardFixtures.layeredDecals });

export const FullWidthTitle = meta.story({ args: { ...treacheryCardFixtures.lasgun, name: '沙漠'.repeat(20) } });

/** The accepted replacement body uses the ordinary Treachery identity and badge. */
export const TextOnly = meta.story({
  args: {
    ...treacheryCardFixtures.lasgun,
    ...karama,
    bodyLayout: 'text-only',
    decals: [],
    head: TREACHERY_BACKGROUNDS.special,
    icon: [TREACHERY_BACKGROUNDS.stripedSpecial, '/vector/icon/hand.svg'],
  },
  play: async ({ canvasElement }) => {
    await document.fonts.load('38.75px "C_Candara"');
    await document.fonts.ready;
    const body = canvasElement.querySelector<HTMLElement>('[data-component-part="body"]')!;
    await expect(body.textContent).toContain('Cannot be used to stop a Special Victory Condition');
    await expect(body.scrollHeight).toBeLessThanOrEqual(body.clientHeight);
    await expect(getComputedStyle(body).fontSize).toBe('38.75px');
    await expect(canvasElement.querySelector('[data-component-part="decals"]')).toBeNull();
  },
});
