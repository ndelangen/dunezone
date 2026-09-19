import { Text } from '@mantine/core';
import type { ReactNode } from 'react';

import { DarkSchemeIsland, darkSchemeIslandAttributes } from './DarkSchemeIsland';
import styles from './TableWait.module.css';

/**
 * The one frame a table route shows while anything is still on its way: the access answer, the table chunk, the connection, the admission.
 * Every wait is a different line of text in the same near-black frame, so the visitor sees one page filling in, not a sequence of pages.
 * The status line is keyed on its text so a change eases in, and the frame's ground carries the one moving thing, a breathing pool of light (#1270).
 * `connection` stamps the subscription status the browser verification waits on;
 * `children` are the controls that stay reachable while waiting (the way back to the lobby, a sign-in link).
 */
export function TableWait({
  status,
  connection,
  children,
}: Readonly<{ status: string; connection?: string; children?: ReactNode }>) {
  return (
    <DarkSchemeIsland>
      <div className={styles.loading} {...darkSchemeIslandAttributes} data-connection={connection}>
        <Text key={status} role="status" className={styles.status}>
          {status}
        </Text>
        {children}
      </div>
    </DarkSchemeIsland>
  );
}
