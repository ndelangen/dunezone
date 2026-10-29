import { VisuallyHidden } from '@mantine/core';
import { Kbd } from '@ui/content/Kbd';
import clsx from 'clsx';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { useClosingCopy } from '@app/styles/closingCopy';
import { useMotionAllowed } from '@app/styles/motion';

import styles from './RadialMenu.module.css';
import { HOLD_SECONDS, useHoldToConfirm } from './useHoldToConfirm';

type RadialIcon = 'peek' | 'draw' | 'deal' | 'shuffle' | 'reserve' | 'hand' | 'delete' | 'back';

export type RadialAction = Readonly<{
  key: string;
  /** The item's accessible name and its caption, as the list menu named it. */
  label: string;
  icon: RadialIcon;
  /** A table shortcut that does the same, shown beside the caption so the ring teaches it. */
  shortcut?: string;
  disabled?: boolean;
  /** Plain items act on click; a held item is the destructive one, which fires after the app's five-second hold. */
  onSelect?: () => void;
  held?: boolean;
  /** Stepping into this item replaces the ring with a ring of these choices, as Deal does with the factions. */
  targets?: readonly RadialTarget[];
  /** The caption over the stepped-into ring, for example "Deal 1 card to…". */
  targetsLabel?: string;
}>;

/** One choice in a stepped-into ring, such as a faction to deal to. */
type RadialTarget = Readonly<{
  key: string;
  /** The accessible name, for example "Deal 1 to Fremen". */
  label: string;
  /** The caption while pointed at, for example "Fremen". */
  name: string;
  /** What the disc shows: the faction's token, or a stand-in. */
  face: ReactNode;
  disabled?: boolean;
  onSelect: () => void;
}>;

const ICONS: Record<RadialIcon, ReactNode> = {
  peek: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  draw: (
    <>
      <rect x="6" y="3" width="12" height="16" rx="2" />
      <path d="M12 9v8M8.5 13.5 12 17l3.5-3.5" />
    </>
  ),
  shuffle: (
    <path d="M3 7h3.5c4 0 7 10 11 10H21M18 14l3 3-3 3M3 17h3.5c1.6 0 3-1.6 4.2-3.6M13.3 9.6C14.5 8 15.9 7 17.5 7H21M18 4l3 3-3 3" />
  ),
  reserve: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
    </>
  ),
  deal: (
    <>
      <rect x="3" y="6" width="10" height="14" rx="2" />
      <path d="M14 9h7M18 6l3 3-3 3" />
    </>
  ),
  hand: (
    <>
      <path d="M18 11V6a2 2 0 0 0-4 0v1a2 2 0 0 0-4 0v2a2 2 0 0 0-4 0v6" />
      <path d="M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </>
  ),
  delete: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  back: <path d="M15 6l-6 6 6 6" />,
};

/* Six places around the pointer, a sixth of a turn apart, starting at the top. The destructive action always takes the last one, top left, so a hand learns where it is and never meets it by accident. */
const SLOTS = 6;
const RING_RADIUS = 66;
/* How far the ring keeps from the window's edges, room for the widest stepped-into ring and its caption. */
const EDGE = { side: 190, top: 170, bottom: 170 };
/* A stepped-into ring grows until its discs clear each other; past twelve the discs shrink a little so eighteen still make one ring. */
const TARGET_GAP = 6;

function targetRing(count: number) {
  const disc = count > 12 ? 38 : 42;
  return { disc, radius: Math.max(RING_RADIUS, (count * (disc + TARGET_GAP)) / (2 * Math.PI)) };
}

function slotAngle(slot: number) {
  return -Math.PI / 2 + (slot * 2 * Math.PI) / SLOTS;
}

/* Where a child sits from the centre; `--x` and `--y` repeat it so the open animation can fly the child out from the centre. */
function at(angle: number, radius: number): CSSProperties {
  const left = Math.cos(angle) * radius;
  const top = Math.sin(angle) * radius;
  return { left, top, '--x': `${left}px`, '--y': `${top}px` } as CSSProperties;
}

