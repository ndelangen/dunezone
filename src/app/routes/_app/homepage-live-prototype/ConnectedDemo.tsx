/* One interactive spike: can the real Play renderer make a shared homepage sandbox inviting? */
import { tableProgressFor } from '@shared/play/phases';
import { useEffect, useState } from 'react';

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
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const frame = document.querySelector('#play-preview > div');
    frame?.setAttribute('data-live-ready', 'true');
    return () => frame?.removeAttribute('data-live-ready');
  }, [ready]);
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
              onSceneReady={() => setReady(true)}
            />
          </TabletopSessionProvider>
        </TableKeyboardContext>
      </PointerSessionContext>
    </>
  );
}
