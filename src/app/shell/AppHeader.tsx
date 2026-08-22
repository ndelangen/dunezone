import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import { useMotionAllowed } from '../styles/motion';
import styles from './AppHeader.module.css';
import { SiteNavigation } from './SiteNavigation';

/*
 * The band video's first frame at 48px, inlined so the band paints before any network response.
 * Regenerate alongside the video:
 * ffmpeg -i public/video/band.mp4 -vframes 1 -vf scale=48:-2 -q:v 8 frame.jpg && base64 frame.jpg
 */
const bandPlaceholder =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAgAAHAAbAAD//gAPTGF2YzYwLjMuMTAwAP/bAEMACBAQExATFhYWFhYWGhgaGxsbGhoaGhsbGx0dHSIiIh0dHRsbHR0gICIiJSYlIyMiIyYmKCgoMDAuLjg4OkVFU//EAG0AAQEBAQEAAAAAAAAAAAAAAAYFAwQCAQEBAQEBAAAAAAAAAAAAAAABAgMFBBAAAgEDAgUDBAMBAAAAAAAAEQECAyEAEjFRgRORQbEUIgTRYUMy4fCCEQEBAQEBAAAAAAAAAAAAAAAAASEREv/AABEIABwAMAMBIgACEQADEQD/2gAMAwEAAhEDEQA/AOCmhCUXKSTtsmkiQLWzg9u0gd/KcrdxZ8MW6I2+I/35ObqjF7rvnK9PcCp9JqEtty/HMXXpleH1VWCil8oRLDSsOJT5Ym9rTA0oYMq0lSqCnJlbDYAppvj5T5Y9lDvp1erJS1RhHUUrjsk0OJxfWXUjEotbPwAthZp4Hppa1OSbsQhdcbprliechGE4aowSUgSo34E/bJpQaNXUdaEd0JNXyi2pfslzLHZrC0ZtZt1ZZFaEob/Y3/00swjR02+A/APrkHqz4566s+OGlcdGW6HZffM5P6iH8Kat51/1kfqyzLXNyOp28eMrQ//Z';

export interface AppHeaderProps {
  /** The route's content. Its `PageLayout` claims the same top row and sets the band's height. */
  children: ReactNode;
}

/**
 * The artwork band above every page, and the two-row frame it shares with the route's content.
 *
 * Chrome rather than a kit component, and the frame is the reason: `AppRoot` renders whatever the router hands it, so it cannot pass the band's height down, and `PageLayout` cannot report upward.
 * The two meet in CSS instead: the page joins this grid through `display: contents`, takes the `hero` row to overlay the band's lower edge, and declares which height it wants through `data-page-layout-*`, which the rules here read back.
 * Keeping the band and the frame in one file keeps both halves of that contract in one place;
 * the band element then stays mounted across navigations, so a height change animates instead of cutting.
 *
 * The artwork itself is a three-layer stack: an inlined blurred frame that costs no request, the sharp poster photograph over it, and the looping video fading in on top once it actually plays.
 * The video only mounts client-side after `prefers-reduced-motion` says motion is welcome, so reduced-motion visitors get the poster and never download the loop.
 * The `motion` cookie, `AppFooter`'s switch, overrides that OS hint for this site alone, live in both directions.
 */
export function AppHeader({ children }: AppHeaderProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);
  const motionOk = useMotionAllowed();

  // The video may already be playing (or fully buffered) before this render attaches `onPlaying`.
  useEffect(() => {
    if (!motionOk) {
      setVideoReady(false);
      return;
    }
    const video = videoRef.current;
    if (video && !video.paused && video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      setVideoReady(true);
    }
  }, [motionOk]);

  return (
    <div className={styles.frame}>
      <header className={styles.band}>
        <img alt="" aria-hidden className={styles.bandPlaceholder} src={bandPlaceholder} />
        <img alt="" aria-hidden className={styles.bandPoster} src="/video/band-poster.jpg" />
        {motionOk && (
          <video
            ref={videoRef}
            className={styles.bandVideo}
            data-ready={videoReady || undefined}
            onPlaying={() => setVideoReady(true)}
            src="/video/band.mp4"
            autoPlay
            muted
            loop
            playsInline
            aria-hidden
            tabIndex={-1}
          />
        )}
        <SiteNavigation />
      </header>
      {children}
    </div>
  );
}
