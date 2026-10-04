/* One interactive spike: can the real Play renderer make a shared homepage sandbox inviting? */
import { Button, Text } from '@mantine/core';
import { tableProgressFor } from '@shared/play/phases';
import { useEffect, useState, useSyncExternalStore } from 'react';

import { PointerSession } from '../play/PointerSession';
import { PointerSessionContext } from '../play/PointerSessionContext';
import { TableKeyboard } from '../play/TableKeyboard';
import { TableKeyboardContext } from '../play/TableKeyboardContext';
import { TabletopSessionProvider } from '../play/TabletopContext';
import { TabletopScene } from '../play/TabletopScene';
import styles from './live.module.css';
import { DemoRoom } from './room';

export default function ConnectedDemo({ member }: { member: boolean }) {
  'use no memo';
  const [room] = useState(
    () => new DemoRoom(member, new URLSearchParams(location.search).get('name') || (member ? 'Paul' : 'Visitor'))
  );
  const [pointer] = useState(() => new PointerSession());
  const [keyboard] = useState(() => new TableKeyboard());
  const table = useSyncExternalStore(room.subscribeTable, room.getTable);
  const [ready, setReady] = useState(false);
  const [start] = useState(performance.now());
  const [ms, setMs] = useState(0);
  useEffect(() => room.connect(), [room]);
  return (
    <>
      <PointerSessionContext value={pointer}>
        <TableKeyboardContext value={keyboard}>
          <TabletopSessionProvider session={room.asSession()}>
            <TabletopScene
              className={styles.scene}
              stage="play"
              tableProgress={tableProgressFor(0)}
              onSceneReady={() => {
                setReady(true);
                setMs(Math.round(performance.now() - start));
              }}
            />
          </TabletopSessionProvider>
        </TableKeyboardContext>
      </PointerSessionContext>
      <div className={styles.status}>
        <Text size="xs">
          {ready
            ? `${room.visitors} here · ${table.renderedPieces.length} pieces · revision ${room.revision} · ready in ${ms} ms`
            : 'Opening the real 3D table…'}
        </Text>
        {room.error && <Text size="xs">{room.error}</Text>}
        {member && (
          <Button variant="subtle" size="compact-xs" onClick={() => room.send({ type: 'reset' })}>
            Reset demo
          </Button>
        )}
      </div>
    </>
  );
}
