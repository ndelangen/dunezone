import { Slider } from '@mantine/core';
import { PublishedImage } from '@ui/content/PublishedImage';
import { useReducer, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import { WideFigure } from '../../postContent';
import styles from './BeforeAfter.module.css';
import { useScrollDriven } from './scrollDriven';

type Picture = Readonly<{ src: string; alt: string }>;

type State = Readonly<{
  /** How much of the frame, in percent from the left, shows the `before` picture. */
  split: number;
  /** Once the reader moves the slider, scrolling stops moving the wipe. */
  readerHolds: boolean;
}>;

type Event = { type: 'scrolled'; split: number } | { type: 'slid'; split: number };

function reduce(state: State, event: Event): State {
  switch (event.type) {
    case 'scrolled':
      return state.readerHolds || Math.abs(event.split - state.split) < 0.1 ? state : { ...state, split: event.split };
    case 'slid':
      return { split: event.split, readerHolds: true };
  }
}

/**
 * Two pictures of the same subject laid over each other, wiped from one to the other.
 * The `before` picture shows left of the line and the `after` picture right of it.
 * The wipe moves from `before` to `after` as the reader scrolls past, and the slider hands that control to the reader.
 */
export function BeforeAfter({
  before,
  after,
  aspect,
  caption,
}: Readonly<{
  before: Picture;
  after: Picture;
  /** Height over width, shared by both pictures. */
  aspect: number;
  caption?: ReactNode;
}>) {
  const [{ split }, dispatch] = useReducer(reduce, { split: 100, readerHolds: false });
  const frame = useRef<HTMLDivElement>(null);
  useScrollDriven(frame, (played) => dispatch({ type: 'scrolled', split: 100 - played * 100 }));
  return (
    <WideFigure caption={caption}>
      <div ref={frame} className={styles.frame} style={{ '--split': `${split}%` } as CSSProperties}>
        <PublishedImage src={after.src} name={after.alt} aspect={aspect} radius="var(--mantine-radius-md)" raised />
        <div className={styles.before}>
          <PublishedImage
            src={before.src}
            name={before.alt}
            aspect={aspect}
            radius="var(--mantine-radius-md)"
            clipPath="inset(0 calc(100% - var(--split)) 0 0)"
          />
        </div>
        <div className={styles.line} aria-hidden />
      </div>
      <Slider
        className={styles.slider}
        thumbLabel="Wipe between the printed token and the cleaned-up portrait"
        value={Math.round(split)}
        onChange={(value) => dispatch({ type: 'slid', split: value })}
        label={null}
      />
    </WideFigure>
  );
}
