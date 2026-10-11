/* @jsxImportSource ./three-jsx */
import { Html } from '@react-three/drei/webgpu';
import { useThree } from '@react-three/fiber/webgpu';
import type { TablePing } from '@shared/play/protocol';
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

import { playPingSound } from './pingSound';
import styles from './ScenePings.module.css';
import { useTabletopActions } from './TabletopContext';

const PING_HTML_STYLE = { pointerEvents: 'none' } as const;
/* Above the hands, which sit in 0 to 6. */
const PING_Z_RANGE = [8, 7];
/* How long a ping stays on the table: its rings and its dot have played out by then. */
const PING_SHOWN_MS = 1700;
/* A table full of players pinging at once shows the newest this many. */
const MOST_PINGS = 24;

type ShownPing = TablePing & { key: number };

/** Every ping at the table, this page's own included, as rings in the pinger's colour where their cursor was, with a sound. */
export function ScenePings() {
  const { subscribePings } = useTabletopActions();
  const invalidate = useThree((state) => state.invalidate);
  const [pings, setPings] = useState<ShownPing[]>([]);
  useEffect(() => {
    let next = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const stop = subscribePings((ping) => {
      const key = next++;
      playPingSound();
      setPings((shown) => [...shown.slice(1 - MOST_PINGS), { ...ping, key }]);
      const timer = setTimeout(() => {
        timers.delete(timer);
        setPings((shown) => shown.filter((candidate) => candidate.key !== key));
      }, PING_SHOWN_MS);
      timers.add(timer);
    });
    return () => {
      stop();
      timers.forEach(clearTimeout);
    };
  }, [subscribePings]);
  /* The scene draws on demand, so a new ping asks for the frame that places it. */
  useEffect(() => {
    invalidate();
  }, [invalidate, pings]);
  return (
    <>
      {pings.map((ping) => (
        <group key={ping.key} position={ping.position}>
          <Html zIndexRange={PING_Z_RANGE} style={PING_HTML_STYLE}>
            <PingMarker color={ping.color} />
          </Html>
        </group>
      ))}
    </>
  );
}

function PingMarker({ color }: { color: string }) {
  return (
    <div className={styles.ping} style={{ '--ping-color': color } as CSSProperties} data-table-ping aria-hidden="true">
      <span className={styles.ring} />
      <span className={styles.ring} />
      <span className={styles.ring} />
      <span className={styles.dot} />
    </div>
  );
}
