import { publishedImageRetryDelayMs } from '@shared/asset-publishing/publishedRetry';
import { publishedCopyWidth, publishedThumbnailSrc } from '@shared/asset-publishing/publishedThumbnail';
import clsx from 'clsx';
import { ImageOff } from 'lucide-react';
import { useEffect, useLayoutEffect, useReducer, useRef, useSyncExternalStore } from 'react';
import type { CSSProperties } from 'react';

import { useMotionAllowed } from '@app/styles/motion';

import { decodedFrom, joinArrival, markDecoded, requestArrivalAnimation, requestOrder } from './imageArrival';
import styles from './PublishedImage.module.css';

/** How long an image in fetch range draws nothing, so one the browser already holds appears at once instead of replacing a slot. */
const GRACE_MS = 90;

/** How far outside the viewport an image starts fetching, so most have landed before the reader scrolls to them. */
const FETCH_MARGIN_PX = 1600;

/** A failed publication is tried again on the shared schedule, as the table's faces are, and after the last try it stays missing until the page reloads. */
export const PUBLISHED_IMAGE_RETRIES = 6;

type Props = {
  /** The publication, or null when there is none, which draws the missing state. */
  src: string | null;
  /** The image's alt text, and the words the missing state prints where there is room. */
  name: string;
  /** Height over width, held from the first paint so nothing shifts when the image lands. */
  aspect: number;
  /** The outline's corner, as a CSS border radius. */
  radius?: string;
  /** An outline a radius cannot draw, as a CSS clip path. */
  clipPath?: string;
  /** Whether the image wears a raised frame's shadow, which arrives with it rather than ahead of it. A clipped outline wears it as a drop shadow, which the clip cannot cut. */
  raised?: boolean;
  /**
   * Whether this is the page's main image, which is written into the server-rendered HTML, fetched first and shown as it lands, with no arrival.
   * It then paints without waiting for scripts, and is what image search finds on the page.
   */
  priority?: boolean;
  /**
   * Whether it draws the full capture rather than a copy sized to its box, for an image the reader zooms past its box, such as the Alt close-up.
   * A smaller copy already decoded is shown until the capture has loaded.
   */
  full?: boolean;
};

/**
 * One published image, arriving gracefully.
 * Callers own which publication it shows and the outline it is cut to;
 * this owns the arrival: a clear slot while it loads, the develop when it lands, and a matte missing state that never looks like loading.
 * A publication that fails is fetched again out of sight a few times, so a passing outage does not leave it missing.
 *
 * It fills the width it is given at `aspect`, and fetches nothing but `src`.
 */
export function PublishedImage(props: Props) {
  /* A new src, or a full image in place of a sized one, is a new image with its own arrival, so it starts from a fresh state and a fresh img element. */
  return <Arrival key={`${props.full ? 'full:' : ''}${props.src ?? ''}`} {...props} />;
}

type Phase = 'loading' | 'decoded' | 'ready' | 'arriving' | 'shown' | 'missing';

type State = {
  phase: Phase;
  /** Whether landing animates; an image decoded before, or landing inside the grace window, appears at once. */
  arrival: 'animate' | 'instant';
  /** Whether the img element carries its src, which it does once the tile is in fetch range. */
  fetching: boolean;
  /** The URL the img element draws: `src`, or a resized copy of it sized to the tile when the tile entered fetch range. */
  drawn: string | null;
  /** Whether the loading slot is drawn, which waits out the grace window. */
  slot: boolean;
  order: number | null;
  /** The smaller copy a sharpened tile drew before, drawn again should the sharper one fail in the tile. */
  fallback: string | null;
};

