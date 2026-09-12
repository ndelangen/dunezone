/* PROTOTYPE (#1142, #1143, #1144, #1145, #1146): binds the variants to shared in-memory state. Throwaway; lives on the prototype branch only. See README.md. */
import { useReducer } from 'react';
import type { ReactNode } from 'react';

import { DraftingOverlay } from './DraftingOverlay';
import { DraftingPanel } from './DraftingPanel';
import { reduceDraft, scenarioState } from './fixture';
import type { DraftVariant, Scenario } from './fixture';
import { AdvanceButtons, DraftingHeader, TokenGallery, useNow } from './parts';
import { PrototypeSwitcher } from './PrototypeSwitcher';
import { isSetupScenario, reduceSetup, SETUP_SCENARIO_NAMES, SETUP_SCENARIOS, setupScenarioState } from './setup';
import type { PrototypeScenario, SetupScenario } from './setup';
import { DropZone, SetupAdvance, SetupHeader } from './setupParts';
import { phaseCooldownLeft } from './setup';
import { SetupScene3D } from './SetupScene3D';
import { initialPlayState, reducePlay } from './play';
import { PlayPanel } from './PlayPanel';
import { SetupPanel } from './SetupPanel';
import { INITIAL_SWAP, reduceSwap } from './swapping';
import { SwappingPanel } from './SwappingPanel';
import { SwapScene3D } from './SwapScene3D';
import './drafting-prototype.css';
import './setup-prototype.css';
import './play-prototype.css';

export type DraftingSlots = { overlay: ReactNode; panelContent: ReactNode; headerCentre?: ReactNode; headerRight?: ReactNode; sceneExtras?: ReactNode; hidePieces?: boolean };

export function useDraftingPrototype(variant: DraftVariant | undefined, scenario?: PrototypeScenario): DraftingSlots | null {
  const draftScenario: Scenario = scenario && !isSetupScenario(scenario) ? scenario : 'drafting';
  const setupScenario: SetupScenario = isSetupScenario(scenario) ? scenario : 'traitors';
  const [draft, dispatchDraft] = useReducer(reduceDraft, draftScenario, scenarioState);
  const [swap, dispatchSwap] = useReducer(reduceSwap, INITIAL_SWAP);
  const [setup, dispatchSetup] = useReducer(reduceSetup, setupScenario, setupScenarioState);
  const [play, dispatchPlay] = useReducer(reducePlay, undefined, initialPlayState);
  const now = useNow(250);
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
    /* #1146: the setup panel, the dealt tokens and dropped pieces on the table, the step in the header, the phase buttons at the toolbar's right. */
    case 'setup':
      return {
        overlay: setupSwitcher('setup', 'Setup: the phase and Ready on top, three columns beneath: yours, shared, table'),
        panelContent: <SetupPanel state={setup} dispatch={dispatchSetup} />,
        headerCentre: <SetupHeader state={setup} />,
        headerRight: <SetupAdvance state={setup} dispatch={dispatchSetup} />,
        sceneExtras: <SetupScene3D state={setup} dispatch={dispatchSetup} />,
        hidePieces: true,
      };
    /* #1147: the play panel sketch, two nested-tab surfaces side by side. */
    case 'play': {
      const left = phaseCooldownLeft(play, now);
      return {
        overlay: (
          <>
            <DropZone state={play} dispatch={dispatchPlay} />
            <PrototypeSwitcher current="play" name="Play: two NestedTabs side by side, yours on the left, one tab per player on the right" />
          </>
        ),
        panelContent: <PlayPanel state={play} dispatch={dispatchPlay} />,
        headerRight: (
          <AdvanceButtons
            onPrevious={() => dispatchPlay({ type: 'advance', direction: -1, at: Date.now() })}
            onNext={() => dispatchPlay({ type: 'advance', direction: 1, at: Date.now() })}
            previousDisabled={left > 0}
            nextDisabled={left > 0}
            countdown={left > 0 ? Math.ceil(left / 1000) : undefined}
            reason={left > 0 ? 'One phase change per 8 seconds.' : undefined}
          />
        ),
        sceneExtras: <SetupScene3D state={play} dispatch={dispatchPlay} />,
        hidePieces: true,
      };
    }
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
