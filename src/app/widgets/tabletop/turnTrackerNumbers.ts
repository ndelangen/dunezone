import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three';

/* The face Play prints numbers in, as on leader discs and prediction cards (#1753). */
const TURN_NUMBER_FONT = 'C_Advokat_Modern';
const TEXTURE_SIZE = 1024;
/* A ten-turn wheel's numbers at this share of the disc radius; more sectors shrink them to fit. */
const NUMBER_SIZE = 0.3;
const NUMBER_MAX_WIDTH = 0.36;

type NumberSector = Readonly<{ turn: number | null; angle: number }>;

/** Waits for the number face so the first texture is not drawn in a fallback; a face that fails to load still draws. */
export function loadTurnNumberFont(): Promise<unknown> {
  if (typeof document === 'undefined' || !document.fonts) {
    return Promise.resolve();
  }
  return document.fonts.load(`100px "${TURN_NUMBER_FONT}"`, '0123456789').catch(() => undefined);
}

/**
 * Every printed turn on one square texture the size of the disc, each number centred on its own inked outline at the same distance from the hub.
 * Centring on the glyphs rather than on the font's line box keeps a 1 and a 10 on the same circle.
 */
export function createTurnNumbersTexture(sectors: readonly NumberSector[], numberRadius: number, color: string) {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D is required to print the turn wheel.');
  }
  const half = TEXTURE_SIZE / 2;
  const scale = Math.min(1, 10 / sectors.length);
  const size = half * NUMBER_SIZE * scale;
  const maxWidth = half * NUMBER_MAX_WIDTH * scale;
  context.fillStyle = color;
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  for (const { turn, angle } of sectors) {
    if (turn === null) {
      continue;
    }
    const text = String(turn);
    context.font = `${size}px "${TURN_NUMBER_FONT}", serif`;
    const measured = context.measureText(text);
    const width = measured.actualBoundingBoxRight + measured.actualBoundingBoxLeft;
    const fitted = width > maxWidth ? (size * maxWidth) / width : size;
    context.font = `${fitted}px "${TURN_NUMBER_FONT}", serif`;
    const ink = context.measureText(text);
    const x = half + Math.sin(angle) * half * numberRadius;
    const y = half - Math.cos(angle) * half * numberRadius;
    context.fillText(
      text,
      x - (ink.actualBoundingBoxRight - ink.actualBoundingBoxLeft) / 2,
      y + (ink.actualBoundingBoxAscent - ink.actualBoundingBoxDescent) / 2
    );
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}
