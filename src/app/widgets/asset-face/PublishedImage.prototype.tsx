/*
 * PROTOTYPE, throwaway, lives only on norbert/prototype-graceful-images and is never merged.
 * Plan: three ways a published image can arrive (A silhouette then fade, B develops from its own colour, C arrives when ready), switchable via `?variant=A|B|C` with `?slow=<ms>` to hold every src, on the existing `/assets` and `/factions` routes.
 * D is the proposed combination: C's slot, prefetch and reading-order wave, with B's develop as the moment each image lands.
 *
 * Two faults are separated in every variant: loading is never drawn as missing, and arrival is never a hard swap.
 * Loading is lit glass (plus A's sheen or B's tone); missing is a matte, recessed socket with a photo-off glyph and, where there is room, the name.
 * The missing state (no image, or a failed load) is shared by every variant and never animates, so only the arrival differs.
 * Without `?variant` both routes render exactly what main renders today, for comparison.
 *
 * Nothing is drawn for the first CACHE_GRACE_MS after a tile comes into range.
 * An image the browser already holds lands in that window and appears, so a cached image never replaces a placeholder.
 *
 * `?slow` imitates a slow network rather than scheduling the reveal.
 * Each request starts when its tile comes into fetch range, so C's wider prefetch shows, and answers after `slow` plus a scatter that ignores reading order, as real responses do.
 * The scatter runs from 0 to 1080 ms, or 0 to `?scatter=<ms>`.
 * A scatter wider than CASCADE_MAX_WAIT_MS lets the cap fire, so a later tile can overtake an earlier one in C and D; within it, the wave is strictly top-down.
 * A and B draw each image as its answer lands; C and D hold a decoded image until every earlier tile in flight has landed, then reveal in reading order.
 *
 * Capture support: every root carries `data-order` (reading order).
 * The loading layers stay mounted under the image and every arrival is a CSS animation with fill `both`, so a script can pause `document.getAnimations()` and set each one's currentTime from its startTime to replay any moment, loading included.
 */
import { useLocation } from '@tanstack/react-router';
import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import styles from './PublishedImage.prototype.module.css';

export type PrototypeImageVariant = 'A' | 'B' | 'C' | 'D';

export const PROTOTYPE_IMAGE_VARIANTS: { key: PrototypeImageVariant; name: string }[] = [
  { key: 'A', name: 'Silhouette, then fade' },
  { key: 'B', name: 'Develops from its own colour' },
  { key: 'C', name: 'Arrives when ready' },
  { key: 'D', name: "C's wave with B's develop" },
];

/** Reads `?variant`, `?slow` and `?scatter` off the URL; no variant means today's rendering. */
export function usePrototypeImageSettings(): { variant: PrototypeImageVariant | null; slow: number; scatter: number } {
  const search = useLocation({ select: (location) => location.search as Record<string, unknown> });
  const raw = String(search.variant ?? '').toUpperCase();
  const variant = raw === 'A' || raw === 'B' || raw === 'C' || raw === 'D' ? raw : null;
  const slow = Number(search.slow ?? 0);
  const scatter = Number(search.scatter ?? DEFAULT_SCATTER_MS);
  return {
    variant,
    slow: Number.isFinite(slow) && slow > 0 ? slow : 0,
    scatter: Number.isFinite(scatter) && scatter >= 0 ? scatter : DEFAULT_SCATTER_MS,
  };
}

/** The outline an asset draws in: its own proportions, corner or clip, and the frame shadow its published face already wears. */
export type PrototypeSilhouette = {
  aspect: number;
  borderRadius?: string | number;
  clipPath?: string;
  shadow?: string;
};

/** How long a tile in range draws nothing, so an image the browser already holds appears at once instead of replacing a placeholder. */
const CACHE_GRACE_MS = 90;
/** The widest of `?slow`'s scatter unless `?scatter` says otherwise; ten steps, so responses spread over about a second, out of reading order. */
const DEFAULT_SCATTER_MS = 1080;
/** C's cascade: tiles revealed together still arrive one reading-order step after another. */
const CASCADE_STAGGER_MS = 40;
/** C never holds a decoded image longer than this for an earlier tile that has not landed. */
const CASCADE_MAX_WAIT_MS = 700;
/** A and B start fetching near the viewport, as native lazy loading does; C and D fetch well ahead of it. */
const ROOT_MARGIN_PX: Record<PrototypeImageVariant, number> = { A: 300, B: 300, C: 1600, D: 1600 };

/** C and D reveal through the reading-order gate; they differ only in the CSS of the reveal itself. */
function waves(variant: PrototypeImageVariant) {
  return variant === 'C' || variant === 'D';
}

/*
 * `?slow`'s simulated response time for a tile: the hold plus one of ten scatter steps that do not follow reading order.
 * To go back to a reading-order stagger, return `slow + order * (scatter / 9)`.
 */
function slowHold(slow: number, scatter: number, order: number) {
  return slow + Math.round((((order * 7) % 10) / 9) * scatter);
}

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

