import { useLayoutEffect, useState } from 'react';

import type { TableSession } from '@db/tabletop/TableSession';
import { PointerSession } from '@app/widgets/tabletop/PointerSession';
import { PointerSessionContext } from '@app/widgets/tabletop/PointerSessionContext';
import { TableKeyboard } from '@app/widgets/tabletop/TableKeyboard';
import { TableKeyboardContext } from '@app/widgets/tabletop/TableKeyboardContext';
import { TabletopSessionProvider, useTabletopReader } from '@app/widgets/tabletop/TabletopContext';
import { TabletopPreviewContents } from '@app/widgets/tabletop/TabletopScene';

function KeyboardBinding({ keyboard }: { keyboard: TableKeyboard }) {
  const read = useTabletopReader();
  useLayoutEffect(
    () =>
      keyboard.bind({
        events: window,
        read: () => {
          const table = read();
          return {
            ...table,
            canHandleTable:
              table.canHandleTable && (table.hoveredPieceId !== null || table.gestureActivePieceId !== null),
          };
        },
      }),
    [keyboard, read]
  );
  return null;
}

export default function LiveControls({ session, onReady }: { session: TableSession; onReady(): void }) {
  const [pointer] = useState(() => new PointerSession());
  const [keyboard] = useState(() => new TableKeyboard());
  useLayoutEffect(onReady, [onReady]);
  return (
    <PointerSessionContext value={pointer}>
      <TableKeyboardContext value={keyboard}>
        <TabletopSessionProvider session={session}>
          <KeyboardBinding keyboard={keyboard} />
          <TabletopPreviewContents />
        </TabletopSessionProvider>
      </TableKeyboardContext>
    </PointerSessionContext>
  );
}
