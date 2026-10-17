import { publishingCustomCard } from '@shared/assets/fixtures/publishingCustomCard';
import { publishingDeckCardback } from '@shared/assets/fixtures/publishingDeckCardback';
import { publishingTokenFace } from '@shared/assets/fixtures/publishingTokenFace';
import { FactionRender } from '@shared/factions/schema';
import clsx from 'clsx';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { CardBack } from '@game/assets/card/Back';
import { CustomCard } from '@game/assets/card/Custom';
import { LeaderToken } from '@game/assets/faction/leader/Leader';
import { Token } from '@game/assets/faction/token/Token';
import { TroopToken } from '@game/assets/faction/troop/Troop';
import { CustomToken } from '@game/assets/token/Custom';
import { card, disc } from '@game/data/sizes';

import styles from './FactionExtras.module.css';
import { FACTION, Scaled } from './FactionRecipe';

/*
 * The figure for a faction's extras: a deck and a token bundle made in the asset catalogue, listed by reference in the faction record, and laid out with the faction's own pieces at setup.
 * The record holds only the references, so the lines into it end on the two reference lines, and one line carries the whole faction on to the table.
 * The figure takes turns lighting the deck and the bundle, the way the main figure tours its ingredients.
 */

type ExtraId = 'deck' | 'bundle';

const { about: _about, ...cardFace } = publishingCustomCard;

/** The bundle's tokens: the publishing fixture's face with three different labels and symbols. */
const BUNDLE_TOKENS = [
  { ...publishingTokenFace, top: 'KARAMA', image: '/vector/icon/projectile.svg' },
  { ...publishingTokenFace, top: 'PRESCIENCE', image: '/vector/icon/ambassador.svg' },
  { ...publishingTokenFace, top: 'SPICE', image: '/vector/icon/projectile.svg' },
] as const;

const EXTRAS: Record<ExtraId, { label: string; reference: string; art: (scale: number) => React.ReactNode }> = {
  deck: {
    label: 'Deck: Battle reference',
    reference: 'deck/battle-reference',
    art: (scale) => (
      <span className={styles.fan}>
        <Scaled size={card} scale={scale}>
          <CardBack {...publishingDeckCardback} name="Battle reference" />
        </Scaled>
        <Scaled size={card} scale={scale}>
          <CustomCard {...cardFace} />
        </Scaled>
      </span>
    ),
  },
  bundle: {
    label: 'Token bundle: Karama tokens',
    reference: 'bundle/karama-tokens',
    art: (scale) => (
      <span className={styles.stack}>
        {BUNDLE_TOKENS.map((face) => (
          <Scaled key={face.top} size={disc} scale={scale * 0.6} round>
            <CustomToken {...face} circle />
          </Scaled>
        ))}
      </span>
    ),
  },
};

const EXTRA_ORDER: readonly ExtraId[] = ['deck', 'bundle'];
const TOUR_MS = 2600;

type Line = { key: string; d: string; extra?: ExtraId };

/** Joins two boxes: side to side when the target sits to the right, top to bottom when it sits below. */
function join(from: DOMRect, to: DOMRect, box: DOMRect): string {
  if (to.left >= from.right - 1) {
    const x1 = from.right - box.left;
    const y1 = from.top + from.height / 2 - box.top;
    const x2 = to.left - box.left;
    const y2 = to.top + to.height / 2 - box.top;
    const middle = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${middle} ${y1}, ${middle} ${y2}, ${x2} ${y2}`;
  }
  const x1 = from.left + from.width / 2 - box.left;
  const y1 = from.bottom - box.top;
  const x2 = to.left + to.width / 2 - box.left;
  const y2 = to.top - box.top;
  const middle = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${middle}, ${x2} ${middle}, ${x2} ${y2}`;
}

function measureLines(root: HTMLElement): Line[] {
  const box = root.getBoundingClientRect();
  const rect = (selector: string) => root.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
  const lines: Line[] = [];
  for (const extra of EXTRA_ORDER) {
    const from = rect(`[data-extra="${extra}"]`);
    const reference = rect(`[data-reference="${extra}"]`);
    const record = rect('[data-record]');
    /* Stacked, as on a phone, a line ends on the record's top edge rather than running through it to its reference line. */
    const to = reference && record && reference.left < (from?.right ?? 0) ? record : reference;
    if (from && to) {
      lines.push({ key: extra, extra, d: join(from, to, box) });
    }
  }
  const record = rect('[data-record]');
  const setup = rect('[data-setup]');
  if (record && setup) {
    lines.push({ key: 'setup', d: join(record, setup, box) });
  }
  return lines;
}

/** While nobody has picked anything, the figure takes turns on the deck and the bundle, as long as it is on screen. */
function useTour(rootRef: React.RefObject<HTMLElement | null>, paused: boolean) {
  const [step, setStep] = useState(-1);
  useEffect(() => {
    const root = rootRef.current;
    if (paused || !root || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    let timer: ReturnType<typeof setInterval> | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      clearInterval(timer);
      if (entry?.isIntersecting) {
        setStep((current) => (current < 0 ? 0 : current));
        timer = setInterval(() => setStep((current) => (current + 1) % EXTRA_ORDER.length), TOUR_MS);
      }
    });
    observer.observe(root);
    return () => {
      observer.disconnect();
      clearInterval(timer);
    };
  }, [rootRef, paused]);
  return step < 0 ? null : (EXTRA_ORDER[step] ?? null);
}

