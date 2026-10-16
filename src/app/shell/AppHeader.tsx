import type { ReactNode, RefObject } from 'react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

/* File imports give the build hashed URLs while preserving the legacy /video/ paths for older bundles. */
import bandPoster from '../../../public/video/band-poster.jpg?url';
import bandVideo from '../../../public/video/band.mp4?url';
import { useMotionAllowed } from '../styles/motion';
import styles from './AppHeader.module.css';
import { SiteNavigation } from './SiteNavigation';

/*
 * The band video's first frame at 48px, inlined so the band paints before any network response.
 * Regenerate alongside the video:
 * ffmpeg -i public/video/band.mp4 -vframes 1 -vf scale=48:-2 -q:v 8 frame.jpg && base64 frame.jpg
 */
const bandPlaceholder =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAgAAHAAbAAD//gAQTGF2YzYwLjMxLjEwMgD/2wBDAAgQEBMQExYWFhYWFhoYGhsbGxoaGhobGxsdHR0iIiIdHR0bGx0dICAiIiUmJSMjIiMmJigoKDAwLi44ODpFRVP/xABwAAEBAQEBAAAAAAAAAAAAAAAGBQMEAgEAAwEBAQAAAAAAAAAAAAAAAAECAwUEEAABAwIEBAUFAQAAAAAAAAABAgARAyFBMVESkROBIrFhMkME0eGhFPCSEQEBAQEBAQAAAAAAAAAAAAAAEQESUSH/wAARCAAcADADASIAAhEAAxEA/9oADAMBAAIRAxEAPwDgpiEKSVKANsgQBMxFrPgNAgROeIKrcYsdGt2Jt2xh/TL3FFJw4vldPcChRpEIVlnJw6xceDro+VVQEgdyEyYIBiNZBto0v6tOCNohjatIUqkU1GRlGURIIJ1xSejq0KFOrzVA70oTukC8cACI1lr6wNRKARJGR8oGUWIYamBvC1Am0wIuNbgjo1C1QlC0bkoAComQm+kz9HOhBo1d07xCcxCiL9XQJCvcV1kxwIZZKyHtzVPPWpLBPuH/AEQHgmjtt2R5RPi4PNXq/XNXq199C6aKsxH4y4vJR+Qj0UxbHf8AZx+arV5b1lU7jbDB1lJ//9k=';

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
 * It also waits for the band to take up space: a fullscreen page hides the band, and a hidden autoplay video still downloads its whole megabyte.
 * The `motion` cookie, `AppFooter`'s switch, overrides that OS hint for this site alone, live in both directions.
 */
export function AppHeader({ children }: AppHeaderProps) {
  const bandRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);
  const motionOk = useMotionAllowed();
  const bandShown = useShown(bandRef);
  const playVideo = motionOk && bandShown;
  const frameRef = useRef<HTMLDivElement>(null);
  useUnwindAfterImmersion(frameRef);
  useFrameLeft(frameRef);

  if (!playVideo && videoReady) {
    setVideoReady(false);
  }

  // The video may already be playing (or fully buffered) before this render attaches `onPlaying`.
  useEffect(() => {
    if (!playVideo) {
      return;
    }
    const video = videoRef.current;
    if (video) {
      setVideoReady(!video.paused && video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA);
    }
  }, [playVideo]);

  return (
    <div ref={frameRef} className={styles.frame}>
      {/* Artwork and site navigation, not the banner: the page's own header is that landmark (see PageLayout). */}
      <div ref={bandRef} className={styles.band} data-app-band>
        <img alt="" aria-hidden className={styles.bandPlaceholder} src={bandPlaceholder} />
        <img alt="" aria-hidden className={styles.bandPoster} src={bandPoster} />
        {playVideo && (
          <video
            ref={videoRef}
            className={styles.bandVideo}
            data-ready={videoReady || undefined}
            onPlaying={() => setVideoReady(true)}
            src={bandVideo}
            autoPlay
            muted
            loop
            playsInline
            aria-hidden
            tabIndex={-1}
          />
        )}
        <SiteNavigation />
      </div>
      {children}
    </div>
  );
}

/* Publishes the frame's distance from the window's left edge as `--app-frame-left`, for the immersive band to bleed back to the edge. */
function useFrameLeft(frameRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof ResizeObserver === 'undefined') {
      return;
    }
    const measure = () => {
      const left = frame.getBoundingClientRect().left + window.scrollX;
      frame.style.setProperty('--app-frame-left', `${left}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.documentElement);
    observer.observe(frame);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [frameRef]);
}

/* How long the band takes to shrink back from an immersive page; matches the immersive transition in AppHeader.module.css. */
const UNWIND_MS = 700;

/*
 * Marks the frame while the band shrinks back from an immersive page, so the shrink keeps the growth's slow curve instead of the everyday 0.2s.
 * The page cannot report upward (see the component's comment) and the router swaps pages without rendering this component, so it watches the page's declaration in the DOM instead.
 */
function useUnwindAfterImmersion(frameRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof MutationObserver === 'undefined') {
      return;
    }
    const isImmersive = () => frame.querySelector('[data-page-layout-header-size="immersive"]') !== null;
    let wasImmersive = isImmersive();
    let timer: number | undefined;
    const observer = new MutationObserver(() => {
      const immersive = isImmersive();
      if (wasImmersive && !immersive) {
        frame.setAttribute('data-band-unwinding', '');
        window.clearTimeout(timer);
        timer = window.setTimeout(() => frame.removeAttribute('data-band-unwinding'), UNWIND_MS);
      }
      wasImmersive = immersive;
    });
    observer.observe(frame, { subtree: true, childList: true, attributeFilter: ['data-page-layout-header-size'] });
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [frameRef]);
}

/* Whether the element has a box: `display: none` reports an empty one, and showing it again reports its size. */
function useShown(ref: RefObject<HTMLElement | null>): boolean {
  const [shown, setShown] = useState(false);
  const noObserver = useSyncExternalStore(
    noSubscription,
    () => typeof ResizeObserver === 'undefined',
    () => false
  );
  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      setShown(entry.contentRect.width > 0 && entry.contentRect.height > 0);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return shown || noObserver;
}

const noSubscription = () => () => undefined;
