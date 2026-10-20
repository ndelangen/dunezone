import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

import './card-title.css';

type TitleMeasurement = {
  key: string;
  fontSize: number;
  naturalWidth: number;
  inkLeft: number;
};

/** Shared prototype title fitting in the card renderers' native 900-unit space. */
export function PrototypeCardTitle({
  name,
  width = 560,
  left = 95,
  top = 73,
  maxFontSize = 60,
}: {
  name: string;
  width?: number;
  left?: number;
  top?: number;
  maxFontSize?: number;
}) {
  const text = name.replace(/\s+/g, ' ').trim();
  const key = JSON.stringify([text, width, maxFontSize]);
  const [measured, setMeasured] = useState<TitleMeasurement | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const measurement = measured?.key === key ? measured : null;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const loaded = await document.fonts.load(`normal ${maxFontSize}px "C_Copperplate_Gothic"`, text || 'M');
      await document.fonts.ready;
      if (cancelled) return;
      // A missing font must not silently turn a fallback-font measurement into proof.
      if (!loaded.length) {
        setFailedKey(key);
        return;
      }
      const context = document.createElement('canvas').getContext('2d');
      if (!context) {
        setFailedKey(key);
        return;
      }
      context.font = `normal ${maxFontSize}px "C_Copperplate_Gothic"`;
      context.textAlign = 'left';
      context.textBaseline = 'alphabetic';
      const metrics = context.measureText(text);
      const inkLeft = Math.max(0, metrics.actualBoundingBoxLeft);
      const naturalWidth = Math.max(metrics.width, metrics.actualBoundingBoxRight) + inkLeft;
      const usableWidth = Math.max(0, width - 5);
      const fontSize =
        naturalWidth > 0 ? Math.min(maxFontSize, (usableWidth / naturalWidth) * maxFontSize) : maxFontSize;
      setMeasured({ key, fontSize, naturalWidth, inkLeft: (inkLeft * fontSize) / maxFontSize });
    })().catch(() => {
      if (!cancelled) setFailedKey(key);
    });
    return () => {
      cancelled = true;
    };
  }, [key, maxFontSize, text, width]);

  const style = {
    left,
    top,
    width,
    fontSize: measurement?.fontSize ?? maxFontSize,
    visibility: measurement ? 'visible' : 'hidden',
  } as CSSProperties;
  return (
    <div
      className="gf9-prototype-card-title"
      style={style}
      data-card-title-ready={Boolean(measurement)}
      data-card-title-error={failedKey === key ? 'font-or-canvas-unavailable' : undefined}
      data-header-name
      data-header-part="name"
      data-header-font-size={measurement?.fontSize}
      data-header-right-limit={left + width}
      data-name-natural-width={measurement?.naturalWidth}
      data-name-available-width={width}
    >
      <span data-header-line style={{ marginLeft: measurement?.inkLeft ?? 0 }}>
        {text}
      </span>
    </div>
  );
}
