import { CanvasTexture, ImageLoader, TextureLoader } from 'three';
import type { Texture } from 'three';

/**
 * The width a card face is drawn at on the table.
 * A blind comparison on the real table (2026-10-17) read 512 px faces as sharper than the published 900 px ones: at the closest zoom a card covers about 500 screen pixels, and the GPU's own minification of a 900 px face blurs its small print more than one careful downscale does.
 * The face takes a third of the GPU memory too.
 * The close-up and the hand show the published image, so they keep its full size.
 */
export const TABLE_CARD_FACE_WIDTH = 512;

const TABLE_CARD = '#table-card';

/** The key a card face on the table loads under, apart from the full-size image the same URL gives elsewhere. */
export function tableCardFaceKey(href: string) {
  return `${href}${TABLE_CARD}`;
}

/** The steps a downscale takes: halving while one more halving stays above the target, then the target itself. */
export function downscaleSteps(width: number, height: number, targetWidth: number) {
  const targetHeight = Math.round((height * targetWidth) / width);
  const steps: [number, number][] = [];
  let currentWidth = width;
  let currentHeight = height;
  while (currentWidth / 2 > targetWidth) {
    currentWidth = Math.round(currentWidth / 2);
    currentHeight = Math.round(currentHeight / 2);
    steps.push([currentWidth, currentHeight]);
  }
  steps.push([targetWidth, targetHeight]);
  return steps;
}

function drawn(from: CanvasImageSource, width: number, height: number) {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('The card face could not be scaled.');
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(from, 0, 0, width, height);
  return canvas;
}

/* Loads the image the way the texture loader and the card face preload do, so a preloaded face comes from the memory cache. */
function cachedImage(href: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    new ImageLoader().setCrossOrigin('anonymous').load(href, resolve, undefined, reject);
  });
}

async function tableCardFace(href: string) {
  /* The bitmap decodes off the main thread; only the scaling draws run on it. */
  const image = await createImageBitmap(await cachedImage(href));
  try {
    if (image.width <= TABLE_CARD_FACE_WIDTH) {
      return drawn(image, image.width, image.height);
    }
    let source: CanvasImageSource = image;
    for (const [width, height] of downscaleSteps(image.width, image.height, TABLE_CARD_FACE_WIDTH)) {
      source = drawn(source, width, height);
    }
    return source as OffscreenCanvas;
  } finally {
    image.close();
  }
}

const scalesInPlace = () => typeof OffscreenCanvas === 'function' && typeof createImageBitmap === 'function';

/** Loads a published face: a table card's scaled to `TABLE_CARD_FACE_WIDTH`, anything else as published. */
export function loadFaceTexture(key: string, onLoad: (texture: Texture) => void, onError: () => void) {
  if (!key.endsWith(TABLE_CARD)) {
    new TextureLoader().load(key, onLoad, undefined, onError);
    return;
  }
  const href = key.slice(0, -TABLE_CARD.length);
  if (!scalesInPlace()) {
    new TextureLoader().load(href, onLoad, undefined, onError);
    return;
  }
  /* A browser that cannot scale here after all (no 2D context, or out of canvas memory) draws the published image instead. */
  tableCardFace(href).then(
    (canvas) => {
      const texture = new CanvasTexture(canvas);
      /* A scaled face keeps the published image it came from, which the hosted verification looks for. */
      texture.userData.publishedHref = href;
      onLoad(texture);
    },
    () => new TextureLoader().load(href, onLoad, undefined, onError)
  );
}
