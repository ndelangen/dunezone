/**
 * Inline SVG fixtures for unit tests. Geometry is kept simple so the
 * test-time getBBox polyfill produces exact, predictable boxes.
 */

/** Content sits at x:20 y:30 w:30 h:20 inside a loose 100x100 viewBox. */
export const looseViewBox = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <rect x="20" y="30" width="30" height="20" fill="black" />
</svg>`;

/** Two rects spanning x:10..70 y:10..50 -> content box 10,10,60,40. */
export const multiShape = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <rect x="10" y="10" width="20" height="20" fill="red" />
  <rect x="50" y="30" width="20" height="20" fill="blue" />
</svg>`;

/** Wide content: 80 x 20 -> aspect ratio 4. */
export const wide = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect x="10" y="40" width="80" height="20" fill="black" />
</svg>`;

/** Tall content: 20 x 80 -> aspect ratio 0.25. */
export const tall = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect x="40" y="10" width="20" height="80" fill="black" />
</svg>`;

/** Square content: 40 x 40. */
export const square = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect x="30" y="30" width="40" height="40" fill="black" />
</svg>`;

/**
 * Simulates a bitmap-tracer export: many collinear points along straight edges
 * plus excessive decimal precision. A light optimize should collapse the
 * collinear runs and round the coordinates.
 */
export const dirtyTraced = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10.000001 10.000002 L20.000003 10.000001 L30.000002 10.000004 L40.000001 10.000002 L50.000003 10.000001 L50.000002 30.000004 L50.000001 50.000002 L30.000003 50.000001 L10.000002 50.000004 L10.000001 30.000002 Z" fill="#222"/></svg>`;

export const invalid = `<svg xmlns="http://www.w3.org/2000/svg"><rect x="1"`;