type Action =
  | { type: 'ordered'; order: number }
  | { type: 'inRange'; drawn: string }
  | { type: 'graceOver' }
  | { type: 'decoded' }
  | { type: 'revealed' }
  | { type: 'started'; animate: boolean }
  | { type: 'finished' }
  | { type: 'failed' }
  | { type: 'recovered' }
  | { type: 'sharpened'; drawn: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ordered':
      return { ...state, order: action.order };
    case 'inRange':
      return { ...state, fetching: true, drawn: action.drawn };
    case 'graceOver':
      return state.phase === 'loading' ? { ...state, slot: true } : state;
    case 'decoded':
      if (state.phase !== 'loading') {
        return state;
      }
      /* Nothing was drawn yet, so there is nothing to arrive from. */
      return state.slot ? { ...state, phase: 'decoded' } : { ...state, phase: 'shown', arrival: 'instant' };
    case 'revealed':
      return state.phase === 'decoded' ? { ...state, phase: 'ready' } : state;
    case 'started':
      return state.phase === 'ready' ? { ...state, phase: action.animate ? 'arriving' : 'shown' } : state;
    case 'finished':
      return state.phase === 'arriving' ? { ...state, phase: 'shown', slot: false } : state;
    case 'sharpened':
      return { ...state, drawn: action.drawn, fallback: state.drawn };
    case 'failed':
      /* A sharper copy that fails in the tile gives way to the smaller one it replaced, which was already drawn. */
      return state.fallback
        ? { ...state, drawn: state.fallback, fallback: null }
        : { ...state, phase: 'missing', fetching: false };
    case 'recovered':
      /* The bytes were just fetched, so the image replaces the missing state at once when the browser still holds them. */
      return state.phase === 'missing'
        ? { ...state, phase: 'loading', fetching: true, slot: false, order: null }
        : state;
  }
}

function initialState(src: string | null, priority: boolean): State {
  const base = { arrival: 'animate', fetching: false, drawn: src, slot: false, order: null, fallback: null } as const;
  if (src === null) {
    return { ...base, phase: 'missing' };
  }
  /* The server writes a main image's src and shows it, so the client's first render must hold the same. */
  if (priority) {
    return { ...base, phase: 'shown', arrival: 'instant', fetching: true };
  }
  /* An image decoded before fetches at once, and is shown before the first paint if the browser still holds it. */
  const drawn = decodedFrom(src);
  if (drawn !== undefined) {
    return { ...base, phase: 'loading', fetching: true, drawn };
  }
  return { ...base, phase: 'loading' };
}

/** True while rendering on the server or hydrating its HTML, and false for anything the client mounts afterwards. */
const subscribeToNothing = () => () => {};
const clientSnapshot = () => false;
const serverSnapshot = () => true;

/** What an image the browser has finished with settles to: a broken one has failed, and a drawn one is decoded unless it already moved on. */
function completeImageAction(img: HTMLImageElement, phase: Phase): Action | null {
  if (img.naturalWidth === 0) {
    return phase === 'loading' || phase === 'shown' ? { type: 'failed' } : null;
  }
  return phase === 'loading' ? { type: 'decoded' } : null;
}

/** The URL a tile draws from: the capture itself when it is full, otherwise the smallest copy that covers its device pixels. */
function neededCopy(src: string, root: HTMLElement, full: boolean) {
  return full ? src : publishedThumbnailSrc(src, root.getBoundingClientRect().width * window.devicePixelRatio);
}

function inFetchRange(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return rect.bottom >= -FETCH_MARGIN_PX && rect.top <= window.innerHeight + FETCH_MARGIN_PX;
}

