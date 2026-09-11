/* PROTOTYPE (#1142, #1143, #1144): binds the accepted variants to shared in-memory state. Throwaway; lives on the prototype branch only. See README.md. */
import { useReducer } from 'react';
import type { ReactNode } from 'react';

import { DraftingOverlay } from './DraftingOverlay';
import { DraftingPanel } from './DraftingPanel';
import { INITIAL_STATE, reduceDraft } from './fixture';
import type { DraftVariant } from './fixture';
import { PrototypeSwitcher } from './PrototypeSwitcher';
import { INITIAL_SWAP, reduceSwap } from './swapping';
import { SwappingPanel } from './SwappingPanel';
import { SwapScene3D } from './SwapScene3D';
import './drafting-prototype.css';

export type DraftingSlots = { overlay: ReactNode; panelContent: ReactNode; sceneExtras?: ReactNode; hidePieces?: boolean };

export function useDraftingPrototype(variant: DraftVariant | undefined): DraftingSlots | null {
  const [draft, dispatchDraft] = useReducer(reduceDraft, INITIAL_STATE);
  const [swap, dispatchSwap] = useReducer(reduceSwap, INITIAL_SWAP);
  switch (variant) {
    case 'drafting':
      /* Accepted variant D: the ledger overlay on the table, the faction list in the panel. */
      return {
        overlay: (
          <>
            <DraftingOverlay state={draft} dispatch={dispatchDraft} />
            <PrototypeSwitcher current="drafting" name="Drafting: ledger overlay on the table, faction list in the panel" />
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
    default:
      return null;
  }
}
