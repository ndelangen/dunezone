import clsx from 'clsx';
import { ImageOff } from 'lucide-react';
import { useEffect, useLayoutEffect, useReducer, useRef } from 'react';
import type { CSSProperties } from 'react';

import { useMotionAllowed } from '@app/styles/motion';

import { joinArrival, markDecoded, requestOrder, wasDecoded } from './imageArrival';
import styles from './PublishedImage.module.css';

/** How long an image in fetch range draws nothing, so one the browser already holds appears at once instead of replacing a slot. */
const GRACE_MS = 90;

/** How far outside the viewport an image starts fetching, so most have landed before the reader scrolls to them. */
const FETCH_MARGIN_PX = 1600;

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
  /** Whether the image wears a raised frame's shadow, which arrives with it rather than ahead of it. */
  raised?: boolean;
};

/**
 * One published image, arriving gracefully.
 * Callers own which publication it shows and the outline it is cut to;
 * this owns the arrival: a clear slot while it loads, the develop when it lands, and a matte missing state that never looks like loading.
 *
 * It fills the width it is given at `aspect`, and fetches nothing but `src`.
 */
export function PublishedImage(props: Props) {
  /* A new src is a new image with its own arrival, so it starts from a fresh state and a fresh img element. */
  return <Arrival key={props.src ?? ''} {...props} />;
}

type Phase = 'loading' | 'decoded' | 'shown' | 'missing';

type State = {
  phase: Phase;
  /** Whether landing animates; an image decoded before, or landing inside the grace window, appears at once. */
  arrival: 'animate' | 'instant';
  /** Whether the img element carries its src, which it does once the tile is in fetch range. */
  fetching: boolean;
  /** Whether the loading slot is drawn, which waits out the grace window. */
  slot: boolean;
  order: number | null;
};

type Action =
  | { type: 'ordered'; order: number }
  | { type: 'inRange' }
  | { type: 'graceOver' }
  | { type: 'decoded' }
  | { type: 'revealed' }
  | { type: 'failed' };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ordered':
      return { ...state, order: action.order };
    case 'inRange':
      return { ...state, fetching: true };
    case 'graceOver':
      return state.phase === 'loading' ? { ...state, slot: true } : state;
    case 'decoded':
      if (state.phase !== 'loading') {
        return state;
      }
      /* Nothing was drawn yet, so there is nothing to arrive from. */
      return state.slot ? { ...state, phase: 'decoded' } : { ...state, phase: 'shown', arrival: 'instant' };
    case 'revealed':
      return state.phase === 'decoded' ? { ...state, phase: 'shown' } : state;
    case 'failed':
      return { ...state, phase: 'missing', fetching: false };
  }
}

function initialState(src: string | null): State {
  const base = { arrival: 'animate', fetching: false, slot: false, order: null } as const;
  if (src === null) {
    return { ...base, phase: 'missing' };
  }
  if (wasDecoded(src)) {
    return { ...base, phase: 'shown', arrival: 'instant', fetching: true };
  }
  return { ...base, phase: 'loading' };
}

function inFetchRange(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return rect.bottom >= -FETCH_MARGIN_PX && rect.top <= window.innerHeight + FETCH_MARGIN_PX;
}

function Arrival({ src, name, aspect, radius, clipPath, raised = false }: Props) {
  const [state, dispatch] = useReducer(reducer, src, initialState);
  const motion = useMotionAllowed();
  const rootRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const arrivalRef = useRef<ReturnType<typeof joinArrival> | null>(null);
  const { phase, fetching, order } = state;
  const waiting = phase === 'loading' || phase === 'decoded';

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
    if (inFetchRange(root)) {
      dispatch({ type: 'inRange' });
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          dispatch({ type: 'inRange' });
        }
      },
      { rootMargin: `${FETCH_MARGIN_PX}px 0px` }
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, [fetching, phase]);

  /* An image the browser already holds is complete the moment it gets its src, so it is shown before the first paint. */
  useLayoutEffect(() => {
    const img = imgRef.current;
    if (fetching && phase === 'loading' && src && img?.complete && img.naturalWidth > 0) {
      markDecoded(src);
      dispatch({ type: 'decoded' });
    }
  }, [fetching, phase, src]);

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

  useEffect(() => {
    if (phase !== 'decoded') {
      return;
    }
    const reveal = () => dispatch({ type: 'revealed' });
    if (arrivalRef.current) {
      arrivalRef.current.ready(reveal);
    } else {
      reveal();
    }
  }, [phase]);

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
        if (img.naturalWidth === 0) {
          dispatch({ type: 'failed' });
          return;
        }
        markDecoded(src);
        dispatch({ type: 'decoded' });
      });
  };

  const outline: CSSProperties = { borderRadius: radius, clipPath };
  const missing = phase === 'missing';
  return (
    <div
      ref={rootRef}
      className={clsx(styles.root, raised && styles.raised)}
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
          {/* Stays under the image once it lands, so a capture can replay the loading moment. */}
          <div className={styles.slot} style={outline} aria-hidden />
          <div className={styles.art} style={outline}>
            {fetching && src ? (
              <img
                ref={imgRef}
                className={styles.img}
                src={src}
                alt={name}
                decoding="async"
                draggable={false}
                onLoad={onLoad}
                onError={() => dispatch({ type: 'failed' })}
              />
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
