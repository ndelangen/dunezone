/*
 * PROTOTYPE, throwaway, lives only on norbert/prototype-graceful-images and is never merged.
 * Plan: three ways a published image can arrive (A silhouette then fade, B develops from its own colour, C arrives when ready), switchable via `?variant=A|B|C` with `?slow=<ms>` to hold every src, on the existing `/assets` and `/factions` routes.
 *
 * Two faults are separated in every variant: loading is never drawn as missing, and arrival is never a hard swap.
 * The missing state (no image, or a failed load) is shared by all three, so only the arrival differs.
 * Without `?variant` both routes render exactly what main renders today, for comparison.
 *
 * Capture support: every root carries `data-order` (reading order), `data-mounted-at` and `data-arrive-at` (performance.now() at mount and when its arrival animation started), and the loading layers stay mounted under the image, so a script can pause `document.getAnimations()` and replay any moment.
 */
import { useLocation } from '@tanstack/react-router';
import { useEffect, useLayoutEffect, useReducer, useRef } from 'react';
import type { CSSProperties } from 'react';

import styles from './PublishedImage.prototype.module.css';

export type PrototypeImageVariant = 'A' | 'B' | 'C';

export const PROTOTYPE_IMAGE_VARIANTS: { key: PrototypeImageVariant; name: string }[] = [
  { key: 'A', name: 'Silhouette, then fade' },
  { key: 'B', name: 'Develops from its own colour' },
  { key: 'C', name: 'Arrives when ready' },
];

/** Reads `?variant` and `?slow` off the URL; no variant means today's rendering. */
export function usePrototypeImageSettings(): { variant: PrototypeImageVariant | null; slow: number } {
  const search = useLocation({ select: (location) => location.search as Record<string, unknown> });
  const raw = String(search.variant ?? '').toUpperCase();
  const variant = raw === 'A' || raw === 'B' || raw === 'C' ? raw : null;
  const slow = Number(search.slow ?? 0);
  return { variant, slow: Number.isFinite(slow) && slow > 0 ? slow : 0 };
}

/** The outline an asset draws in: its own proportions, corner or clip, and the frame shadow its published face already wears. */
export type PrototypeSilhouette = {
  aspect: number;
  borderRadius?: string | number;
  clipPath?: string;
  shadow?: string;
};

/** Per-tile stagger added to `?slow` in reading order, so a grid's arrival can be watched on any device. */
const SLOW_STAGGER_MS = 120;
/** C's cascade: tiles decoded together still reveal one after another, in reading order. */
const CASCADE_STAGGER_MS = 40;
/** Anything decoded this soon after its src was set came from a cache, and animating it would be a flash, not an arrival. */
const INSTANT_THRESHOLD_MS = 60;
/** A and B start fetching near the viewport, as native lazy loading does; C fetches well ahead of it. */
const ROOT_MARGIN: Record<PrototypeImageVariant, string> = { A: '300px 0px', B: '300px 0px', C: '1600px 0px' };

/*
 * Every src decoded during this page session.
 * Module scope survives client navigation, so going back to a page shows its images at once instead of replaying the arrival.
 */
const decodedSources = new Set<string>();

/*
 * Reading order, counted in tiles: every mounted image registers its root, and one frame later the pending roots are grouped by tile and the tiles sorted by row, then by column.
 * A tile is the link an image sits in (a faction card, an asset pile), or the image itself when it sits in none, so a card's five tokens share one place in the order.
 * Rows are bucketed so the slight tilt of a fanned pile does not reorder a row.
 */
const pendingOrder = new Map<HTMLElement, (order: number) => void>();
let orderAssigned = 0;
let orderFrame = 0;

