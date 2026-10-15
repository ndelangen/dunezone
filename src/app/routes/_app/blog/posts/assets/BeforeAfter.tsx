import { Slider } from '@mantine/core';
import { PublishedImage } from '@ui/content/PublishedImage';
import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import { WideFigure } from '../../postContent';
import styles from './BeforeAfter.module.css';

type Picture = Readonly<{ src: string; alt: string }>;

/**
 * Two pictures of the same subject laid over each other, with a slider that wipes from one to the other.
 * The `before` picture shows left of the line and the `after` picture right of it.
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
  const [split, setSplit] = useState(50);
  return (
    <WideFigure caption={caption}>
      <div className={styles.frame} style={{ '--split': `${split}%` } as CSSProperties}>
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
        value={split}
        onChange={setSplit}
        label={null}
      />
    </WideFigure>
  );
}
