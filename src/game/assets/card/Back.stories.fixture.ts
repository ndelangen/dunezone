import { expect, waitFor } from 'storybook/test';

export async function verifyLabelPaint({ canvasElement }: { canvasElement: HTMLElement }) {
  await document.fonts.load('90px C_Busorama', 'STORM');
  const label = canvasElement.querySelector<SVGTextElement>('text')!.ownerSVGElement!;
  const glyphs = Array.from(label.querySelectorAll<SVGTextElement>('text'));
  const paints = Array.from(label.querySelectorAll<SVGRectElement>('rect[mask]'));
  await waitFor(async () => {
    for (const glyph of glyphs) {
      await expect(glyph.getComputedTextLength()).toBeLessThanOrEqual(680);
      await expect(Number.parseFloat(getComputedStyle(glyph).fontSize)).toBeLessThanOrEqual(90);
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
