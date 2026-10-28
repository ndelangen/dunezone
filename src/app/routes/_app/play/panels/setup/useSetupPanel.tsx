import { setupStep } from '@shared/play/setup';
import type { SetupState } from '@shared/play/setup';
import type { TopicIconTopic } from '@ui/content/TopicIcon';

import type { TableProjection, TableSession } from '../../../../../db/tabletop/TableSession';
import { setupGuidance, setupHelp } from '../../multiplayer/panelGuidance';
import { factionName, factionOptions, viewerFaction } from '../../multiplayer/tableFactions';
import { predictionCardInHand } from '../../prediction/predictionCardInHand';
import type { PanelWindow } from '../panelWindows';
import { SetupPanel } from './SetupPanel';
import type { PredictionRow, SetupPanelProps } from './SetupPanel';

type Props = Readonly<{ client: TableSession; table: TableProjection }>;

const SETUP_TOPICS = {
  traitors: 'leaders',
  forces: 'troops',
  prediction: 'fate',
  instruction: 'setup',
} as const satisfies Record<string, TopicIconTopic>;

/** The Setup window, named and explained by the current setup step. */
export function setupWindow(setup: SetupState): PanelWindow {
  const step = setupStep(setup);
  return { key: 'setup', label: 'Setup', topic: SETUP_TOPICS[step.kind], ...setupGuidance(step) };
}

/* Every prediction at the table, as the viewer sees it: locked, being chosen by the viewer now, or waiting for its player. */
function predictionRows(table: TableProjection, setup: SetupState): PredictionRow[] {
  const ownFaction = viewerFaction(table);
  const current = setupStep(setup);
  return setup.steps
    .filter((step) => step.kind === 'prediction')
    .map((step) => {
      const prediction = table.snapshot.predictions?.[step.id];
      const own = step.factionId === ownFaction;
      /* While its card is in hand, placing the card is the reveal; a game that dealt none keeps the button during setup and in the winner bars. */
      const byCard = own && prediction?.revealedAt === null && predictionCardInHand(table, step.id);
      const choice = prediction?.choice;
      const seat = choice && table.snapshot.roster?.seats.find((entry) => entry.faction?.id === choice.factionId);
      return {
        stepId: step.id,
        title: step.title,
        help: setupHelp(step),
        current: current.id === step.id,
        state: prediction
          ? {
              kind: 'locked' as const,
              revealed: prediction.revealedAt !== null,
              byCard,
              choice:
                choice && !byCard
                  ? {
                      name: factionName(table, choice.factionId),
                      token: (seat && table.snapshot.swapping?.tokens[seat.id]) ?? null,
                      turn: choice.turn,
                    }
                  : null,
              canReveal: own && prediction.revealedAt === null && !byCard,
            }
          : own && current.id === step.id && table.snapshot.stage === 'setup'
            ? { kind: 'choosing' as const, options: factionOptions(table) }
            : { kind: 'waiting' as const },
      };
    });
}

/** The Setup window's props for this table, or null once setup is over. */
export function setupPanelProps(
  table: TableProjection,
  actions: Pick<SetupPanelProps, 'onGatherTraitors' | 'onLockPrediction' | 'onRevealPrediction'>
): SetupPanelProps | null {
  const setup = table.snapshot.setup;
  if (!setup) {
    return null;
  }
  const step = setupStep(setup);
  /* The viewer's own starting troops lead, so a narrow window shows the line that seat has to follow. */
  const ownFaction = viewerFaction(table);
  const instructions =
    step.kind === 'forces'
      ? [
          ...setup.instructions.filter((entry) => entry.factionId === ownFaction),
          ...setup.instructions.filter((entry) => entry.factionId !== ownFaction),
        ].map((entry) => ({ ...entry, name: factionName(table, entry.factionId) }))
      : [];
  return {
    step: { kind: step.kind, title: step.title, help: setupHelp(step) },
    hiddenHeading: Boolean(table.snapshot.stage),
    instructions,
    predictions: predictionRows(table, setup),
    disabled: !table.canInteract,
    ...actions,
  };
}

/** The Setup window's content at a live table. */
export function ConnectedSetupPanel({ client, table }: Props) {
  const props = setupPanelProps(table, {
    onGatherTraitors: () => client.command({ kind: 'traitors-gather' }),
    onLockPrediction: (stepId, choice) => client.command({ kind: 'prediction-lock', stepId, choice }),
    onRevealPrediction: (stepId) => client.command({ kind: 'prediction-reveal', stepId }),
  });
  return props && <SetupPanel {...props} />;
}
