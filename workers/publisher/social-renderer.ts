import { initWasm, Resvg } from '@resvg/resvg-wasm';
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm';
import satori, { init } from 'satori/standalone';
import yoga from 'satori/yoga.wasm';

import candara from '../../public/font/candara.woff';
import copperplate from '../../public/font/copperplategothic-bold.woff';
import type { SocialCardInput } from '../../src/shared/socialCard';
import { SOCIAL_CARD_WIDTH, SOCIAL_CARD_HEIGHT } from '../../src/shared/socialCard';
import { socialCard } from './social-card';

let ready: Promise<void[]> | undefined;
export async function renderSocialCard(input: SocialCardInput, artwork: string) {
  ready ??= Promise.all([init(yoga), initWasm(resvgWasm)]);
  await ready;
  const svg = await satori(socialCard({ ...input, artwork }), {
    width: SOCIAL_CARD_WIDTH,
    height: SOCIAL_CARD_HEIGHT,
    fonts: [
      { name: 'Candara', data: candara, weight: 400 },
      { name: 'Copperplate', data: copperplate, weight: 400 },
    ],
  });
  const renderer = new Resvg(svg, { font: { loadSystemFonts: false } });
  try {
    const rendered = renderer.render();
    try {
      return rendered.asPng();
    } finally {
      rendered.free();
    }
  } finally {
    renderer.free();
  }
}
