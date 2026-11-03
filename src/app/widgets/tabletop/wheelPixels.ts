/*
 * Kept apart from the camera maths, so code that only reads the wheel (the tutorial's zoom task) does not pull three.js in with it.
 */

const WHEEL_LINE_PX = 16;
const WHEEL_PAGE_PX = 400;

/* A wheel turn in pixels, whether the browser counts it in pixels, lines or pages; an unreadable turn is none. */
export function wheelPixels(deltaY: number, deltaMode: number): number {
  const pixels = deltaY * (deltaMode === 1 ? WHEEL_LINE_PX : deltaMode === 2 ? WHEEL_PAGE_PX : 1);
  return Number.isFinite(pixels) ? pixels : 0;
}

/*
 * How much a wheel turn of `pixels` zooms in, as a factor: scrolling up (negative pixels) zooms in and scrolling down zooms out,
 * the same way over the table, a close-up and the private side-table (Norbert, 2026-11-03).
 * `pixelsPerE` is the scroll distance that zooms e times.
 */
export function wheelZoomFactor(pixels: number, pixelsPerE: number): number {
  return Math.exp(-pixels / pixelsPerE);
}
