import { Group, Text } from '@mantine/core';
import { DarkSchemeIsland, darkSchemeIslandAttributes } from '@ui/surface/DarkSchemeIsland';
import type { CSSProperties, ReactNode } from 'react';
import { useState } from 'react';

import { useMotionAllowed } from '@app/styles/motion';

import styles from './TableWait.module.css';
import { TableWaitArt } from './TableWaitArt';
import type { TableWaitLook } from './TableWaitArt';

/*
 * Every wait mounts its own frame (the access answer, the table chunk, the connection, the renderer), so the art keys its
 * animations to the page's clock rather than to its own mount: the next frame picks the motion up where the last one left it.
 */
const pageClock = () => (typeof performance === 'undefined' ? 0 : -Math.round(performance.now()));

/**
 * The one frame a table route shows while anything is still on its way: the access answer, the table chunk, the connection, the admission.
 * Every wait is a different line of text in the same near-black frame, so the visitor sees one page filling in, not a sequence of pages.
 * The status line is keyed on its text so a change eases in, and the frame carries the one moving thing, its art (#1270).
 * `connection` stamps the subscription status the browser verification waits on;
 * `children` are the controls that stay reachable while waiting (the way back to the lobby, a sign-in link).
 */
export function TableWait({
  status,
  connection,
  look = 'pool',
  children,
}: Readonly<{ status: ReactNode; connection?: string; look?: TableWaitLook; children?: ReactNode }>) {
  const motion = useMotionAllowed();
  const [clock] = useState(pageClock);
  return (
    <DarkSchemeIsland>
      <div
        className={styles.loading}
        {...darkSchemeIslandAttributes}
        data-connection={connection}
        data-look={look}
        data-still={!motion || undefined}
        style={{ '--wait-clock': `${clock}ms` } as CSSProperties}
      >
        <TableWaitArt look={look} />
        <Text
          component="div"
          key={typeof status === 'string' ? status : 'notice'}
          role="status"
          className={styles.status}
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
