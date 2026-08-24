import type { CSSProperties, PropsWithChildren } from 'react';

/**
 * Fits a fixed-size canvas, a game renderer drawing in card-space pixels, to the container's width: the frame keeps the canvas aspect and clips it while the canvas renders at native size and scales to fit, down in a rail and up in a wide mount, which stays crisp because the renderers are DOM and vector rather than raster.
 * The fit is CSS, not measurement: the frame is its own container, so `100cqw` is its width, and dividing that by the canvas width gives the scale directly.
 * Nothing here re-renders on resize, and the canvas is present on first paint rather than after a measurement lands.
 * The canvas is taken out of flow so the frame's height comes from its aspect ratio alone, never from the unscaled child it clips.
 * Pure placement;
 * the caller decorates the frame (shadow, anything bespoke) through `frameClassName`, and `rounded` is the one shared decoration: the corner treatment every rail proof wears (Norbert, 2026-08-21), kept here so five rails cannot drift apart.
 * The browser floor this technique sets is recorded on «Work the kit compliance wave» (#641).
 */
export function CanvasScale({
  canvasWidth,
  canvasHeight,
  frameClassName,
  rounded = false,
  children,
}: PropsWithChildren<{
  canvasWidth: number;
  canvasHeight: number;
  frameClassName?: string;
  rounded?: boolean;
}>) {
  return (
    <div
      className={frameClassName}
      style={
        {
          width: '100%',
          aspectRatio: `${canvasWidth} / ${canvasHeight}`,
          containerType: 'inline-size',
          position: 'relative',
          overflow: 'hidden',
          borderRadius: rounded ? 'var(--mantine-radius-md)' : undefined,
          '--canvas-width': `${canvasWidth}px`,
        } as CSSProperties
      }
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: canvasWidth,
          height: canvasHeight,
          transform: 'scale(calc(100cqw / var(--canvas-width)))',
          transformOrigin: 'top left',
          pointerEvents: 'none',
        }}
      >
        {children}
      </div>
    </div>
  );
}
