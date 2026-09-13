/* Read-only current-table context for the history comparison, never a historical replay. */
import { TABLE_PHASES } from '@shared/play/phases';

import { TabletopProvider } from '../TabletopContext';
import { TabletopScene } from '../TabletopScene';
import '../dune-play.css';

export default function TablePreview() {
  return (
    <TabletopProvider>
      <TabletopScene
        mode="seated"
        interaction="drag"
        seatCount={6}
        hidePieces
        tableProgress={{ turn: 3, phases: TABLE_PHASES, activePhaseId: 'spice-collection' }}
      />
    </TabletopProvider>
  );
}
