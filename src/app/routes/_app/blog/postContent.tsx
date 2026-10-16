import { UnstyledButton } from '@mantine/core';
import { resolveAsset } from '@shared/media/resolveAsset';
import { PublishedImage } from '@ui/content/PublishedImage';
import { Play } from 'lucide-react';
import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import styles from './postContent.module.css';

/*
 * The pieces a blog post is written in.
 * Headings and named panes are not among them: a post names its parts with the kit's `Section`, which owns the heading level, and puts an aside on the kit's `Card`.
 */

/*
 * `Lead` and `Paragraph` are paragraphs, so they take inline content only;
 * a figure or an embed goes between them, never inside.
 */

/** The opening paragraph, set larger than the rest, with a drop cap and a small-caps first line. */
export function Lead({ children }: { children: ReactNode }) {
  return <p className={styles.lead}>{children}</p>;
}

export function Paragraph({ children }: { children: ReactNode }) {
  return <p className={styles.paragraph}>{children}</p>;
}

type FigureProps = Readonly<{
  imageKey: string;
  alt: string;
  /** Height over width, held while the image loads. */
  aspect: number;
  caption?: ReactNode;
}>;

/** A wide row whose column widths preserve each image's proportions at a shared height. */
export function FigureRow({ figures }: Readonly<{ figures: readonly FigureProps[] }>) {
  const columns = {
    '--figure-columns': figures.map(({ aspect }) => `minmax(0, ${1 / aspect}fr)`).join(' '),
  } as CSSProperties;

  return (
    <div className={styles.figureRow} style={columns}>
      {figures.map((figure) => (
        <Figure key={figure.imageKey} {...figure} />
      ))}
    </div>
  );
}

/**
 * An image from `media/`, served through the media pipeline, with an optional caption under it.
 * Blog images live under `web/`, whose small tier is 1080px wide, enough for the reading column on a high-density screen.
 */
export function Figure({ imageKey, alt, aspect, caption }: FigureProps) {
  const src = resolveAsset(imageKey, 'small');
  return (
    <figure className={styles.figure}>
      <PublishedImage src={src} name={alt} aspect={aspect} radius="var(--mantine-radius-md)" raised />
      {/* `PublishedImage` draws its image only once the browser runs, so readers and crawlers without scripts get it here. */}
      <noscript>
        <img src={src} alt={alt} className={styles.fallback} />
      </noscript>
      {caption ? <figcaption className={styles.caption}>{caption}</figcaption> : null}
    </figure>
  );
}

/** The play button goes away when pressed, so the player takes the focus and a keyboard reader keeps their place; one function for every render, so a re-render never moves the focus again. */
function focusOnMount(element: HTMLElement | null) {
  element?.focus();
}

/**
 * A YouTube video that loads nothing from YouTube until the reader asks for it.
 * Until then it shows a still frame from `media/`, so the page stays fast and no third party sees the visit;
 * pressing it swaps in the privacy-enhanced player, already playing.
 */
export function YouTube({
  id,
  title,
  posterKey,
  caption,
}: {
  /** The video's id, as in `youtube.com/watch?v=<id>`. */
  id: string;
  /** The video's own title, which names the player and the play button. */
  title: string;
  /** A 16:9 still frame from `media/`, shown before the reader presses play. */
  posterKey: string;
  caption?: ReactNode;
}) {
  const [playing, setPlaying] = useState(false);
  return (
    <figure className={styles.figure}>
      <div className={styles.video}>
        {playing ? (
          <iframe
            ref={focusOnMount}
            className={styles.player}
            src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1`}
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        ) : (
          <UnstyledButton className={styles.poster} onClick={() => setPlaying(true)} aria-label={`Play ${title}`}>
            <PublishedImage src={resolveAsset(posterKey, 'large')} name={title} aspect={9 / 16} />
            <span className={styles.play} aria-hidden>
              <Play size={28} fill="currentColor" />
            </span>
          </UnstyledButton>
        )}
      </div>
      {caption ? <figcaption className={styles.caption}>{caption}</figcaption> : null}
    </figure>
  );
}
