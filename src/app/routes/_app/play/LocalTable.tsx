import type { DraftVariant } from './drafting-prototype/fixture';
import { useDraftingPrototype } from './drafting-prototype/DraftingPrototype';
import { GameTable } from './GameTable';
import type { TableSeatCount } from './tableSettings';
import { TabletopProvider } from './TabletopContext';
import './dune-play.css';

/** The local fixture has no connection, identity selection or persisted game data. */
export default function LocalTable({
  seatCount,
  draftingVariant,
}: Readonly<{ seatCount: TableSeatCount; draftingVariant?: DraftVariant }>) {
  /* PROTOTYPE (#1142): a drafting overlay variant when ?variant= is present. */
  const drafting = useDraftingPrototype(draftingVariant);
  return (
    <TabletopProvider>
      <GameTable
        seatCount={seatCount}
        overlay={drafting?.overlay}
        panelContent={drafting?.panelContent}
        sceneExtras={drafting?.sceneExtras}
        hidePieces={drafting?.hidePieces}
      />
    </TabletopProvider>
  );
}
