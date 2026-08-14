import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import styles from './AppHeader.module.css';
import { SiteNavigation } from './SiteNavigation';

/*
 * PROTOTYPE — a 48px frame of the band video, inlined so it renders from the HTML itself with zero
 * network round-trips. It sits blurred under the video, which fades in over it once playing.
 */
const videoPlaceholder =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAgAAHAAbAAD//gAPTGF2YzYwLjMuMTAwAP/bAEMACBAQExATFhYWFhYWGhgaGxsbGhoaGhsbGx0dHSIiIh0dHRsbHR0gICIiJSYlIyMiIyYmKCgoMDAuLjg4OkVFU//EAG0AAQEBAQEAAAAAAAAAAAAAAAYFAwQCAQEBAQEBAAAAAAAAAAAAAAABAgMFBBAAAgEDAgUDBAMBAAAAAAAAEQECAyEAEjFRgRORQbEUIgTRYUMy4fCCEQEBAQEBAAAAAAAAAAAAAAAAASEREv/AABEIABwAMAMBIgACEQADEQD/2gAMAwEAAhEDEQA/AOCmhCUXKSTtsmkiQLWzg9u0gd/KcrdxZ8MW6I2+I/35ObqjF7rvnK9PcCp9JqEtty/HMXXpleH1VWCil8oRLDSsOJT5Ym9rTA0oYMq0lSqCnJlbDYAppvj5T5Y9lDvp1erJS1RhHUUrjsk0OJxfWXUjEotbPwAthZp4Hppa1OSbsQhdcbprliechGE4aowSUgSo34E/bJpQaNXUdaEd0JNXyi2pfslzLHZrC0ZtZt1ZZFaEob/Y3/00swjR02+A/APrkHqz4566s+OGlcdGW6HZffM5P6iH8Kat51/1kfqyzLXNyOp28eMrQ//Z';

export interface AppHeaderProps {
  /** The route's content. Its `PageLayout` claims the same top row and sets the band's height. */
  children: ReactNode;
}

/**
 * The artwork band above every page, and the two-row frame it shares with the route's content.
 *
 * Chrome rather than a kit component, and the frame is the reason: `AppRoot` renders whatever the
 * router hands it, so it cannot pass the band's height down, and `PageLayout` cannot report upward.
 * The two meet in CSS instead — the page joins this grid through `display: contents`, takes the
 * `hero` row to overlay the band's lower edge, and declares which height it wants through
 * `data-page-layout-*`, which the rules here read back. Keeping the band and the frame in one file
 * keeps both halves of that contract in one place; the band element then stays mounted across
 * navigations, so a height change animates instead of cutting.
 */
export function AppHeader({ children }: AppHeaderProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);

  // PROTOTYPE — the video may already be playing before hydration attaches the listener below.
  useEffect(() => {
    const video = videoRef.current;
    if (video && video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      setVideoReady(true);
    }
  }, []);

  return (
    <div className={styles.frame}>
      <header className={styles.band}>
        {/* PROTOTYPE — blur-up placeholder, then the looping video fades in over it */}
        <img alt="" aria-hidden className={styles.videoPoster} src={videoPlaceholder} />
        <video
          ref={videoRef}
          className={styles.video}
          data-ready={videoReady || undefined}
          onPlaying={() => setVideoReady(true)}
          src="/prototype/dunebg2.mp4"
          autoPlay
          muted
          loop
          playsInline
          aria-hidden
        />
        <SiteNavigation />
      </header>
      {children}
    </div>
  );
}
