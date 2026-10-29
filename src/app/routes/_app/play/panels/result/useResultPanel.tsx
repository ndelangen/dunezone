import { describeResult, resultFactionCountFits } from '@shared/play/result';
import { useCallback, useState } from 'react';

import type { TableProjection, TableSession } from '../../../../../db/tabletop/TableSession';
import { factionName, factionOptions, isSpectator, viewerFaction } from '../../multiplayer/tableFactions';
import { predictionCardInHand } from '../../prediction/predictionCardInHand';
import { chosenFactions, ResultPanel } from './ResultPanel';
import type { Choice, PredictionReveal, ResultPanelProps, ResultState } from './ResultPanel';

type Props = Readonly<{ client: TableSession; table: TableProjection }>;

const NO_CHOICE: Choice = { kind: 'faction', faction: null, alliance: [] };

export type DeclareChoice = Readonly<{ choice: Choice; change: (patch: Partial<Choice>) => void }>;

/**
 * The declaring player's pending choice, held above the Result window so opening another window (Hand, to reveal a prediction) keeps it.
 * A new ending sequence starts from no choice.
 */
export function useDeclareChoice(table: TableProjection): DeclareChoice {
  const sequence = table.snapshot.ending?.startedAt ?? null;
  const [held, hold] = useState({ sequence, choice: NO_CHOICE });
  const choice = held.sequence === sequence ? held.choice : NO_CHOICE;
  const change = useCallback(
    (patch: Partial<Choice>) =>
      hold((state) => ({
        sequence,
        choice: { ...(state.sequence === sequence ? state.choice : NO_CHOICE), ...patch },
      })),
    [sequence]
  );
  return { choice, change };
}

/** The viewer's own locked prediction that nobody has seen yet, if any; observers hold none. */
function unrevealedPrediction(table: TableProjection): string | undefined {
  if (isSpectator(table)) {
    return undefined;
  }
  const own = viewerFaction(table);
  return Object.entries(table.snapshot.predictions ?? {}).find(
    ([, prediction]) => prediction.factionId === own && prediction.revealedAt === null
  )?.[0];
}

/** Where the game's end stands for this viewer, or null when there is nothing to settle. */
export function resultState(table: TableProjection, choice: Choice = NO_CHOICE): ResultState | null {
  const { ending, result, stage } = table.snapshot;
  /* Playback shows an earlier table; the live decision is not offered from it. */
  if (table.playback) {
    return null;
  }
  if (stage === 'play' && ending) {
    return ending.by.seat === table.viewer.viewerSeat
      ? {
          kind: 'declaring',
          options: factionOptions(table),
          choice,
          valid: resultFactionCountFits(choice.kind, chosenFactions(choice).length),
        }
      : { kind: 'determining', name: ending.by.name };
  }
  if (stage === 'finished' && result) {
    return {
      kind: 'finished',
      title: describeResult(
        result.kind,
        result.factionIds.map((id) => factionName(table, id))
      ),
      by: result.by.name,
      player: !isSpectator(table),
    };
  }
  return null;
}

/**
 * How the viewer reveals their own prediction: during play the prediction card in hand is the reveal, so placing it on the table shows the choice;
 * a finished game always offers the button.
 */
export function predictionReveal(table: TableProjection): PredictionReveal {
  const stepId = unrevealedPrediction(table);
  if (stepId === undefined) {
    return null;
  }
  return table.snapshot.stage !== 'finished' && predictionCardInHand(table, stepId) ? 'card' : 'button';
}

function useResultPanel({ client, table, declare }: Props & Readonly<{ declare: DeclareChoice }>): ResultPanelProps {
  const { choice, change } = declare;
  const own = viewerFaction(table);
  const revealed = Object.values(table.snapshot.predictions ?? {}).find(
    (prediction) => prediction.factionId === own && prediction.revealedAt !== null && prediction.choice
  );
  return {
    state: resultState(table, choice),
    prediction: predictionReveal(table),
    revealedPrediction: revealed?.choice
      ? `Your prediction was revealed: ${factionName(table, revealed.choice.factionId)}, turn ${revealed.choice.turn}.`
      : undefined,
    disabled: !table.canInteract,
    onReveal: () => {
      const stepId = unrevealedPrediction(table);
      if (stepId) {
        client.command({ kind: 'prediction-reveal', stepId });
      }
    },
    onChange: change,
    onStop: () => client.command({ kind: 'result-cancel' }),
    onDeclare: () =>
      client.command({ kind: 'result-declare', result: choice.kind, factionIds: chosenFactions(choice) }),
  };
}

/** The Result window's content at a live table. */
export function ConnectedResultPanel(props: Props & Readonly<{ declare: DeclareChoice }>) {
  return <ResultPanel {...useResultPanel(props)} />;
}
