/* PROTOTYPE (#1142, #1143, #1144, #1145): binds the variants to shared in-memory state. Throwaway; lives on the prototype branch only. See README.md. */
import { useReducer } from 'react';
import type { ReactNode } from 'react';

import { DraftingOverlay } from './DraftingOverlay';
import { DraftingPanel } from './DraftingPanel';
import { reduceDraft, scenarioState } from './fixture';
import type { DraftVariant, Scenario } from './fixture';
import { DraftingHeader, TokenGallery } from './parts';
import { PrototypeSwitcher } from './PrototypeSwitcher';
import { INITIAL_SWAP, reduceSwap } from './swapping';
import { SwappingPanel } from './SwappingPanel';
import { SwapScene3D } from './SwapScene3D';
import './drafting-prototype.css';

export type DraftingSlots = { overlay: ReactNode; panelContent: ReactNode; headerCentre?: ReactNode; sceneExtras?: ReactNode; hidePieces?: boolean };

export function useDraftingPrototype(variant: DraftVariant | undefined, scenario: Scenario = 'drafting'): DraftingSlots | null {
  const [draft, dispatchDraft] = useReducer(reduceDraft, scenario, scenarioState);
  const [swap, dispatchSwap] = useReducer(reduceSwap, INITIAL_SWAP);
  if (draft.scenario !== scenario) {
    /* ?scenario= changed: reload the fixture in this render, the way React derives state from a prop without an effect. */
    dispatchDraft({ type: 'load', scenario });
  }
  switch (variant) {
    case 'drafting':
      /* Accepted variant D, refined: the ledger overlay on the table, the statistics in the page header, the faction list with the seat bar in the panel. */
      return {
        overlay: (
          <>
            <DraftingOverlay state={draft} dispatch={dispatchDraft} />
            <PrototypeSwitcher current="drafting" scenario={scenario} name="Drafting: ledger overlay on the table, statistics in the header, faction list in the panel" />
          </>
        ),
        panelContent: <DraftingPanel state={draft} dispatch={dispatchDraft} />,
        headerCentre: <DraftingHeader state={draft} />,
      };
    case 'swapping':
      /* Accepted variants E and K: the seat card and roster in the panel, real token faces and flowing chevrons in the scene, an empty table. */
      return {
        overlay: <PrototypeSwitcher current="swapping" name="Swapping: seat card and roster, chevrons arching between token rims" />,
        panelContent: <SwappingPanel state={swap} dispatch={dispatchSwap} />,
        sceneExtras: <SwapScene3D state={swap} />,
        hidePieces: true,
      };
    case 'tokens':
      /* The capture gallery: every real token face at 512px, shot into ./tokens by the script named in the README. */
      return {
        overlay: (
          <>
            <TokenGallery />
            <PrototypeSwitcher current="tokens" name="Tokens: the real faces at 512px, for capture" />
          </>
        ),
        panelContent: <div />,
        hidePieces: true,
      };
    default:
      return null;
  }
}
