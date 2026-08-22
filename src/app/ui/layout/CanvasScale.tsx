import { useEffect, useState } from 'react';
import type { PropsWithChildren } from 'react';

/**
 * Fits a fixed-size canvas, a game renderer drawing in card-space pixels, to the container's width: the frame keeps the canvas aspect and clips it while the canvas renders at native size and scales to fit, down in a rail and up in a wide mount, which stays crisp because the renderers are DOM and vector rather than raster.
 * Pure placement;
 * the caller decorates the frame (shadow, anything bespoke) through `frameClassName`, and `rounded` is the one shared decoration: the corner treatment every rail proof wears (Norbert, 2026-08-21), kept here so five rails cannot drift apart.
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
  const [width, setWidth] = useState(0);
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!node) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return (
    <div ref={setNode} style={{ width: '100%' }}>
      {width > 0 && (
        <div
          className={frameClassName}
          style={{
            width,
            height: width * (canvasHeight / canvasWidth),
            position: 'relative',
            overflow: 'hidden',
            borderRadius: rounded ? 'var(--mantine-radius-md)' : undefined,
          }}
        >
          <div
            style={{
              width: canvasWidth,
              height: canvasHeight,
              transform: `scale(${width / canvasWidth})`,
              transformOrigin: 'top left',
              pointerEvents: 'none',
            }}
          >
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
