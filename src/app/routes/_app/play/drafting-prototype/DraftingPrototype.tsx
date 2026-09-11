/* PROTOTYPE (#1142): binds one variant's overlay and panel to shared in-memory draft state. Throwaway; lives on the prototype branch only. */
import { useReducer } from 'react';
import type { ReactNode } from 'react';

import { INITIAL_STATE, reduceDraft } from './fixture';
import { INITIAL_SWAP, reduceSwap } from './swapping';
import { SwapOverlay } from './SwapOverlay';
import { SWAP_PANELS } from './SwapPanels';
import { SwapScene3D } from './SwapScene3D';
import type { ArrowStyle } from './SwapScene3D';
import { formatClock, swapGates } from './swapping';
import type { DraftVariant } from './fixture';
import { PrototypeSwitcher } from './PrototypeSwitcher';
import { VARIANT_A } from './VariantA';
import { VARIANT_B } from './VariantB';
import { VARIANT_C, useVariantCQuery } from './VariantC';
import './drafting-prototype.css';

export type DraftingSlots = { overlay: ReactNode; panelContent: ReactNode; sceneExtras?: ReactNode };

export function useDraftingPrototype(variant: DraftVariant | undefined): DraftingSlots | null {
  const [state, dispatch] = useReducer(reduceDraft, INITIAL_STATE);
  const [query, setQuery] = useVariantCQuery();
  const [swap, dispatchSwap] = useReducer(reduceSwap, INITIAL_SWAP);
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
    case 'D':
      /* The user's combination: A's table overlay with B's panel. */
      return {
        overlay: (
          <>
            <VARIANT_A.Overlay state={state} dispatch={dispatch} />
            <PrototypeSwitcher current="D" name="Combined: ledger on the table, faction list in the panel" />
          </>
        ),
        panelContent: <VARIANT_B.Panel state={state} dispatch={dispatch} />,
      };
    case 'E':
    case 'F':
    case 'G': {
      /* Swapping prototype (#1143): one shared table overlay, three panels. */
      const panel = SWAP_PANELS[variant];
      return {
        overlay: (
          <>
            <SwapOverlay state={swap} dispatch={dispatchSwap} />
            <PrototypeSwitcher current={variant} name={panel.name} />
          </>
        ),
        panelContent: <panel.Panel state={swap} dispatch={dispatchSwap} />,
      };
    }
    case 'H':
    case 'I':
    case 'J': {
      /* 3D prototype (#1144): panel E, tokens and arrows in the scene, only a clock HUD on top. */
      const styles: Record<'H' | 'I' | 'J', { style: ArrowStyle; name: string }> = {
        H: { style: 'tube', name: '3D H: solid arch with a cone head' },
        I: { style: 'chevrons', name: '3D I: chevrons flowing along a thin arch' },
        J: { style: 'comet', name: '3D J: comet travelling the arch, big head' },
      };
      const chosen = styles[variant];
      const g = swapGates(swap);
      return {
        overlay: (
          <>
            <div className="dp-swap-hud" aria-live="polite">
              <strong>{formatClock(swap.secondsLeft)}</strong>
              <span>
                to trade seats · swap-ready {g.ready}/{g.seated}
                {g.vacancies ? ` · ${g.vacancies} open seat` : ''}
              </span>
            </div>
            <PrototypeSwitcher current={variant} name={chosen.name} />
          </>
        ),
        panelContent: <SWAP_PANELS.E.Panel state={swap} dispatch={dispatchSwap} />,
        sceneExtras: <SwapScene3D state={swap} style={chosen.style} />,
      };
    }
    default:
      return null;
  }
}
