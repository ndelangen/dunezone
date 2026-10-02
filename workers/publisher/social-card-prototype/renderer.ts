import { initWasm, Resvg } from '@resvg/resvg-wasm';
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm';
import satori, { init } from 'satori/standalone';
import yoga from 'satori/yoga.wasm';

import candara from '../../../public/font/candara.woff';
import copperplate from '../../../public/font/copperplategothic-bold.woff';
import { card } from './card';
import type { CardInput, Variant } from './card';

let ready: Promise<void[]> | undefined;
export async function render(input: CardInput, variant: Variant) {
  ready ??= Promise.all([init(yoga), initWasm(resvgWasm)]);
  await ready;
  const svg = await satori(card(input, variant), {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'Candara', data: candara, weight: 400 },
      { name: 'Copperplate', data: copperplate, weight: 400 },
    ],
  });
  const renderer = new Resvg(svg, { font: { loadSystemFonts: false } });
  try {
    const rendered = renderer.render();
    try {
      return { png: rendered.asPng(), svg };
    } finally {
      rendered.free();
    }
  } finally {
    renderer.free();
  }
}
