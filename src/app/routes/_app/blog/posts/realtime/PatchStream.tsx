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
  {
    label: '44 → 45',
    kind: 'patch',
    from: 'room',
    note: 'gap: 44 never came',
    revision: 43,
  },
  {
    label: 'sync',
    kind: 'sync',
    from: 'browser',
    note: 'commands wait',
    revision: 43,
  },
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
  {
    label: 'First full view of a test table',
    bytes: FULL_VIEW,
    value: '24 KB',
  },
  {
    label: 'Dropping a stack of 100 cards, before',
    bytes: 21_680,
    waste: { share: 0.95, label: 'unchanged card data' },
    value: '21 KB',
  },
  {
    label: 'Dropping a stack of 100 cards, now',
    bytes: null,
    value: 'only the piece id, position, rotation, zone and flip count',
  },
  {
    label: 'One cursor move',
    bytes: 495,
    trimmed: 365,
    value: '0.5 KB, then 0.4 KB without its unchanged snapshot',
  },
];

/** How many packets have left the room by this step; the one with that index is in the air. */
function sentBy(step: number) {
  return Math.min(step, PACKETS.length);
}

const KIND_LABEL: Record<Packet['kind'], string> = {
  patch: 'update',
  full: 'the whole table',
  sync: 'browser asks',
};

/** The classes for a packet on the wire: its kind, its direction and how it flies. */
function packetClasses(packet: Packet, state: 'flying' | 'lost') {
  const flight = packet.lost ? styles.flyingLost : styles.flying;
  return clsx(
    styles.packet,
    packet.kind === 'sync' && styles.syncPacket,
    packet.kind === 'full' && styles.fullPacket,
    packet.from === 'browser' && styles.backward,
    state === 'flying' ? flight : styles.lostRest
  );
}

function PacketCard({ packet, state }: { packet: Packet; state: PacketState }) {
  if (state === 'landed' || state === 'waiting') {
    return null;
  }
  return (
    <span className={packetClasses(packet, state)} aria-hidden="true">
      <span className={styles.packetKind}>{KIND_LABEL[packet.kind]}</span>
      <span className={styles.packetLabel}>{packet.label}</span>
      {packet.lost ? <span className={styles.lostLabel}>lost on the way</span> : null}
    </span>
  );
}

type PacketState = 'waiting' | 'flying' | 'landed' | 'lost';

/** Where one packet stands at this step: still to leave, in the air, arrived, or lost on the way. */
function packetState(index: number, flying: number | null, sent: number, packet: Packet): PacketState {
  if (index === flying) {
    return 'flying';
  }
  if (index >= sent) {
    return 'waiting';
  }
  return packet.lost ? 'lost' : 'landed';
}

const isGap = (packet: Packet) => Boolean(packet.note?.startsWith('gap'));

/** What the figure shows at one step: the packet in the air, what the browser holds and where each end stands. */
function streamAt(step: number) {
  const sent = sentBy(step);
  const flying = step >= 1 && step <= PACKETS.length ? step - 1 : null;
  const arrived = flying === null ? sent : sent - 1;
  /* What the browser holds: every packet that has finished its flight, the lost one excepted. */
  const landed = PACKETS.slice(0, Math.max(0, arrived)).filter((packet) => !packet.lost);
  return {
    sent,
    flying,
    held: new Set(landed),
    revision: landed.at(-1)?.revision ?? 41,
    roomRevision: sent === 0 ? 41 : ROOM_AT[sent - 1]!,
    /* From the gap until the full view, the browser holds its commands. */
    holding: landed.some(isGap) && !landed.some((packet) => packet.kind === 'full'),
  };
}

/** The browser's log: every packet it will ever hold, the ones still to come kept invisible, so the box never changes height during the loop. */
function BrowserLog({ held }: { held: ReadonlySet<Packet> }) {
  return (
    <ol className={styles.log}>
      {PACKETS.filter((packet) => !packet.lost).map((packet) => (
        <li
          key={packet.label}
          className={clsx(
            styles.logEntry,
            isGap(packet) && styles.logGap,
            packet.kind === 'full' && styles.logFull,
            !held.has(packet) && styles.logPending
          )}
        >
          <span>{packet.kind === 'sync' ? 'sent sync' : packet.label}</span>
          {packet.note ? <span className={styles.logNote}>{packet.note}</span> : null}
        </li>
      ))}
    </ol>
  );
}

function BarShape({ bar, bytes }: { bar: Bar; bytes: number }) {
  return (
    <span className={styles.bar} style={{ '--share': bytes / FULL_VIEW } as CSSProperties}>
      <span className={styles.fill}>
        {bar.trimmed ? (
          <span className={styles.trim} style={{ '--share': bar.trimmed / bytes } as CSSProperties} />
        ) : null}
      </span>
      {bar.waste ? (
        <span className={styles.waste} style={{ '--share': bar.waste.share } as CSSProperties}>
          <span className={styles.wasteFill} />
          <span className={styles.wasteLabel}>{bar.waste.label}</span>
        </span>
      ) : null}
    </span>
  );
}

/** The sizes measured in September, each as a share of the first full view. */
function SizeChart() {
  return (
    <dl className={styles.chart}>
      {BARS.map((bar, index) => (
        <div key={bar.label} className={styles.barRow} style={{ '--row': index } as CSSProperties}>
          <dt className={styles.barLabel}>{bar.label}</dt>
          <dd className={styles.barCell}>
            {bar.bytes === null ? <span className={styles.barUnknown} /> : <BarShape bar={bar} bytes={bar.bytes} />}
            <span className={styles.value}>{bar.value}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function PatchStream() {
  const rootRef = useRef<HTMLDivElement>(null);
  const { step, armed, seen } = useSteps(rootRef, TOTAL, {
    interval: STEP_MS,
    loop: true,
    pause: 4,
  });
  const { sent, flying, held, revision, roomRevision, holding } = streamAt(step);

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
          {PACKETS.map((packet, index) => (
            <PacketCard key={packet.label} packet={packet} state={packetState(index, flying, sent, packet)} />
          ))}
        </div>

        <div className={clsx(styles.box, styles.browser)}>
          <span className={styles.browserBar} />
          <span className={styles.boxLabel}>your browser</span>
          <span className={styles.revision}>at {revision}</span>
          <BrowserLog held={held} />
          {/* Both notes are laid out in the same place, the other invisible, so the box keeps one height whichever is showing. */}
          <span className={styles.boxNotes}>
            <span className={clsx(styles.boxNote, holding && styles.noteHidden)}>applies each patch to the last</span>
            <span className={clsx(styles.boxNote, styles.holding, !holding && styles.noteHidden)}>
              waiting for a full view
            </span>
          </span>
        </div>
      </div>

      <SizeChart />
    </div>
  );
}
