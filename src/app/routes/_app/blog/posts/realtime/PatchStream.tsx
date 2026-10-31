import clsx from 'clsx';
import { useRef } from 'react';
import type { CSSProperties } from 'react';

import styles from './PatchStream.module.css';
import { useSteps } from './useSteps';

/*
 * The figure for how a browser is kept in step: the room sends its changes as numbered patches along a wire, and one of them is lost on the way.
 * Each patch is built on the last frame the browser received (`baseSequence` to `sequence`), so when 44 → 45 arrives after 43 → 44 was lost the browser cannot apply it.
 * It asks the room for a full view, holds its commands until that arrives, and then the patches carry on.
 * Under it, the sizes measured on a test table in September 2026, as raw JSON bytes.
 */

type Packet = {
  label: string;
  kind: 'patch' | 'sync' | 'full';
  /* Which way it travels: patches and the full view come from the room, the sync goes back. */
  from: 'room' | 'browser';
  /* The one lost patch never reaches the far end. */
  lost?: boolean;
  /* What the browser notes when it has this one. */
  note?: string;
  /* The revision the browser stands at once this one has arrived. */
  revision: number;
};

const PACKETS: readonly Packet[] = [
  { label: '41 → 42', kind: 'patch', from: 'room', revision: 42 },
  { label: '42 → 43', kind: 'patch', from: 'room', revision: 43 },
  { label: '43 → 44', kind: 'patch', from: 'room', lost: true, revision: 43 },
  { label: '44 → 45', kind: 'patch', from: 'room', note: 'gap: 44 never came', revision: 43 },
  { label: 'sync', kind: 'sync', from: 'browser', note: 'commands wait', revision: 43 },
  { label: 'full view 45', kind: 'full', from: 'room', revision: 45 },
  { label: '45 → 46', kind: 'patch', from: 'room', revision: 46 },
  { label: '46 → 47', kind: 'patch', from: 'room', revision: 47 },
];

/** The room's own revision once it has sent each packet: it is always ahead of the browser. */
const ROOM_AT = [42, 43, 44, 45, 45, 45, 46, 47] as const;

/** Each step sends one packet; the last step is the pause once every packet has landed. */
const TOTAL = PACKETS.length + 1;
const STEP_MS = 1100;

const FULL_VIEW = 24_664;

type Bar = {
  label: string;
  /* The bytes drawn, as a share of the full view; `null` is a size known only in words. */
  bytes: number | null;
  /* A share of the bar that is shaded as waste, with its name. */
  waste?: { share: number; label: string };
  /* A second, smaller bar drawn over the first for a size after a trim. */
  trimmed?: number;
  value: string;
};

const BARS: readonly Bar[] = [
  { label: 'First full view of a test table', bytes: FULL_VIEW, value: '24,664 B' },
  {
    label: 'Dropping a stack of 100 cards, before',
    bytes: 21_680,
    waste: { share: 0.95, label: 'unchanged card data' },
    value: '21,680 B',
  },
  {
    label: 'Dropping a stack of 100 cards, now',
    bytes: null,
    value: 'only the piece id, position, rotation, zone and flip count',
  },
  { label: 'One cursor move', bytes: 495, trimmed: 365, value: '495 B, then 365 B without its unchanged snapshot' },
];

/** How many packets have left the room by this step; the one with that index is in the air. */
function sentBy(step: number) {
  return Math.min(step, PACKETS.length);
}

function PacketCard({ packet, state }: { packet: Packet; state: 'waiting' | 'flying' | 'landed' | 'lost' }) {
  if (state === 'landed' || state === 'waiting') {
    return null;
  }
  return (
    <span
      className={clsx(
        styles.packet,
        packet.kind === 'sync' && styles.syncPacket,
        packet.kind === 'full' && styles.fullPacket,
        packet.from === 'browser' && styles.backward,
        state === 'flying' && (packet.lost ? styles.flyingLost : styles.flying),
        state === 'lost' && styles.lostRest
      )}
      aria-hidden="true"
    >
      <span className={styles.packetKind}>
        {packet.kind === 'patch' ? 'update' : packet.kind === 'full' ? 'the whole table' : 'browser asks'}
      </span>
      <span className={styles.packetLabel}>{packet.label}</span>
      {packet.lost ? <span className={styles.lostLabel}>lost on the way</span> : null}
    </span>
  );
}

