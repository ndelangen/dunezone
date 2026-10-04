import { useEffect, useState } from 'react';

/**
 * A faction token turned face down shows its own front with the blocked symbol drawn over it, as the token art draws its reverse (#1021, `Token.tsx`).
 * There is no separately published back: every client draws the symbol over the front it already has.
 */
const BLOCKED_SYMBOL = '/vector/decal/block.svg';
/* The symbol keeps the token art's size and colours: 70% of the disc, red with a light outline. */
const SIZE = 512;
const SYMBOL = SIZE * 0.7;
const BLOCK_COLOR = '#b3261e';
const FOREGROUND = '#e3dbb3';
const OUTLINE = 10;
const RETRY_MS = 5000;

let decal: Promise<HTMLCanvasElement> | null = null;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`The blocked symbol ${src} did not load.`));
    image.src = src;
  });
}

/** The symbol filled with one colour. */
function tinted(image: HTMLImageElement, color: string) {
  const canvas = document.createElement('canvas');
  canvas.width = SYMBOL;
  canvas.height = SYMBOL;
  const context = canvas.getContext('2d')!;
  context.drawImage(image, 0, 0, SYMBOL, SYMBOL);
  context.globalCompositeOperation = 'source-in';
  context.fillStyle = color;
  context.fillRect(0, 0, SYMBOL, SYMBOL);
  return canvas;
}

async function drawDecal(): Promise<HTMLCanvasElement> {
  const image = await loadImage(BLOCKED_SYMBOL);
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const context = canvas.getContext('2d')!;
  const offset = (SIZE - SYMBOL) / 2;
  const outline = tinted(image, FOREGROUND);
  context.shadowColor = 'rgb(0 0 0 / 80%)';
  context.shadowBlur = 12;
  /* A ring of offset silhouettes stands in for the token art's stroke, which a canvas cannot give an image. */
  for (let step = 0; step < 16; step += 1) {
    const angle = (step / 16) * Math.PI * 2;
    context.drawImage(outline, offset + Math.cos(angle) * OUTLINE, offset + Math.sin(angle) * OUTLINE);
  }
  context.shadowBlur = 0;
  context.drawImage(tinted(image, BLOCK_COLOR), offset, offset);
  return canvas;
}

/** The overlay, drawn once and shared by every face-down faction token. */
function blockedDecal(): Promise<HTMLCanvasElement> {
  if (!decal) {
    decal = drawDecal();
    decal.catch(() => {
      decal = null;
    });
  }
  return decal;
}

/** The blocked symbol's overlay canvas, or null while it draws; a symbol that failed to load is tried again. */
export function useBlockedDecal(): HTMLCanvasElement | null {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    blockedDecal().then(
      (value) => live && setCanvas(value),
      () => {
        if (live) {
          retry = setTimeout(() => setAttempt((value) => value + 1), RETRY_MS);
        }
      }
    );
    return () => {
      live = false;
      clearTimeout(retry);
    };
  }, [attempt]);
  return canvas;
}
