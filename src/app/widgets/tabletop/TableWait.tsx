import { Group, Text } from '@mantine/core';
import { DarkSchemeIsland, darkSchemeIslandAttributes } from '@ui/surface/DarkSchemeIsland';
import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useLayoutEffect, useState } from 'react';

import { arriveDirectly, endDeparture } from '@app/shell/voyage';
import { useMotionAllowed } from '@app/styles/motion';

import styles from './TableWait.module.css';

/*
 * Every wait mounts its own frame (the access answer, the table chunk, the connection, the renderer), so the moons key their
 * orbits to the page's clock rather than to their own mount: the next frame picks the motion up where the last one left it.
 */
const now = () => (typeof performance === 'undefined' ? 0 : performance.now());
const pageClock = () => -Math.round(now());

/*
 * The frames the waits mount one after another read as one: a frame that follows another (still mounted, or gone within a moment)
 * carries on rather than arriving, so its moons do not fade in again and a status line it repeats does not ease in again.
 */
const CARRY_ON_MS = 1500;
const frames = { mounted: 0, leftAt: Number.NEGATIVE_INFINITY, status: null as string | null };
const followsAnotherFrame = () => frames.mounted > 0 || now() - frames.leftAt < CARRY_ON_MS;

/**
 * The one frame a table route shows while anything is still on its way: the access answer, the table chunk, the connection, the admission.
 * Every wait is a different line of text in the same frame, so the visitor sees one page filling in, not a sequence of pages.
 * The frame is see-through: it marks the page as on its way to a table (`data-voyage`), and the app's own planet rises from the foot of the page to the frame's centre.
 * Its two moons circle that planet here, and the table later opens out of it.
 * `connection` stamps the subscription status the browser verification waits on;
 * `children` are the controls that stay reachable while waiting (the way back to the lobby, a sign-in link).
 */
export function TableWait({
  status,
  connection,
  children,
}: Readonly<{ status: ReactNode; connection?: string; children?: ReactNode }>) {
  const motion = useMotionAllowed();
  const [clock] = useState(pageClock);
  const [carriesOn] = useState(followsAnotherFrame);
  const [repeated] = useState(() => carriesOn && typeof status === 'string' && status === frames.status);
  /*
   * The frame carries the voyage from here on, so the departing page's document mark can go.
   * A first frame that nothing departed into (a direct link, a reload) puts the planet in the centre at once rather than raising it.
   */
  useLayoutEffect(() => {
    const departed = document.documentElement.dataset.voyage === 'departing';
    endDeparture();
    if (!departed && !carriesOn) {
      arriveDirectly();
    }
  }, [carriesOn]);
  useEffect(() => {
    frames.mounted += 1;
    return () => {
      frames.mounted -= 1;
      frames.leftAt = now();
    };
  }, []);
  useEffect(() => {
    frames.status = typeof status === 'string' ? status : null;
  }, [status]);
  return (
    <DarkSchemeIsland>
      <div
        className={styles.loading}
        {...darkSchemeIslandAttributes}
        data-voyage="waiting"
        data-connection={connection}
        data-still={!motion || undefined}
        data-carries-on={carriesOn || undefined}
        style={{ '--wait-clock': `${clock}ms` } as CSSProperties}
      >
        <div className={styles.orrery} aria-hidden>
          <div className={styles.orbit} data-orbit="near">
            <span className={styles.moon} />
          </div>
          <div className={styles.orbit} data-orbit="far">
            <span className={styles.moon} />
          </div>
        </div>
        <Text
          component="div"
          key={typeof status === 'string' ? status : 'notice'}
          role="status"
          className={typeof status === 'string' ? styles.status : styles.notice}
          data-repeated={repeated || undefined}
        >
          {status}
        </Text>
        {children && (
          <Group justify="center" gap="sm" className={styles.controls}>
            {children}
          </Group>
        )}
      </div>
    </DarkSchemeIsland>
  );
}
