import type { DraftVariant, Scenario } from './drafting-prototype/fixture';
import { useDraftingPrototype } from './drafting-prototype/DraftingPrototype';
import { GameTable } from './GameTable';
import type { TableSeatCount } from './tableSettings';
import { TabletopProvider } from './TabletopContext';
import './dune-play.css';

/** The local fixture has no connection, identity selection or persisted game data. */
export default function LocalTable({
  seatCount,
  draftingVariant,
  draftingScenario,
}: Readonly<{ seatCount: TableSeatCount; draftingVariant?: DraftVariant; draftingScenario?: Scenario }>) {
  /* PROTOTYPE (#1142, #1145): a prototype variant when ?variant= is present, in the fixture state ?scenario= names. */
  const drafting = useDraftingPrototype(draftingVariant, draftingScenario);
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
