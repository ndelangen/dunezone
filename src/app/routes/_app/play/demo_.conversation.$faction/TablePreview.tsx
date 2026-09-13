/* Read-only table context for the conversation comparison. */
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
        cameraView={{ view: 'map', revision: 0 }}
        hidePieces
        tableProgress={{ turn: 3, phases: TABLE_PHASES, activePhaseId: 'spice-collection' }}
      />
    </TabletopProvider>
  );
}
