import { Group, Text } from '@mantine/core';
import { DarkSchemeIsland, darkSchemeIslandAttributes } from '@ui/surface/DarkSchemeIsland';
import type { CSSProperties, ReactNode } from 'react';
import { useState } from 'react';

import { useMotionAllowed } from '@app/styles/motion';

import styles from './TableWait.module.css';

/*
 * Every wait mounts its own frame (the access answer, the table chunk, the connection, the renderer), so the moons key their
 * orbits to the page's clock rather than to their own mount: the next frame picks the motion up where the last one left it.
 */
const pageClock = () => (typeof performance === 'undefined' ? 0 : -Math.round(performance.now()));

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
  return (
    <DarkSchemeIsland>
      <div
        className={styles.loading}
        {...darkSchemeIslandAttributes}
        data-voyage="waiting"
        data-connection={connection}
        data-still={!motion || undefined}
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
        >
          {status}
        </Text>
        {children && (
          <Group justify="center" gap="sm">
            {children}
          </Group>
        )}
      </div>
    </DarkSchemeIsland>
  );
}
