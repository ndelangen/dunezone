/* PROTOTYPE (#1142, #1143, #1144, #1145, #1146): binds the variants to shared in-memory state. Throwaway; lives on the prototype branch only. See README.md. */
import { useReducer } from 'react';
import type { ReactNode } from 'react';

import { DraftingOverlay } from './DraftingOverlay';
import { DraftingPanel } from './DraftingPanel';
import { reduceDraft, scenarioState } from './fixture';
import type { DraftVariant, Scenario } from './fixture';
import { AdvanceButtons, DraftingHeader, TokenGallery } from './parts';
import { PrototypeSwitcher } from './PrototypeSwitcher';
import { isSetupScenario, reduceSetup, SETUP_SCENARIO_NAMES, SETUP_SCENARIOS, setupScenarioState } from './setup';
import type { PrototypeScenario, SetupScenario } from './setup';
import { SetupFocusPanel } from './SetupFocusPanel';
import { SetupSectionsPanel } from './SetupSectionsPanel';
import { DropZone, SetupAdvance, SetupHeader } from './setupParts';
import { SetupScene3D } from './SetupScene3D';
import { SetupStackPanel } from './SetupStackPanel';
import { INITIAL_SWAP, reduceSwap } from './swapping';
import { SwappingPanel } from './SwappingPanel';
import { SwapScene3D } from './SwapScene3D';
import './drafting-prototype.css';
import './setup-prototype.css';

export type DraftingSlots = { overlay: ReactNode; panelContent: ReactNode; headerCentre?: ReactNode; headerRight?: ReactNode; sceneExtras?: ReactNode; hidePieces?: boolean };

export function useDraftingPrototype(variant: DraftVariant | undefined, scenario?: PrototypeScenario): DraftingSlots | null {
  const draftScenario: Scenario = scenario && !isSetupScenario(scenario) ? scenario : 'drafting';
  const setupScenario: SetupScenario = isSetupScenario(scenario) ? scenario : 'traitors';
  const [draft, dispatchDraft] = useReducer(reduceDraft, draftScenario, scenarioState);
  const [swap, dispatchSwap] = useReducer(reduceSwap, INITIAL_SWAP);
  const [setup, dispatchSetup] = useReducer(reduceSetup, setupScenario, setupScenarioState);
  if (draft.scenario !== draftScenario) {
    /* ?scenario= changed: reload the fixture in this render, the way React derives state from a prop without an effect. */
    dispatchDraft({ type: 'load', scenario: draftScenario });
  }
  if (setup.scenario !== setupScenario) {
    dispatchSetup({ type: 'load', scenario: setupScenario });
  }
  const setupSwitcher = (current: DraftVariant, name: string) => (
    <>
      <DropZone state={setup} dispatch={dispatchSetup} />
      <PrototypeSwitcher current={current} scenario={setupScenario} scenarios={SETUP_SCENARIOS} scenarioNames={SETUP_SCENARIO_NAMES} name={name} />
    </>
  );
  switch (variant) {
    case 'drafting':
      /* Accepted variant D, refined: the ledger overlay on the table, the statistics in the page header, the faction list with the seat bar in the panel. */
      return {
        overlay: (
          <>
            <DraftingOverlay state={draft} dispatch={dispatchDraft} />
            <PrototypeSwitcher current="drafting" scenario={draftScenario} name="Drafting: ledger overlay on the table, statistics in the header, faction list in the panel" />
          </>
        ),
        panelContent: <DraftingPanel state={draft} dispatch={dispatchDraft} />,
        headerCentre: <DraftingHeader state={draft} />,
        /* The phase controls keep their place during drafting and do not apply: assignment follows readiness. */
        headerRight: <AdvanceButtons previousDisabled nextDisabled reason="Seats are dealt when everyone is ready." />,
      };
    case 'swapping':
      /* Accepted variants E and K: the seat card and roster in the panel, real token faces and flowing chevrons in the scene, an empty table. */
      return {
        overlay: <PrototypeSwitcher current="swapping" name="Swapping: seat card and roster, chevrons arching between token rims" />,
        panelContent: <SwappingPanel state={swap} dispatch={dispatchSwap} />,
        headerRight: <AdvanceButtons previousDisabled nextDisabled reason="Setup begins when trading ends." />,
        sceneExtras: <SwapScene3D state={swap} />,
        hidePieces: true,
      };
    /* #1146: three arrangements of the setup panel, the dealt tokens on the table, the step in the header. */
    case 'setup-stack':
      return {
        overlay: setupSwitcher('setup-stack', 'Setup stack: the phase and its controls on top, three columns beneath'),
        panelContent: <SetupStackPanel state={setup} dispatch={dispatchSetup} />,
        headerCentre: <SetupHeader state={setup} />,
        headerRight: <SetupAdvance state={setup} dispatch={dispatchSetup} />,
        sceneExtras: <SetupScene3D state={setup} dispatch={dispatchSetup} />,
        hidePieces: true,
      };
    case 'setup-sections':
      return {
        overlay: setupSwitcher('setup-sections', 'Setup sections: one column of sections under a phase strip that stays put'),
        panelContent: <SetupSectionsPanel state={setup} dispatch={dispatchSetup} />,
        headerCentre: <SetupHeader state={setup} />,
        headerRight: <SetupAdvance state={setup} dispatch={dispatchSetup} />,
        sceneExtras: <SetupScene3D state={setup} dispatch={dispatchSetup} />,
        hidePieces: true,
      };
    case 'setup-focus':
      return {
        overlay: setupSwitcher('setup-focus', 'Setup focus: a rail of steps and seats, the current step alone, drawers for the rest'),
        panelContent: <SetupFocusPanel state={setup} dispatch={dispatchSetup} />,
        headerCentre: <SetupHeader state={setup} />,
        headerRight: <SetupAdvance state={setup} dispatch={dispatchSetup} />,
        sceneExtras: <SetupScene3D state={setup} dispatch={dispatchSetup} />,
        hidePieces: true,
      };
    case 'tokens':
      /* The capture gallery: every real token face at 512px, shot into ./tokens by capture-tokens.mjs. */
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
