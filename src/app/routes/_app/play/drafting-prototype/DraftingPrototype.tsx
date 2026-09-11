/* PROTOTYPE (#1142, #1143, #1144, #1145): binds the variants to shared in-memory state. Throwaway; lives on the prototype branch only. See README.md. */
import { useReducer } from 'react';
import type { ReactNode } from 'react';

import { DraftingOverlay } from './DraftingOverlay';
import { DraftingPanel } from './DraftingPanel';
import { reduceDraft, scenarioState } from './fixture';
import type { DraftVariant, Scenario } from './fixture';
import { PrototypeSwitcher } from './PrototypeSwitcher';
import { ShelfPanel } from './ShelfPanel';
import { SidecarPanel } from './SidecarPanel';
import { INITIAL_SWAP, reduceSwap } from './swapping';
import { SwappingPanel } from './SwappingPanel';
import { SwapScene3D } from './SwapScene3D';
import { TabsPanel } from './TabsPanel';
import './drafting-prototype.css';

export type DraftingSlots = { overlay: ReactNode; panelContent: ReactNode; sceneExtras?: ReactNode; hidePieces?: boolean };

export function useDraftingPrototype(variant: DraftVariant | undefined, scenario: Scenario = 'drafting'): DraftingSlots | null {
  const [draft, dispatchDraft] = useReducer(reduceDraft, scenario, scenarioState);
  const [swap, dispatchSwap] = useReducer(reduceSwap, INITIAL_SWAP);
  if (draft.scenario !== scenario) {
    /* ?scenario= changed: reload the fixture in this render, the way React derives state from a prop without an effect. */
    dispatchDraft({ type: 'load', scenario });
  }
  const overlay = <DraftingOverlay state={draft} dispatch={dispatchDraft} />;
  switch (variant) {
    case 'drafting':
      /* Accepted variant D: the ledger overlay on the table, the faction list in the panel. */
      return {
        overlay: (
          <>
            {overlay}
            <PrototypeSwitcher current="drafting" scenario={scenario} name="Drafting: ledger overlay on the table, faction list in the panel" />
          </>
        ),
        panelContent: <DraftingPanel state={draft} dispatch={dispatchDraft} />,
      };
    case 'swapping':
      /* Accepted variants E and K: the seat card and roster in the panel, tokens and flowing chevrons in the scene, an empty table. */
      return {
        overlay: <PrototypeSwitcher current="swapping" name="Swapping: seat card and roster, chevrons arching between token rims" />,
        panelContent: <SwappingPanel state={swap} dispatch={dispatchSwap} />,
        sceneExtras: <SwapScene3D state={swap} />,
        hidePieces: true,
      };
    /* #1145: three arrangements of the creation and drafting panel, each under the settled overlay D. */
    case 'sidecar':
      return {
        overlay: (
          <>
            {overlay}
            <PrototypeSwitcher current="sidecar" scenario={scenario} name="Sidecar: your seat, draft and Ready beside the faction list" />
          </>
        ),
        panelContent: <SidecarPanel state={draft} dispatch={dispatchDraft} />,
      };
    case 'tabs':
      return {
        overlay: (
          <>
            {overlay}
            <PrototypeSwitcher current="tabs" scenario={scenario} name="Tabs: Factions, Your draft and Seats; gates and Ready in a footer" />
          </>
        ),
        panelContent: <TabsPanel state={draft} dispatch={dispatchDraft} />,
      };
    case 'shelf':
      return {
        overlay: (
          <>
            {overlay}
            <PrototypeSwitcher current="shelf" scenario={scenario} name="Shelf: your draft on one shelf above a grid of faction tiles" />
          </>
        ),
        panelContent: <ShelfPanel state={draft} dispatch={dispatchDraft} />,
      };
    default:
      return null;
  }
}
