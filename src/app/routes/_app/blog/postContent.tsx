import { resolveAsset } from '@shared/media/resolveAsset';
import { PublishedImage } from '@ui/content/PublishedImage';
import type { ReactNode } from 'react';

import styles from './postContent.module.css';

/*
 * The pieces a blog post is written in.
 * Headings and named panes are not among them: a post names its parts with the kit's `Section`, which owns the heading level, and puts an aside on the kit's `Card`.
 */

/*
 * `Lead` and `Paragraph` are paragraphs, so they take inline content only;
 * a figure or an embed goes between them, never inside.
 */

/** The opening paragraph, set larger than the rest. */
export function Lead({ children }: { children: ReactNode }) {
  return <p className={styles.lead}>{children}</p>;
}

export function Paragraph({ children }: { children: ReactNode }) {
  return <p className={styles.paragraph}>{children}</p>;
}

/**
 * An image from `media/`, served through the media pipeline, with an optional caption under it.
 * Blog images live under `web/`, whose small tier is 1080px wide, enough for the reading column on a high-density screen.
 */
export function Figure({
  imageKey,
  alt,
  aspect,
  caption,
}: {
  imageKey: string;
  alt: string;
  /** Height over width, held while the image loads. */
  aspect: number;
  caption?: string;
}) {
  const src = resolveAsset(imageKey, 'small');
  return (
    <figure className={styles.figure}>
      <PublishedImage src={src} name={alt} aspect={aspect} radius="var(--mantine-radius-md)" />
      {/* `PublishedImage` draws its image only once the browser runs, so readers and crawlers without scripts get it here. */}
      <noscript>
        <img src={src} alt={alt} className={styles.fallback} />
      </noscript>
      {caption ? <figcaption className={styles.caption}>{caption}</figcaption> : null}
    </figure>
  );
}

/** Live site artwork or components shown inside a post, centred, with a caption saying what it is. */
export function LiveEmbed({
  caption,
  width = '100%',
  children,
}: {
  caption: string;
  /** How wide the embed may grow, as a CSS width; `cqi` units measure the post's column. */
  width?: string;
  children: ReactNode;
}) {
  return (
    <figure className={styles.figure}>
      <div className={styles.stage}>
        <div style={{ width }}>{children}</div>
      </div>
      <figcaption className={styles.caption}>{caption}</figcaption>
    </figure>
  );
}