function requestOrder(element: HTMLElement, assign: (order: number) => void) {
  pendingOrder.set(element, assign);
  if (!orderFrame) {
    orderFrame = requestAnimationFrame(() => {
      orderFrame = 0;
      const tiles = new Map<Element, { row: number; left: number; callbacks: ((order: number) => void)[] }>();
      for (const [node, callback] of pendingOrder) {
        const tile = node.closest('a') ?? node;
        const existing = tiles.get(tile);
        if (existing) {
          existing.callbacks.push(callback);
          continue;
        }
        const rect = tile.getBoundingClientRect();
        tiles.set(tile, { row: Math.round((rect.top + window.scrollY) / 24), left: rect.left, callbacks: [callback] });
      }
      pendingOrder.clear();
      const sorted = [...tiles.values()].sort((a, b) => a.row - b.row || a.left - b.left);
      for (const tile of sorted) {
        const order = orderAssigned++;
        for (const callback of tile.callbacks) {
          callback(order);
        }
      }
    });
  }
}

/* C's reveal queue: whatever became ready in the same frame is revealed in reading order, never faster than the stagger. */
const readyQueue: { order: number; reveal: () => void }[] = [];
let lastRevealAt = 0;
let queueTimer: ReturnType<typeof setTimeout> | null = null;

function queueReveal(order: number, reveal: () => void) {
  readyQueue.push({ order, reveal });
  if (queueTimer) {
    return;
  }
  queueTimer = setTimeout(() => {
    queueTimer = null;
    readyQueue.sort((a, b) => a.order - b.order);
    const now = performance.now();
    let at = Math.max(now, lastRevealAt + CASCADE_STAGGER_MS);
    for (const item of readyQueue.splice(0)) {
      setTimeout(item.reveal, at - now);
      lastRevealAt = at;
      at += CASCADE_STAGGER_MS;
    }
  }, 16);
}

type State = {
  phase: 'loading' | 'shown' | 'missing';
  /** Whether the arrival animates; a cached image appears at once. */
  arrival: 'animate' | 'instant';
  order: number | null;
  /** The src the img element actually carries, held back while out of range or during `?slow`. */
  heldSrc: string | null;
  failedSrc: string | null;
  arriveAt: number | null;
};

type Action =
  | { type: 'ordered'; order: number }
  | { type: 'release'; src: string }
  | { type: 'show'; arrival: State['arrival']; at: number }
  | { type: 'fail'; src: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ordered':
      return { ...state, order: action.order };
    case 'release':
      return { ...state, heldSrc: action.src };
    case 'show':
      return { ...state, phase: 'shown', arrival: action.arrival, arriveAt: action.at };
    case 'fail':
      return { ...state, phase: 'missing', failedSrc: action.src, heldSrc: null };
  }
}

function initialState(src: string | null): State {
  if (!src) {
    return { phase: 'missing', arrival: 'instant', order: null, heldSrc: null, failedSrc: null, arriveAt: null };
  }
  if (decodedSources.has(src)) {
    return { phase: 'shown', arrival: 'instant', order: null, heldSrc: src, failedSrc: null, arriveAt: null };
  }
  return { phase: 'loading', arrival: 'animate', order: null, heldSrc: null, failedSrc: null, arriveAt: null };
}

/**
 * One published image, arriving the way the chosen variant says.
 * The box holds the asset's exact proportions from the first paint, so nothing shifts when the image lands.
 */
