import { Anchor } from '@mantine/core';
import { ExternalLink } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

import styles from './TutorialEmbed.module.css';

/*
 * A tutorial page, live inside a post: the real same-origin page in a frame, as a reader meets it at its own address (Norbert, 2026-11-07: show the real thing, not a picture of it).
 * The page carries a 3D table, so the frame is filled only while the reader is near it and emptied again once they are well past it, and a post with several embeds runs about one table at a time.
 * Until then, and on the server, the frame is the same size and dark, with one line saying the table is on its way; no still stands in for the page.
 * The table takes the wheel and the keys only while the pointer or the focus is inside it, so the post scrolls past as usual.
 * A link under the frame opens the same page on its own, in a new tab.
 *
 * `src` is a same-origin path, query included (`/tutorial/mentat-recall?step=7`), and `title` names the frame for assistive technology.
 * The caption belongs to the `WideFigure` the embed sits in.
 */
export function TutorialEmbed({ src, title }: Readonly<{ src: string; title: string }>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const near = useNear(rootRef);
  return (
    <div className={styles.embed}>
      <div ref={rootRef} className={styles.window}>
        {near ? (
          <iframe className={styles.page} src={src} title={title} />
        ) : (
          <p className={styles.waiting}>Loading the table...</p>
        )}
      </div>
      <Anchor href={src} target="_blank" rel="noopener" className={styles.open}>
        Open full screen
        <ExternalLink aria-hidden size={14} />
      </Anchor>
    </div>
  );
}

/* How close the reader has to be for the page to load: within about a screen of the frame. */
const LOAD_WITHIN = '400px 0px';
/* How far they have to be for it to unload: more than a screen and a half past it, so reading the paragraph under a frame never restarts its chapter. */
const UNLOAD_BEYOND = '150% 0px';

/*
 * Whether the reader is near the frame, with room between the two edges so the frame does not fill and empty as they linger around one of them.
 * The frame starts empty, so the server and the first paint draw the dark frame, and a browser without the observer keeps it that way with the link under it as the way in.
 */
function useNear(rootRef: RefObject<HTMLElement | null>) {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') {
      return;
    }
    const arriving = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setNear(true);
        }
      },
      { rootMargin: LOAD_WITHIN }
    );
    const leaving = new IntersectionObserver(
      ([entry]) => {
        if (entry && !entry.isIntersecting) {
          setNear(false);
        }
      },
      { rootMargin: UNLOAD_BEYOND }
    );
    arriving.observe(root);
    leaving.observe(root);
    return () => {
      arriving.disconnect();
      leaving.disconnect();
    };
  }, [rootRef]);
  return near;
}
