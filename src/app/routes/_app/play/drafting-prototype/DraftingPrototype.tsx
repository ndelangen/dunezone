/* PROTOTYPE (#1142): binds one variant's overlay and panel to shared in-memory draft state. Throwaway; lives on the prototype branch only. */
import { useReducer } from 'react';
import type { ReactNode } from 'react';

import { INITIAL_STATE, reduceDraft } from './fixture';
import type { DraftVariant } from './fixture';
import { PrototypeSwitcher } from './PrototypeSwitcher';
import { VARIANT_A } from './VariantA';
import { VARIANT_B } from './VariantB';
import { VARIANT_C, useVariantCQuery } from './VariantC';
import './drafting-prototype.css';

export type DraftingSlots = { overlay: ReactNode; panelContent: ReactNode };

export function useDraftingPrototype(variant: DraftVariant | undefined): DraftingSlots | null {
  const [state, dispatch] = useReducer(reduceDraft, INITIAL_STATE);
  const [query, setQuery] = useVariantCQuery();
  if (!variant) {
    return null;
  }
  switch (variant) {
    case 'A':
      return {
        overlay: (
          <>
            <VARIANT_A.Overlay state={state} dispatch={dispatch} />
            <PrototypeSwitcher current="A" name={VARIANT_A.name} />
          </>
        ),
        panelContent: <VARIANT_A.Panel state={state} dispatch={dispatch} />,
      };
    case 'B':
      return {
        overlay: (
          <>
            <VARIANT_B.Overlay state={state} dispatch={dispatch} />
            <PrototypeSwitcher current="B" name={VARIANT_B.name} />
          </>
        ),
        panelContent: <VARIANT_B.Panel state={state} dispatch={dispatch} />,
      };
    case 'C':
      return {
        overlay: (
          <>
            <VARIANT_C.Overlay state={state} dispatch={dispatch} query={query} />
            <PrototypeSwitcher current="C" name={VARIANT_C.name} />
          </>
        ),
        panelContent: <VARIANT_C.Panel state={state} dispatch={dispatch} query={query} setQuery={setQuery} />,
      };
    default:
      return null;
  }
}
