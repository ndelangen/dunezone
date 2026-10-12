import { VisuallyHidden } from '@mantine/core';
import clsx from 'clsx';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';

import styles from './RadialMenu.module.css';
import { HOLD_SECONDS, useHoldToConfirm } from './useHoldToConfirm';

type RadialIcon = 'peek' | 'draw' | 'deal' | 'shuffle' | 'reserve' | 'delete' | 'back';

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

function at(angle: number, radius: number): CSSProperties {
  return { left: Math.cos(angle) * radius, top: Math.sin(angle) * radius };
}

function Glyph({ icon }: Readonly<{ icon: RadialIcon }>) {
  return (
    <svg className={styles.glyph} viewBox="0 0 24 24" aria-hidden>
      {ICONS[icon]}
    </svg>
  );
}

type Caption = { text: string; shortcut?: string; tone?: 'danger' };

function HeldItem({
  action,
  style,
  hidden,
  onCaption,
}: Readonly<{
  action: RadialAction;
  style: CSSProperties;
  hidden: boolean;
  onCaption: (caption: Caption | null) => void;
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
      onPointerEnter={() => onCaption({ text: action.label, tone: 'danger' })}
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
  return centre.top > window.innerHeight / 2
    ? { top: -offset, translate: '-50% -100%' }
    : { top: offset, translate: '-50% 0' };
}

/* Keeps a value between two bounds; when they cross, the lower bound wins. */
function clamp(value: number, low: number, high: number) {
  return Math.max(low, Math.min(value, high));
}

/* How long the pointer rests on an item with choices before the ring steps into it. */
const STEP_IN_MS = 450;

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
  const restTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const level = actions.find((action) => action.key === steppedInto && action.targets);
  const targets = level?.targets ?? [];
  const { disc, radius } = targetRing(targets.length);
  /* A big choice ring needs more room than the first ring, so the centre keeps the whole ring on screen. */
  const reach = level ? radius + disc / 2 + 12 : 0;
  const centre = {
    left: clamp(x, Math.max(EDGE.side, reach), window.innerWidth - Math.max(EDGE.side, reach)),
    top: clamp(y, Math.max(EDGE.top, reach), window.innerHeight - Math.max(EDGE.bottom, reach)),
  };

  const cancelRest = () => {
    if (restTimer.current) {
      clearTimeout(restTimer.current);
      restTimer.current = null;
    }
  };
  useEffect(() => cancelRest, []);

  const stepInto = (action: RadialAction) => {
    cancelRest();
    setSteppedInto(action.key);
    setCaption({ text: action.targetsLabel ?? action.label });
    /* The item that had focus hides, so focus stays on the ring for the arrow keys and Escape. */
    menu.current?.focus({ preventScroll: true });
  };
  const stepOut = () => {
    setSteppedInto(null);
    setCaption(null);
    menu.current?.focus({ preventScroll: true });
  };

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
      className={styles.ring}
      style={centre}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => {
        event.preventDefault();
        if (level) {
          stepOut();
        }
      }}
      onPointerLeave={() => {
        cancelRest();
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
          style={at(slotAngle(slot), RING_RADIUS)}
          onClick={() => (action.targets ? stepInto(action) : action.onSelect?.())}
          onPointerEnter={() => {
            setCaption({ text: action.label, shortcut: action.shortcut });
            if (action.targets && !action.disabled) {
              cancelRest();
              restTimer.current = setTimeout(() => stepInto(action), STEP_IN_MS);
            }
          }}
          onPointerLeave={cancelRest}
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
          style={at(slotAngle(SLOTS - 1), RING_RADIUS)}
          onCaption={setCaption}
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
            onPointerEnter={() => setCaption({ text: 'Back', shortcut: 'Esc' })}
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
                  animationDelay: `${index * 12}ms`,
                } as CSSProperties
              }
              onClick={target.onSelect}
              onPointerEnter={() => setCaption({ text: target.name })}
              onFocus={() => setCaption({ text: target.name })}
            >
              {target.face}
            </button>
          ))}
        </>
      )}
      <span className={styles.caption} style={captionStyle} data-tone={caption?.tone} aria-hidden>
        <span>{caption?.text ?? hub}</span>
        {caption?.shortcut && <kbd className={styles.key}>{caption.shortcut}</kbd>}
      </span>
    </div>,
    document.body
  );
}