export function PrototypePublishedImage({
  src,
  name,
  tone,
  silhouette,
  variant,
  slow,
}: {
  src: string | null;
  name: string;
  /** The asset's own main colour, from data the caller already has; B fills the silhouette with it while loading. */
  tone?: string;
  silhouette: PrototypeSilhouette;
  variant: PrototypeImageVariant;
  slow: number;
}) {
  /* A new src is a new image, so callers key this by src rather than it resyncing. */
  const [state, dispatch] = useReducer(reducer, src, initialState);
  const rootRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const releasedAt = useRef(0);

  const effectiveSrc = src === state.failedSrc ? null : src;
  const phase = effectiveSrc ? state.phase : 'missing';

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    root.dataset.mountedAt = String(Math.round(performance.now()));
    requestOrder(root, (order) => dispatch({ type: 'ordered', order }));
    return () => {
      pendingOrder.delete(root);
    };
  }, []);

  /* Release the src once the tile is in range and its `?slow` hold has passed. */
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !effectiveSrc || state.heldSrc || state.phase !== 'loading' || state.order === null) {
      return;
    }
    let inRange = false;
    let holdDone = slow === 0;
    const release = () => {
      if (inRange && holdDone) {
        releasedAt.current = performance.now();
        dispatch({ type: 'release', src: effectiveSrc });
      }
    };
    const hold = slow ? setTimeout(() => ((holdDone = true), release()), slow + state.order * SLOW_STAGGER_MS) : null;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          inRange = true;
          observer.disconnect();
          release();
        }
      },
      { rootMargin: ROOT_MARGIN[variant] }
    );
    observer.observe(root);
    return () => {
      observer.disconnect();
      if (hold) {
        clearTimeout(hold);
      }
    };
  }, [effectiveSrc, slow, state.heldSrc, state.order, state.phase, variant]);

  const onLoad = () => {
    const img = imgRef.current;
    const loaded = state.heldSrc;
    if (!img || !loaded || state.phase !== 'loading') {
      return;
    }
    /* decode() resolves once the pixels are ready to paint, so the first frame of the arrival already has the image in it. */
    img
      .decode()
      .catch(() => undefined)
      .then(() => {
        if (img.naturalWidth === 0) {
          dispatch({ type: 'fail', src: loaded });
          return;
        }
        decodedSources.add(loaded);
        const cached = slow === 0 && performance.now() - releasedAt.current < INSTANT_THRESHOLD_MS;
        if (cached) {
          dispatch({ type: 'show', arrival: 'instant', at: performance.now() });
        } else if (variant === 'C') {
          queueReveal(state.order ?? 0, () => dispatch({ type: 'show', arrival: 'animate', at: performance.now() }));
        } else {
          dispatch({ type: 'show', arrival: 'animate', at: performance.now() });
        }
      });
  };

  const style = {
    aspectRatio: `1 / ${silhouette.aspect}`,
    '--proto-tone': tone ?? 'var(--proto-fallback-tone)',
  } as CSSProperties;
  const shape: CSSProperties = { borderRadius: silhouette.borderRadius, clipPath: silhouette.clipPath };

  return (
    <div
      ref={rootRef}
      className={styles.root}
      style={style}
      data-variant={variant}
      data-phase={phase}
      data-arrival={state.arrival}
      data-order={state.order ?? undefined}
      data-arrive-at={state.arriveAt === null ? undefined : Math.round(state.arriveAt)}
      role={phase === 'missing' ? 'img' : undefined}
      aria-label={phase === 'missing' ? `${name}: preview unavailable` : undefined}
    >
      {/* The loading or missing silhouette. It stays mounted under the image so a failed decode or a replayed capture never shows a hole. */}
      <div className={styles.slot} style={shape} aria-hidden />
      <div className={styles.art} style={{ ...shape, boxShadow: silhouette.shadow }}>
        {state.heldSrc && phase !== 'missing' ? (
          <img
            ref={imgRef}
            className={styles.img}
            src={state.heldSrc}
            alt={name}
            decoding="async"
            draggable={false}
            onLoad={onLoad}
            onError={() => state.heldSrc && dispatch({ type: 'fail', src: state.heldSrc })}
          />
        ) : null}
      </div>
      {phase === 'missing' ? (
        <span className={styles.name} aria-hidden>
          {name}
        </span>
      ) : null}
    </div>
  );
}

/** A face's main colour from listing data: a token's or rectangle's front background, a deck's cardback, a treachery card's head. */
export function prototypeTone(data: unknown): string | undefined {
  const record = (value: unknown) =>
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
  const root = record(data);
  const background =
    record(record(root?.front)?.background) ?? record(record(root?.cardback)?.background) ?? record(root?.head);
  const colors = background?.colors;
  const first = Array.isArray(colors) ? colors[0] : undefined;
  if (typeof first === 'string') {
    return first;
  }
  const stops = record(first)?.stops;
  const stop = Array.isArray(stops) ? stops[0] : undefined;
  return Array.isArray(stop) && typeof stop[0] === 'string' ? stop[0] : undefined;
}