function Arrival({ src, name, aspect, radius, clipPath, raised = false, priority = false, full = false }: Props) {
  /* Only a server-rendered main image starts shown; one mounted later, by navigation or a new src, arrives like any other. */
  const serverRendered = useSyncExternalStore(subscribeToNothing, clientSnapshot, serverSnapshot);
  const [state, dispatch] = useReducer(reducer, src, (initial) => initialState(initial, priority && serverRendered));
  const motion = useMotionAllowed();
  const rootRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const artRef = useRef<HTMLDivElement>(null);
  const releaseAnimationRef = useRef<(() => void) | null>(null);
  const arrivalRef = useRef<ReturnType<typeof joinArrival> | null>(null);
  const retriesRef = useRef(0);
  /* The probe that recovered the publication, held until the tile's own image settles, so the browser keeps its bytes for it. */
  const probeRef = useRef<HTMLImageElement | null>(null);
  const { phase, fetching, order, drawn } = state;
  const waiting = phase === 'loading' || phase === 'decoded' || phase === 'ready';

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || phase !== 'loading') {
      return;
    }
    return requestOrder(root, (assigned) => dispatch({ type: 'ordered', order: assigned }));
  }, [phase]);

  /* Checked inside the layout pass, so a tile already on screen starts fetching before the first paint. */
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || phase !== 'loading' || fetching) {
      return;
    }
    /* Measured as the tile enters fetch range, so a 40px avatar asks for a small copy rather than the full capture. */
    const inRange = () =>
      dispatch({
        type: 'inRange',
        drawn: neededCopy(src!, root, full),
      });
    if (inFetchRange(root)) {
      inRange();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          inRange();
        }
      },
      { rootMargin: `${FETCH_MARGIN_PX}px 0px` }
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, [fetching, full, phase, src]);

  /*
   * An image shown at once from a smaller copy another tile decoded, such as the hand's copy of a card held up close, stays on screen while the copy its own tile needs loads out of sight, and is swapped for it once decoded.
   * A copy that fails to load leaves the smaller one in place.
   */
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !src || !drawn || phase !== 'shown') {
      return;
    }
    /* A tile with no width yet, as in a closed panel, needs nothing more. */
    if (!full && root.getBoundingClientRect().width === 0) {
      return;
    }
    const needed = neededCopy(src, root, full);
    if (publishedCopyWidth(needed) <= publishedCopyWidth(drawn)) {
      return;
    }
    let cancelled = false;
    const image = new Image();
    image.src = needed;
    void image
      .decode()
      .catch(() => undefined)
      .then(() => {
        if (!cancelled && image.naturalWidth > 0) {
          markDecoded(src, needed);
          dispatch({ type: 'sharpened', drawn: needed });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [drawn, full, phase, src]);

  /*
   * An image the browser already holds is complete the moment it gets its src, so it is shown before the first paint.
   * A server-rendered main image may have failed before hydration, whose error event nothing heard, so that is settled here too.
   */
  useLayoutEffect(() => {
    const img = imgRef.current;
    const settled = fetching && src && img?.complete ? completeImageAction(img, phase) : null;
    if (settled?.type === 'decoded') {
      markDecoded(src!, drawn ?? src!);
    }
    if (settled) {
      dispatch(settled);
    }
  }, [drawn, fetching, phase, src]);

  useEffect(() => {
    if (!fetching || phase !== 'loading' || state.slot) {
      return;
    }
    const timer = setTimeout(() => {
      /* Bytes already here are a cache hit whose decode is still running, so wait for it rather than flash a slot. */
      const img = imgRef.current;
      if (!(img?.complete && img.naturalWidth > 0)) {
        dispatch({ type: 'graceOver' });
      }
    }, GRACE_MS);
    return () => clearTimeout(timer);
  }, [fetching, phase, state.slot]);

  /* Only an image in flight holds back the ones after it, and only until it lands or goes. */
  useEffect(() => {
    if (!fetching || !waiting || order === null) {
      return;
    }
    const arrival = joinArrival(order);
    arrivalRef.current = arrival;
    return () => {
      arrival.leave();
      arrivalRef.current = null;
    };
  }, [fetching, order, waiting]);

  /* Offscreen images arrive still; visible images share the page's animation budget. */
  useLayoutEffect(() => {
    if (phase === 'ready') {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect || rect.bottom <= 0 || rect.top >= window.innerHeight) {
        dispatch({ type: 'started', animate: false });
      } else {
        releaseAnimationRef.current = requestArrivalAnimation((animate) => dispatch({ type: 'started', animate }));
      }
    } else if (phase === 'shown' || phase === 'missing') {
      releaseAnimationRef.current?.();
      releaseAnimationRef.current = null;
    }
  }, [phase]);

  useLayoutEffect(() => () => releaseAnimationRef.current?.(), []);

  /* Cancellation also settles the image, so a removed animation cannot strand a pool slot. */
  useEffect(() => {
    if (phase !== 'arriving') {
      return;
    }
    let cancelled = false;
    void Promise.allSettled(artRef.current?.getAnimations().map((animation) => animation.finished) ?? []).then(() => {
      if (!cancelled) {
        dispatch({ type: 'finished' });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [phase]);

  /* A failure may be a passing outage, so the publication is fetched again out of sight, and the missing state stays until its bytes are here. */
  useEffect(() => {
    if (phase !== 'missing' || src === null) {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const schedule = () => {
      if (retriesRef.current < PUBLISHED_IMAGE_RETRIES) {
        timer = setTimeout(probe, publishedImageRetryDelayMs(retriesRef.current));
      }
    };
    /* A retry is charged when it fetches, so one cancelled while it waits costs nothing. */
    const probe = () => {
      retriesRef.current += 1;
      const image = new Image();
      image.src = drawn ?? src;
      /* Judged as onLoad judges the tile's own image: pixels present count, whatever decode() says. */
      void image
        .decode()
        .catch(() => undefined)
        .then(() => {
          if (cancelled) {
            return;
          }
          if (image.naturalWidth > 0) {
            probeRef.current = image;
            dispatch({ type: 'recovered' });
          } else {
            schedule();
          }
        });
    };
    schedule();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [drawn, phase, src]);

  const onLoad = () => {
    const img = imgRef.current;
    if (!img || !src) {
      return;
    }
    /* decode() settles once the pixels are ready to paint, so the first frame of the arrival already holds the image. */
    void img
      .decode()
      .catch(() => undefined)
      .then(() => {
        probeRef.current = null;
        if (img.naturalWidth === 0) {
          dispatch({ type: 'failed' });
          return;
        }
        markDecoded(src, drawn ?? src);
        dispatch({ type: 'decoded' });
        /* An image that drew a slot waits its turn; one that drew nothing is already shown, and the reveal changes nothing. */
        const reveal = () => dispatch({ type: 'revealed' });
        if (arrivalRef.current) {
          arrivalRef.current.ready(reveal);
        } else {
          reveal();
        }
      });
  };

  const outline: CSSProperties = { borderRadius: radius, clipPath };
  const missing = phase === 'missing';
  return (
    <div
      ref={rootRef}
      className={clsx(styles.root, raised && (clipPath ? styles.cutout : styles.raised))}
      style={{ aspectRatio: `1 / ${aspect}` }}
      data-phase={waiting ? 'loading' : phase}
      data-arrival={state.arrival}
      data-slot={state.slot ? '' : undefined}
      data-motion={motion ? undefined : 'reduce'}
      aria-busy={waiting || undefined}
      role={missing ? 'img' : undefined}
      aria-label={missing ? `${name}: preview unavailable` : undefined}
    >
      {missing ? (
        <div className={styles.missing} style={outline}>
          <ImageOff className={styles.glyph} strokeWidth={1.5} aria-hidden />
          <span className={styles.name}>{name}</span>
        </div>
      ) : (
        <>
          {phase !== 'shown' ? <div className={styles.slot} style={outline} aria-hidden /> : null}
          <div ref={artRef} className={styles.art} style={outline}>
            {fetching && src ? (
              <img
                ref={imgRef}
                className={styles.img}
                src={drawn ?? src}
                alt={name}
                decoding="async"
                fetchPriority={priority ? 'high' : undefined}
                draggable={false}
                onLoad={onLoad}
                onError={() => {
                  probeRef.current = null;
                  dispatch({ type: 'failed' });
                }}
              />
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