/*
 * C's and D's reveal gate.
 * Every C or D image in flight registers; a decoded image reveals only once every in-flight image earlier in reading order has revealed or dropped out, so the page assembles from the top instead of flickering in response order.
 * Images sharing an order (a faction card's tokens) reveal together; each later order waits one cascade step.
 * A decoded image that has waited CASCADE_MAX_WAIT_MS reveals anyway, so one slow image cannot hold the page.
 */
type GateEntry = { order: number; ready: boolean; forced: boolean; reveal: (() => void) | null };
const gate = new Set<GateEntry>();
let lastRevealAt = 0;
let lastRevealOrder = -1;

function flushGate() {
  const entries = [...gate].sort((a, b) => a.order - b.order);
  let blockedFrom = Number.POSITIVE_INFINITY;
  for (const entry of entries) {
    if (!entry.ready) {
      blockedFrom = Math.min(blockedFrom, entry.order);
      continue;
    }
    if (entry.order > blockedFrom && !entry.forced) {
      continue;
    }
    gate.delete(entry);
    const now = performance.now();
    const at = entry.order === lastRevealOrder ? lastRevealAt : Math.max(now, lastRevealAt + CASCADE_STAGGER_MS);
    lastRevealAt = at;
    lastRevealOrder = entry.order;
    const reveal = entry.reveal;
    if (reveal) {
      setTimeout(reveal, at - now);
    }
  }
}

function dropFromGate(ref: { current: GateEntry | null }) {
  const entry = ref.current;
  ref.current = null;
  if (entry && gate.delete(entry)) {
    flushGate();
  }
}

type State = {
  phase: 'loading' | 'shown' | 'missing';
  /** Whether the arrival animates; an image that lands inside the grace window, or was decoded before, appears at once. */
  arrival: 'animate' | 'instant';
  /** Whether the loading silhouette is drawn; it waits out the grace window first. */
  placeholder: boolean;
  order: number | null;
  /** The src the img element actually carries, held back while out of range or during `?slow`. */
  heldSrc: string | null;
  failedSrc: string | null;
};

type Action =
  | { type: 'ordered'; order: number }
  | { type: 'placeholder' }
  | { type: 'release'; src: string }
  | { type: 'show'; arrival: State['arrival'] }
  | { type: 'fail'; src: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ordered':
      return { ...state, order: action.order };
    case 'placeholder':
      return state.phase === 'loading' ? { ...state, placeholder: true } : state;
    case 'release':
      return { ...state, heldSrc: action.src };
    case 'show':
      return state.phase === 'loading' ? { ...state, phase: 'shown', arrival: action.arrival } : state;
    case 'fail':
      return { ...state, phase: 'missing', failedSrc: action.src, heldSrc: null };
  }
}

function initialState(src: string | null): State {
  const base = { order: null, failedSrc: null, placeholder: false } as const;
  if (!src) {
    return { ...base, phase: 'missing', arrival: 'instant', heldSrc: null };
  }
  if (decodedSources.has(src)) {
    return { ...base, phase: 'shown', arrival: 'instant', heldSrc: src };
  }
  return { ...base, phase: 'loading', arrival: 'animate', heldSrc: null };
}

