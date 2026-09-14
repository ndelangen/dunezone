import { MantineProvider, useComputedColorScheme } from '@mantine/core';
import { appContentTheme } from '@ui/theme';
import { useEffect } from 'react';

import { useDraftingPrototype } from './drafting-prototype/DraftingPrototype';
import type { DraftVariant } from './drafting-prototype/fixture';
import type { PrototypeScenario as Scenario } from './drafting-prototype/setup';
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
  const outerScheme = useComputedColorScheme('light');
  useEffect(
    () => () => {
      /* The local table and its document-level dropdowns use dark mode; leaving restores the application's scheme. */
      document.documentElement.setAttribute('data-mantine-color-scheme', outerScheme);
    },
    [outerScheme]
  );
  return (
    <MantineProvider theme={appContentTheme} forceColorScheme="dark" defaultColorScheme="dark">
      <TabletopProvider fixture={drafting?.tableFixture}>
        <GameTable
          seatCount={seatCount}
          overlay={drafting?.overlay}
          panelContent={drafting?.panelContent}
          headerCentre={drafting?.headerCentre}
          headerRight={drafting?.headerRight}
          sceneExtras={drafting?.sceneExtras}
          tableProgress={drafting?.tableProgress}
          hidePieces={drafting?.hidePieces}
        />
      </TabletopProvider>
    </MantineProvider>
  );
}
