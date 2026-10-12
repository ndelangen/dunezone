import preview from '@sb/preview';
import { GF9_STRONGHOLD_CARDS } from '@shared/assets/gf9StrongholdDeck';
import { expect, waitFor, within } from 'storybook/test';

import { StrongholdCard } from './Stronghold';

const meta = preview.meta({
  component: StrongholdCard,
  globals: { viewport: { value: 'card' } },
  args: GF9_STRONGHOLD_CARDS[0],
});

/** Each stock face fills the illustration window and keeps its whole Body inside the frame. */
async function checkBody({ canvasElement, args }: { canvasElement: HTMLElement; args: { text: string } }) {
  await document.fonts.ready;
  const body = within(canvasElement).getByText(args.text, { exact: true }).closest('div');
  await expect(body).not.toBeNull();
  await expect(body!.scrollHeight).toBeLessThanOrEqual(body!.clientHeight);
  const illustration = canvasElement.querySelector('svg image')! as SVGImageElement;
  const image = new Image();
  image.src = illustration.href.baseVal;
  await image.decode();
  await waitFor(() => expect(illustration.getBBox().height).toBeGreaterThan(0));
  const box = illustration.getBBox();
  const fit = Math.min(box.width / image.naturalWidth, box.height / image.naturalHeight);
  const width = image.naturalWidth * fit;
  const height = image.naturalHeight * fit;
  const bounds = { x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2, width, height };
  await expect(bounds.x).toBeLessThanOrEqual(74);
  await expect(bounds.x + bounds.width).toBeGreaterThanOrEqual(826);
  await expect(bounds.y).toBeLessThanOrEqual(254);
  await expect(bounds.y + bounds.height).toBeGreaterThanOrEqual(686);
}

export const Arrakeen = meta.story({ args: GF9_STRONGHOLD_CARDS[0], play: checkBody });
export const Carthag = meta.story({ args: GF9_STRONGHOLD_CARDS[1], play: checkBody });
export const HabbanyaSietch = meta.story({ args: GF9_STRONGHOLD_CARDS[2], play: checkBody });
export const HMSStronghold = meta.story({ args: GF9_STRONGHOLD_CARDS[3], play: checkBody });
export const SietchTabr = meta.story({ args: GF9_STRONGHOLD_CARDS[4], play: checkBody });
export const TueksSietch = meta.story({ args: GF9_STRONGHOLD_CARDS[5], play: checkBody });
