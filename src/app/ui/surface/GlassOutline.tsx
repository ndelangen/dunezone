import { useId } from 'react';

import styles from './GlassOutline.module.css';

export interface GlassOutlineGeometry {
  width: number;
  height: number;
  path: string;
}

/**
 * Whether a fresh measurement says anything new.
 * Observers fire on every frame of a resize, and most of those frames land on the same rounded pixels;
 * keeping the old object keeps the outline from re-rendering for a measurement that did not move.
 */
export function isSameGeometry(current: GlassOutlineGeometry | null, next: GlassOutlineGeometry) {
  return current?.width === next.width && current.height === next.height && current.path === next.path;
}

/**
 * The glass pane drawn along one measured outline, for the tab components whose pane joins a tab to its panel.
 * Callers own the path, the positioned layer it fills and `--glass-outline-fill`;
 * this owns the clip, the outside shadow, the blurred glass and the contour.
 */
export function GlassOutline({ geometry }: { geometry: GlassOutlineGeometry | null }) {
  const instanceId = useId().replaceAll(':', '');
  if (!geometry) {
    return null;
  }
  const clipId = `glass-outline-clip-${instanceId}`;
  const shadowId = `glass-outline-shadow-${instanceId}`;
  const viewBox = `0 0 ${geometry.width} ${geometry.height}`;

  return (
    <>
      <svg className={styles.definitions} width="0" height="0" aria-hidden="true" focusable="false">
        <defs>
          <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
            <path d={geometry.path} />
          </clipPath>
          <filter id={shadowId} x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceAlpha" stdDeviation="10" result="shadowBlur" />
            <feComposite in="shadowBlur" in2="SourceAlpha" operator="out" result="outsideShadowAlpha" />
            <feFlood floodColor="#000000" floodOpacity="0.165" result="shadowColor" />
            <feComposite in="shadowColor" in2="outsideShadowAlpha" operator="in" result="shadow" />
          </filter>
        </defs>
      </svg>
      <svg
        className={styles.geometryShadow}
        viewBox={viewBox}
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <path d={geometry.path} filter={`url(#${shadowId})`} />
      </svg>
      <div className={styles.glassSurface} style={{ clipPath: `url(#${clipId})` }} />
      <svg
        className={styles.geometryContour}
        viewBox={viewBox}
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <path d={geometry.path} />
      </svg>
    </>
  );
}
