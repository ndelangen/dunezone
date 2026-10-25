/* A self-contained image lands inside the grace window, which is how a cached publication behaves. */

/* A self-contained image lands inside the grace window, which is how a cached publication behaves. */
export const decodedImage = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><circle cx="300" cy="300" r="300" fill="#4b4c0d"/><circle cx="300" cy="300" r="285" fill="none" stroke="#e3dbb3" stroke-width="8"/><text x="300" y="340" text-anchor="middle" font-family="serif" font-size="120" fill="#e3dbb3">AT</text></svg>')}`;

export function arrivalKeyframes(canvasElement: HTMLElement) {
  return canvasElement
    .getAnimations({ subtree: true })
    .flatMap((animation) => (animation.effect instanceof KeyframeEffect ? animation.effect.getKeyframes() : []));
}