function inRange(element: HTMLElement, margin: number) {
  const rect = element.getBoundingClientRect();
  return rect.bottom >= -margin && rect.top <= window.innerHeight + margin;
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
  const { scatter } = usePrototypeImageSettings();
  const rootRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  /** performance.now() when the tile first came into fetch range. */
  const [rangeAt, setRangeAt] = useState<number | null>(null);
  const placeholderShown = useRef(false);
  placeholderShown.current = state.placeholder;
  const gateEntry = useRef<GateEntry | null>(null);

  const effectiveSrc = src === state.failedSrc ? null : src;
  const phase = effectiveSrc ? state.phase : 'missing';
  const waiting = phase === 'loading';

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    requestOrder(root, (order) => dispatch({ type: 'ordered', order }));
    return () => {
      pendingOrder.delete(root);
    };
  }, []);

  /* Fetch range, checked inside the layout pass so a tile already on screen releases its src before the first paint. */
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !waiting || rangeAt !== null) {
      return;
    }
    if (inRange(root, ROOT_MARGIN_PX[variant])) {
      setRangeAt(performance.now());
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          setRangeAt(performance.now());
        }
      },
      { rootMargin: `${ROOT_MARGIN_PX[variant]}px 0px` }
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, [rangeAt, variant, waiting]);

  /* The grace window: the loading silhouette appears only if the image has not landed by then. */
  useEffect(() => {
    if (rangeAt === null || !waiting || state.placeholder) {
      return;
    }
    const timer = setTimeout(
      () => {
        /* Bytes already here means a cache hit whose decode is still running on a busy main thread: wait for it rather than flash a placeholder. */
        const img = imgRef.current;
        if (img?.complete && img.naturalWidth > 0) {
          return;
        }
        dispatch({ type: 'placeholder' });
      },
      Math.max(0, CACHE_GRACE_MS - (performance.now() - rangeAt))
    );
    return () => clearTimeout(timer);
  }, [rangeAt, state.placeholder, waiting]);

  /* C and D register with the reveal gate once in flight and knowing their place in the order. */
  useEffect(() => {
    if (!waves(variant) || rangeAt === null || state.order === null || !waiting || gateEntry.current) {
      return;
    }
    const entry: GateEntry = { order: state.order, ready: false, forced: false, reveal: null };
    gateEntry.current = entry;
    gate.add(entry);
  }, [rangeAt, state.order, variant, waiting]);

  useEffect(() => () => dropFromGate(gateEntry), []);

  /* Release the src: at once at real speed, or after `?slow`'s simulated response time. */
  useLayoutEffect(() => {
    if (rangeAt === null || !effectiveSrc || state.heldSrc || !waiting) {
      return;
    }
    if (!slow) {
      dispatch({ type: 'release', src: effectiveSrc });
      return;
    }
    if (state.order === null) {
      return;
    }
    const timer = setTimeout(
      () => dispatch({ type: 'release', src: effectiveSrc }),
      Math.max(0, rangeAt + slowHold(slow, scatter, state.order) - performance.now())
    );
    return () => clearTimeout(timer);
  }, [effectiveSrc, rangeAt, scatter, slow, state.heldSrc, state.order, waiting]);

  /* An image the browser already holds is complete the moment it gets its src: shown before the first paint, with no animation. */
  useLayoutEffect(() => {
    const img = imgRef.current;
    if (img && state.heldSrc && waiting && !slow && img.complete && img.naturalWidth > 0) {
      decodedSources.add(state.heldSrc);
      dropFromGate(gateEntry);
      dispatch({ type: 'show', arrival: 'instant' });
    }
  }, [slow, state.heldSrc, waiting]);

  const onLoad = () => {
    const img = imgRef.current;
    const loaded = state.heldSrc;
    if (!img || !loaded || state.phase !== 'loading') {
      return;
    }
    /* decode() resolves once the pixels are ready to paint, so the first frame of the arrival already has the image in it. */
    void img
      .decode()
      .catch(() => undefined)
      .then(() => {
        if (img.naturalWidth === 0) {
          dropFromGate(gateEntry);
          dispatch({ type: 'fail', src: loaded });
          return;
        }
        decodedSources.add(loaded);
        if (!placeholderShown.current) {
          /* Landed inside the grace window: nothing was drawn yet, so the image appears at once. */
          dropFromGate(gateEntry);
          dispatch({ type: 'show', arrival: 'instant' });
          return;
        }
        const entry = gateEntry.current;
        if (waves(variant) && entry) {
          entry.ready = true;
          entry.reveal = () => dispatch({ type: 'show', arrival: 'animate' });
          setTimeout(() => {
            if (gate.has(entry)) {
              entry.forced = true;
              flushGate();
            }
          }, CASCADE_MAX_WAIT_MS);
          flushGate();
          return;
        }
        dispatch({ type: 'show', arrival: 'animate' });
      });
  };

  const style = {
    aspectRatio: `1 / ${silhouette.aspect}`,
    '--proto-tone': tone ?? 'var(--proto-fallback-tone)',
    '--proto-shadow': silhouette.shadow ?? 'none',
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
      data-placeholder={state.placeholder ? 'shown' : undefined}
      data-order={state.order ?? undefined}
      role={phase === 'missing' ? 'img' : undefined}
      aria-label={phase === 'missing' ? `${name}: preview unavailable` : undefined}
    >
      {phase === 'missing' ? (
        <div className={styles.missing} style={shape} aria-hidden>
          <svg
            className={styles.glyph}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 8h.01" />
            <path d="M7 3h11a3 3 0 0 1 3 3v11m-.856 3.099a2.991 2.991 0 0 1 -2.144 .901h-12a3 3 0 0 1 -3 -3v-12c0 -.845 .349 -1.608 .91 -2.153" />
            <path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5" />
            <path d="M16.33 12.338c.574 -.054 1.155 .166 1.67 .662l3 3" />
            <path d="M3 3l18 18" />
          </svg>
          <span className={styles.name}>{name}</span>
        </div>
      ) : (
        <>
          {/* The loading silhouette. It stays mounted under the image so a replayed capture can show the loading moment. */}
          <div className={styles.slot} style={shape} aria-hidden />
          <div className={styles.art} style={shape}>
            {state.heldSrc ? (
              <img
                ref={imgRef}
                className={styles.img}
                src={state.heldSrc}
                alt={name}
                decoding="async"
                draggable={false}
                onLoad={onLoad}
                onError={() => {
                  if (state.heldSrc) {
                    dropFromGate(gateEntry);
                    dispatch({ type: 'fail', src: state.heldSrc });
                  }
                }}
              />
            ) : null}
          </div>
        </>
      )}
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
