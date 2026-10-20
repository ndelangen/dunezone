import { useCallback, useRef } from 'react';
import type { HTMLAttributes } from 'react';

import { fitCardTitle, singleLineTitle, useCardTitleFit } from './cardTitleFit';

type Props = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  text: string;
  baseSize?: number;
};

/** Keeps the complete title at the existing baseline, reducing only its type size. */
export function CardTitle({ text, baseSize = 60, style, ...props }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const fit = useCallback(
    (element: HTMLDivElement) => {
      const span = element.firstElementChild as HTMLSpanElement;
      const css = getComputedStyle(element);
      const width = element.clientWidth;
      const height = element.clientHeight;
      if (width <= 0 || height <= 0) {
        return;
      }
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d')!;
      const lineHeight = Number.parseFloat(css.lineHeight) || height;
      const apply = (size: number) => {
        span.style.fontSize = `${size}px`;
        context.font = `${css.fontStyle} ${css.fontWeight} ${size}px ${css.fontFamily}`;
        context.letterSpacing = css.letterSpacing === 'normal' ? '0px' : css.letterSpacing;
        context.fontKerning = css.fontKerning as CanvasFontKerning;
        return context.measureText(span.innerText);
      };
      const base = apply(baseSize);
      const baseline = (lineHeight + base.fontBoundingBoxAscent - base.fontBoundingBoxDescent) / 2;
      const measure = (size: number) => {
        const metrics = apply(size);
        const inset = Math.max(0, metrics.actualBoundingBoxLeft);
        span.style.left = `${inset}px`;
        span.style.top = `${baseline - (lineHeight + metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent) / 2}px`;
        // Layout measures the applied CSS, including shaping, word spacing and text transforms.
        // Divide by the parent's scale, so a catalogue preview never changes the printed fit.
        const scale = element.getBoundingClientRect().width / width;
        const advance = span.getBoundingClientRect().width / (scale || 1);
        return {
          width: Math.max(advance, metrics.actualBoundingBoxRight) + inset,
          height:
            Math.max(
              baseline > 0 ? metrics.actualBoundingBoxAscent / baseline : 1,
              height > baseline ? metrics.actualBoundingBoxDescent / (height - baseline) : 1
            ) * height,
        };
      };
      fitCardTitle(baseSize, width, height, measure);
    },
    [baseSize]
  );
  useCardTitleFit(ref, fit);
  return (
    <div {...props} ref={ref} aria-label={text} style={{ ...style, fontSize: baseSize, overflow: 'visible' }}>
      <span
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          display: 'inline-block',
          width: 'max-content',
          whiteSpace: 'pre',
        }}
      >
        {singleLineTitle(text)}
      </span>
    </div>
  );
}