function Glyph({ icon }: Readonly<{ icon: RadialIcon }>) {
  return (
    <svg className={styles.glyph} viewBox="0 0 24 24" aria-hidden>
      {ICONS[icon]}
    </svg>
  );
}

type Caption = { text: string; shortcut?: string; tone?: 'danger' };

/*
 * Only a pointer that moved points at an item. The items fly out under a pointer at rest as a ring opens, which the
 * browser tells as the pointer entering them; that must not light an item or step into Deal.
 */
function moved(event: ReactPointerEvent) {
  return event.movementX !== 0 || event.movementY !== 0;
}

function HeldItem({
  action,
  style,
  hidden,
  onCaption,
  onPoint,
}: Readonly<{
  action: RadialAction;
  style: CSSProperties;
  hidden: boolean;
  onCaption: (caption: Caption | null) => void;
  onPoint: (event: ReactPointerEvent<HTMLElement>) => void;
}>) {
  const { holding, remaining, handlers } = useHoldToConfirm({
    pending: false,
    blocked: Boolean(action.disabled),
    onConfirm: () => action.onSelect?.(),
  });
  const showing = holding ? `Deleting in ${remaining ?? HOLD_SECONDS}..` : null;
  /* An early release puts the item's own label back, so no countdown lingers once nothing is counting. */
  const counted = useRef(false);
  useEffect(() => {
    if (showing || counted.current) {
      onCaption({ text: showing ?? action.label, tone: 'danger' });
    }
    counted.current = Boolean(showing);
  }, [showing, action.label, onCaption]);
  return (
    <button
      type="button"
      role="menuitem"
      aria-label={action.label}
      disabled={action.disabled}
      hidden={hidden}
      className={clsx(styles.item, styles.danger)}
      data-holding={holding || undefined}
      style={
        {
          ...style,
          '--hold-progress': holding ? (HOLD_SECONDS - (remaining ?? HOLD_SECONDS) + 1) / HOLD_SECONDS : 0,
        } as CSSProperties
      }
      {...handlers}
      onPointerDown={(event) => {
        event.currentTarget.focus();
        handlers.onPointerDown(event);
      }}
      data-point={action.key}
      onPointerMove={onPoint}
      onFocus={() => onCaption({ text: action.label, tone: 'danger' })}
    >
      <Glyph icon={action.icon} />
      <VisuallyHidden aria-live="polite">{showing}</VisuallyHidden>
      <svg className={styles.holdRing} viewBox="0 0 56 56" aria-hidden>
        <circle cx="28" cy="28" r="26" pathLength={1} />
      </svg>
    </button>
  );
}

/* Room kept for the caption beside the ring before it moves to the other side. */
const CAPTION_ROOM = 240;
/* Room for a caption wrapped onto two lines. */
const CAPTION_HEIGHT = 64;

/*
 * The caption reads to the right of the ring, or to its left where the right edge is too close.
 * A window too narrow for either side gets it below the ring, or above it when the ring sits low.
 */
function captionPlacement(centre: { left: number; top: number }, offset: number): CSSProperties {
  if (centre.left + offset + CAPTION_ROOM <= window.innerWidth) {
    return { left: offset };
  }
  if (centre.left - offset - CAPTION_ROOM >= 0) {
    return { left: -offset, translate: '-100% -50%' };
  }
  /* The roomier side, pulled in over the ring's edge when a short window has no room beyond it. */
  const below = window.innerHeight - centre.top;
  return centre.top > below
    ? { top: -Math.min(offset, centre.top - CAPTION_HEIGHT), translate: '-50% -100%' }
    : { top: Math.min(offset, below - CAPTION_HEIGHT), translate: '-50% 0' };
}

/* Keeps a value between two bounds; when they cross, the lower bound wins. */
/* Keeps a point at least `margin` from both ends of `size`, or in the middle when the margins would cross. */
function keepInside(value: number, margin: number, size: number) {
  return 2 * margin >= size ? size / 2 : Math.max(margin, Math.min(value, size - margin));
}

/* The close is short; past this the copy goes even if no animation reports its end, as when the page is hidden. */
const CLOSE_MS = 300;

