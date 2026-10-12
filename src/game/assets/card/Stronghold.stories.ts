import preview from '@sb/preview';
import { GF9_STRONGHOLD_CARDS } from '@shared/assets/gf9StrongholdDeck';
import { expect } from 'storybook/test';

import { StrongholdCard } from './Stronghold';

const meta = preview.meta({
  component: StrongholdCard,
  globals: { viewport: { value: 'card' } },
  args: GF9_STRONGHOLD_CARDS[0],
});

/** Each face must show its whole Body inside the printed frame. */
async function checkBody({ canvasElement }: { canvasElement: HTMLElement }) {
  await document.fonts.ready;
  const body = [...canvasElement.querySelectorAll<HTMLElement>('div')].find(
    (element) => element.style.fontSize === '40px' && element.style.height === '499px'
  );
  await expect(body).toBeDefined();
  await expect(body!.scrollHeight).toBeLessThanOrEqual(body!.clientHeight);
}

export const Arrakeen = meta.story({ args: GF9_STRONGHOLD_CARDS[0], play: checkBody });
export const Carthag = meta.story({ args: GF9_STRONGHOLD_CARDS[1], play: checkBody });
export const HabbanyaSietch = meta.story({ args: GF9_STRONGHOLD_CARDS[2], play: checkBody });
export const IxianHiddenMobileStronghold = meta.story({ args: GF9_STRONGHOLD_CARDS[3], play: checkBody });
export const SietchTabr = meta.story({ args: GF9_STRONGHOLD_CARDS[4], play: checkBody });
export const TueksSietch = meta.story({ args: GF9_STRONGHOLD_CARDS[5], play: checkBody });