export function FactionExtras() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [hover, setHover] = useState<ExtraId | null>(null);
  const tour = useTour(rootRef, hover !== null);
  const lit = hover ?? tour;

  const remeasure = useCallback(() => {
    if (rootRef.current) {
      setLines(measureLines(rootRef.current));
    }
  }, []);

  useLayoutEffect(() => {
    remeasure();
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(remeasure);
    observer.observe(root);
    for (const part of root.querySelectorAll('[data-extra], [data-reference], [data-record], [data-setup]')) {
      observer.observe(part);
    }
    return () => observer.disconnect();
  }, [remeasure]);

  const lineLit = (line: Line) => lit !== null && (line.extra === lit || line.extra === undefined);
  const hoverProps = (id: ExtraId) => ({
    onPointerEnter: () => setHover(id),
    onPointerLeave: () => setHover(null),
    onFocus: () => setHover(id),
    onBlur: () => setHover(null),
  });

  const leader = FactionRender.leaders.parse(FACTION)[0];
  const troop = FactionRender.troops.parse(FACTION)[0];

  return (
    <div ref={rootRef} className={clsx(styles.root, lit && styles.focused)}>
      <svg className={styles.lines} aria-hidden>
        {lines.map((line) => (
          <path key={line.key} d={line.d} className={clsx(styles.line, lineLit(line) && styles.lit)} />
        ))}
      </svg>

      <div className={clsx(styles.column, styles.catalogue)}>
        <p className={styles.title}>Asset catalogue</p>
        {EXTRA_ORDER.map((id) => (
          <button
            key={id}
            type="button"
            className={clsx(styles.item, lit === id && styles.litItem)}
            data-extra={id}
            {...hoverProps(id)}
          >
            <span className={styles.art}>{EXTRAS[id].art(1)}</span>
            <span className={styles.label}>{EXTRAS[id].label}</span>
          </button>
        ))}
      </div>

      <div className={styles.record} data-record>
        <p className={styles.recordSmall}>FACTION RECORD</p>
        <p className={styles.recordTitle}>HOUSE {FACTION.name.toUpperCase()}</p>
        <p className={styles.recordLine}>name · logo · colours · leaders · troops · rules</p>
        <p className={styles.recordSmall}>EXTRAS</p>
        {EXTRA_ORDER.map((id) => (
          <p key={id} className={clsx(styles.reference, lit === id && styles.litReference)} data-reference={id}>
            {EXTRAS[id].reference}
          </p>
        ))}
      </div>

      <div className={styles.column} data-setup>
        <p className={styles.title}>At setup</p>
        <div className={styles.tray}>
          <span className={styles.trayRow}>
            {leader && (
              <Scaled size={disc} scale={0.55} round>
                <LeaderToken {...leader} />
              </Scaled>
            )}
            {troop && (
              <Scaled size={disc} scale={0.4} round>
                <TroopToken {...troop} />
              </Scaled>
            )}
            <Scaled size={disc} scale={0.6} round>
              <Token {...FactionRender.token.parse(FACTION)} />
            </Scaled>
          </span>
          <span className={styles.trayRule}>+ extras</span>
          <span className={styles.trayRow}>
            {EXTRA_ORDER.map((id) => (
              <span key={id} className={clsx(styles.extra, lit === id && styles.litItem)}>
                {EXTRAS[id].art(0.7)}
              </span>
            ))}
          </span>
        </div>
        <p className={styles.label}>The faction's own pieces, with its extras alongside</p>
      </div>
    </div>
  );
}