/**
 * A piece's actions as a ring around the pointer: one flick in a direction instead of reading down a list.
 * An item with choices (Deal) is stepped into: the ring gives way to a ring of those choices, sized to fit them all, with a back button at its centre;
 * right-click and Escape step back out.
 * It is still a menu to assistive technology and to the hosted verifiers: a named `menu` of `menuitem`s with the list menu's names, and arrow keys move between them.
 */
export function RadialMenu({
  name,
  hub,
  x,
  y,
  actions,
  onClose,
}: Readonly<{
  /** The menu's accessible name, for example "Deck actions". */
  name: string;
  /** The words beside the ring while nothing is pointed at, for example "12 cards". */
  hub: string;
  x: number;
  y: number;
  actions: readonly RadialAction[];
  onClose: () => void;
}>) {
  const labelId = useId();
  const menu = useRef<HTMLDivElement>(null);
  const [caption, setCaption] = useState<Caption | null>(null);
  const [steppedInto, setSteppedInto] = useState<string | null>(null);
  const level = actions.find((action) => action.key === steppedInto && action.targets);
  const targets = level?.targets ?? [];
  const { disc, radius } = targetRing(targets.length);
  /* A big choice ring needs more room than the first ring, so the centre keeps the whole ring on screen. */
  const reach = level ? radius + disc / 2 + 12 : 0;
  const centre = {
    left: keepInside(x, Math.max(EDGE.side, reach), window.innerWidth),
    top: keepInside(y, Math.max(EDGE.top, EDGE.bottom, reach), window.innerHeight),
  };

  /* The item the pointer last moved onto, so moving within it does not start it over. */
  const pointed = useRef<string | null>(null);
  const onPoint = (event: ReactPointerEvent<HTMLElement>) => {
    const key = event.currentTarget.dataset.point ?? null;
    if (key && pointed.current !== key && moved(event)) {
      pointed.current = key;
      pointAt(key);
    }
  };
  const unpoint = () => {
    pointed.current = null;
  };

  const stepInto = (action: RadialAction) => {
    unpoint();
    setSteppedInto(action.key);
    setCaption({ text: action.targetsLabel ?? action.label });
    /* The item that had focus hides, so focus stays on the ring for the arrow keys and Escape. */
    menu.current?.focus({ preventScroll: true });
  };
  const stepOut = () => {
    pointed.current = null;
    setSteppedInto(null);
    setCaption(null);
    menu.current?.focus({ preventScroll: true });
  };

  /*
   * The ring closes at once for the table, focus and assistive technology; only a lifeless copy of it shrinks away.
   * It comes before the focus handback below, so its cleanup still sees which item the keys were on.
   */
  const motion = useMotionAllowed();
  useClosingCopy(menu, { enabled: motion, ms: CLOSE_MS });

  /*
   * Focus lands on the ring itself, so the arrow keys and Escape work at once without lighting an item the pointer is not on.
   * Closing hands focus back to whatever held it before, unless a press elsewhere has already moved it.
   */
  useLayoutEffect(() => {
    const opener = document.activeElement;
    const ring = menu.current;
    ring?.focus({ preventScroll: true });
    return () => {
      const current = document.activeElement;
      if (opener instanceof HTMLElement && (!current || current === document.body || ring?.contains(current))) {
        opener.focus({ preventScroll: true });
      }
    };
  }, []);

  /* A press anywhere else closes the ring before that press does its own work, so right-clicking the next piece opens its ring at once. */
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  }, [onClose]);

  const plain = actions.filter((action) => !action.held);
  const held = actions.find((action) => action.held);

  /* Pointing shows the caption; only a click opens an item's choices. */
  const pointAt = (key: string) => {
    if (key === 'back') {
      setCaption({ text: 'Back', shortcut: 'Esc' });
      return;
    }
    const target = targets.find((entry) => `target:${entry.key}` === key);
    if (target) {
      setCaption({ text: target.name });
      return;
    }
    const action = actions.find((entry) => entry.key === key);
    if (!action) {
      return;
    }
    setCaption(
      action.held ? { text: action.label, tone: 'danger' } : { text: action.label, shortcut: action.shortcut }
    );
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    /* Tab leaves the ring, so the ring closes rather than stay open over the board without focus. */
    if (event.key === 'Tab') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      if (level) {
        stepOut();
      } else {
        onClose();
      }
      return;
    }
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) {
      return;
    }
    event.preventDefault();
    const items = [
      ...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled):not([hidden])') ?? []),
    ];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    /* From the ring itself, the first arrow lands on the first item forward or the last item back. */
    const next = index === -1 ? (step > 0 ? 0 : items.length - 1) : (index + step + items.length) % items.length;
    items[next]?.focus();
  };

  const captionStyle = captionPlacement(centre, level ? radius + disc / 2 + 14 : RING_RADIUS + 38);

  return createPortal(
    <div
      ref={menu}
      role="menu"
      aria-labelledby={labelId}
      aria-describedby={`${labelId}-hub`}
      tabIndex={-1}
      data-radial-menu=""
      data-motion={motion || undefined}
      className={styles.ring}
      style={centre}
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        /* Focus moving on to something outside, such as the compass that Space opens, closes the ring rather than leave it open without the keys. */
        if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) {
          onClose();
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        if (level) {
          stepOut();
        }
      }}
      onPointerLeave={() => {
        unpoint();
        if (!level) {
          setCaption(null);
        }
      }}
    >
      <span id={labelId} hidden>
        {name}
      </span>
      <span id={`${labelId}-hub`} hidden>
        {hub}
      </span>
      <span
        className={styles.halo}
        style={{ '--halo-size': `${2 * (level ? radius : RING_RADIUS) + 96}px` } as CSSProperties}
        aria-hidden
      />
      {!level && <span className={styles.pivot} aria-hidden />}
      {plain.map((action, slot) => (
        <button
          key={action.key}
          type="button"
          role="menuitem"
          aria-label={action.label}
          aria-haspopup={action.targets ? 'menu' : undefined}
          disabled={action.disabled}
          hidden={Boolean(level)}
          className={styles.item}
          style={{ ...at(slotAngle(slot), RING_RADIUS), '--order': slot } as CSSProperties}
          onClick={() => (action.targets ? stepInto(action) : action.onSelect?.())}
          data-point={action.key}
          onPointerMove={onPoint}
          onPointerLeave={unpoint}
          onFocus={() => setCaption({ text: action.label, shortcut: action.shortcut })}
        >
          <Glyph icon={action.icon} />
        </button>
      ))}
      {held && (
        <HeldItem
          key={held.key}
          action={held}
          hidden={Boolean(level)}
          style={{ ...at(slotAngle(SLOTS - 1), RING_RADIUS), '--order': SLOTS - 1 } as CSSProperties}
          onCaption={setCaption}
          onPoint={onPoint}
        />
      )}
      {level && (
        <>
          <button
            type="button"
            role="menuitem"
            aria-label="Back"
            className={clsx(styles.item, styles.back)}
            style={{ left: 0, top: 0 }}
            onClick={stepOut}
            data-point="back"
            onPointerMove={onPoint}
            onPointerLeave={unpoint}
            onFocus={() => setCaption({ text: 'Back', shortcut: 'Esc' })}
          >
            <Glyph icon="back" />
          </button>
          {targets.map((target, index) => (
            <button
              key={target.key}
              type="button"
              role="menuitem"
              aria-label={target.label}
              disabled={target.disabled}
              className={styles.target}
              style={
                {
                  ...at(-Math.PI / 2 + (index * 2 * Math.PI) / targets.length, radius),
                  '--target-size': `${disc}px`,
                  '--order': index,
                } as CSSProperties
              }
              onClick={target.onSelect}
              data-point={`target:${target.key}`}
              onPointerMove={onPoint}
              onPointerLeave={unpoint}
              onFocus={() => setCaption({ text: target.name })}
            >
              {target.face}
            </button>
          ))}
        </>
      )}
      <span className={styles.caption} style={captionStyle} data-tone={caption?.tone} aria-hidden>
        <span>{caption?.text ?? hub}</span>
        {caption?.shortcut && <Kbd>{caption.shortcut}</Kbd>}
      </span>
    </div>,
    document.body
  );
}