export function PatchStream() {
  const rootRef = useRef<HTMLDivElement>(null);
  const { step, armed, seen } = useSteps(rootRef, TOTAL, { interval: STEP_MS, loop: true, pause: 4 });
  const flying = step >= 1 && step <= PACKETS.length ? step - 1 : null;
  /* What the browser holds: every packet that has finished its flight, the lost one excepted. */
  const landed = PACKETS.slice(0, Math.max(0, sentBy(step) - (flying === null ? 0 : 1))).filter(
    (packet) => !packet.lost
  );
  const last = landed.at(-1);
  const revision = last?.revision ?? 41;
  const roomRevision = sentBy(step) === 0 ? 41 : ROOM_AT[sentBy(step) - 1]!;
  /* From the gap until the full view, the browser holds its commands. */
  const holding =
    landed.some((packet) => packet.note?.startsWith('gap')) && !landed.some((packet) => packet.kind === 'full');

  return (
    <div
      ref={rootRef}
      className={clsx(styles.root, armed && !seen && styles.waiting)}
      role="group"
      aria-label="Patches travelling from the room to one browser, one lost on the way, and how big each kind is"
    >
      <div className={styles.stream}>
        <div className={clsx(styles.box, styles.room)}>
          <span className={styles.boxLabel}>room</span>
          <span className={styles.revision}>table at {roomRevision}</span>
          <span className={styles.boxNote}>sends each change as a patch</span>
        </div>

        <div className={styles.wire} aria-hidden="true">
          <span className={styles.line} />
          {PACKETS.map((packet, index) => {
            const state =
              index === flying ? 'flying' : index < sentBy(step) ? (packet.lost ? 'lost' : 'landed') : 'waiting';
            return <PacketCard key={packet.label} packet={packet} state={state} />;
          })}
        </div>

        <div className={clsx(styles.box, styles.browser)}>
          <span className={styles.browserBar} />
          <span className={styles.boxLabel}>your browser</span>
          <span className={styles.revision}>at {revision}</span>
          <ol className={styles.log}>
            {landed.map((packet) => (
              <li
                key={packet.label}
                className={clsx(
                  styles.logEntry,
                  packet.note?.startsWith('gap') && styles.logGap,
                  packet.kind === 'full' && styles.logFull
                )}
              >
                <span>{packet.kind === 'sync' ? 'sent sync' : packet.label}</span>
                {packet.note ? <span className={styles.logNote}>{packet.note}</span> : null}
              </li>
            ))}
          </ol>
          <span className={clsx(styles.boxNote, holding && styles.holding)}>
            {holding ? 'waiting for a full view' : 'applies each patch to the last'}
          </span>
        </div>
      </div>

      <dl className={styles.chart}>
        {BARS.map((bar, index) => (
          <div key={bar.label} className={styles.barRow} style={{ '--row': index } as CSSProperties}>
            <dt className={styles.barLabel}>{bar.label}</dt>
            <dd className={styles.barCell}>
              {bar.bytes === null ? (
                <span className={styles.barUnknown} />
              ) : (
                <span className={styles.bar} style={{ '--share': bar.bytes / FULL_VIEW } as CSSProperties}>
                  {bar.waste ? (
                    <span className={styles.waste} style={{ '--share': bar.waste.share } as CSSProperties}>
                      <span className={styles.wasteLabel}>{bar.waste.label}</span>
                    </span>
                  ) : null}
                  {bar.trimmed ? (
                    <span className={styles.trim} style={{ '--share': bar.trimmed / bar.bytes } as CSSProperties} />
                  ) : null}
                </span>
              )}
              <span className={styles.value}>{bar.value}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
