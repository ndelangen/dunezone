import { Button, Group, Select, Stack, Text } from '@mantine/core';
import type { setupStep } from '@shared/play/setup';
import { playUiColors } from '@shared/uiPalette';
import { Section } from '@ui/block/Section';
import { InlineFormattedTextSource } from '@ui/content/FormattedText';
import { IconAction } from '@ui/control/IconAction';
import { Stepper } from '@ui/control/Stepper';
import { Layers } from 'lucide-react';
import { useReducer } from 'react';

import { factionOption } from '../../multiplayer/factionOption';
import type { FactionOption } from '../../multiplayer/factionOption';

/** A faction's starting troops, as its rules state them. */
type StartingTroops = Readonly<{ factionId: string; name: string; text: string }>;

/** A predicted winner as its cards show it: the faction's name and token, and the turn. */
type PredictedWinner = Readonly<{ name: string; token: string | null; turn: number }>;

/** Where one prediction stands for the viewer. */
type PredictionState =
  | Readonly<{
      kind: 'locked';
      revealed: boolean;
      /** The viewer's own prediction card is in hand, so placing it on the table is the reveal. */
      byCard: boolean;
      /** The choice, once its player can see it or it is revealed; null while it stays hidden. */
      choice: PredictedWinner | null;
      /** The viewer may reveal it with a button. */
      canReveal: boolean;
    }>
  /** The viewer locks this prediction now. */
  | Readonly<{ kind: 'choosing'; options: readonly FactionOption[] }>
  | Readonly<{ kind: 'waiting' }>;

export type PredictionRow = Readonly<{
  stepId: string;
  title: string;
  help: string;
  /** The current step's heading is the window's own (?), so only the others show theirs. */
  current: boolean;
  state: PredictionState;
}>;

export type SetupPanelProps = Readonly<{
  /** The current setup step, or the window shows only the predictions. */
  step: Pick<ReturnType<typeof setupStep>, 'kind' | 'title'> & Readonly<{ help: string }>;
  /** A hosted game names the step in the window's (?); a table without a stage shows its heading. */
  hiddenHeading: boolean;
  /** For the starting-troops step: each faction's line, the viewer's own first. */
  instructions: readonly StartingTroops[];
  predictions: readonly PredictionRow[];
  traitors: Readonly<{ factions: readonly FactionOption[]; available: number }> | null;
  /** The actions are greyed out while the table is not taking moves. */
  disabled: boolean;
  /** An observer only reads the step: its gather and deal actions are not shown, not even greyed. */
  observing: boolean;
  onGatherTraitors: () => void;
  onDealTraitors: (factionId: string, count: 1 | 4) => void;
  onLockPrediction: (stepId: string, choice: { factionId: string; turn: number }) => void;
  onRevealPrediction: (stepId: string) => void;
}>;

function PredictionCards({ name, token, turn }: PredictedWinner) {
  return (
    <svg width="300" height="190" viewBox="0 0 300 190" role="img" aria-label={`${name}, turn ${turn}`}>
      <rect
        x="2"
        y="2"
        width="142"
        height="184"
        rx="10"
        fill={playUiColors.demoCard}
        stroke={playUiColors.demoCardBorder}
        strokeWidth="3"
      />
      <rect
        x="156"
        y="2"
        width="142"
        height="184"
        rx="10"
        fill={playUiColors.demoCard}
        stroke={playUiColors.demoCardBorder}
        strokeWidth="3"
      />
      {token && <image href={token} x="23" y="20" width="100" height="100" />}
      <text x="73" y="153" textAnchor="middle" fill={playUiColors.demoCardInk} fontSize="13">
        {name}
      </text>
      <text x="227" y="62" textAnchor="middle" fill={playUiColors.demoCardInk} fontSize="20">
        TURN
      </text>
      <text x="227" y="135" textAnchor="middle" fill={playUiColors.demoCardInk} fontSize="68">
        {turn}
      </text>
    </svg>
  );
}

function PredictionInput({
  options,
  disabled,
  onLock,
}: Readonly<{
  options: readonly FactionOption[];
  disabled: boolean;
  onLock: (choice: { factionId: string; turn: number }) => void;
}>) {
  const [choice, change] = useReducer(
    (
      state: { factionId: string | null; turn: number },
      patch: Partial<{ factionId: string | null; turn: number }>
    ) => ({ ...state, ...patch }),
    { factionId: null, turn: 1 }
  );
  const valid =
    choice.factionId && typeof choice.turn === 'number' && Number.isSafeInteger(choice.turn) && choice.turn >= 1;
  return (
    <Stack gap="sm">
      <Select
        label="Predicted winner"
        data={options}
        renderOption={({ option }) => factionOption(options, option.value)}
        value={choice.factionId}
        onChange={(factionId) => change({ factionId })}
        disabled={disabled}
      />
      <Stepper
        label="Predicted turn"
        min={1}
        value={choice.turn}
        onChange={(turn) => change({ turn })}
        disabled={disabled}
      />
      <Button
        disabled={disabled || !valid}
        onClick={() => valid && onLock({ factionId: choice.factionId!, turn: Number(choice.turn) })}
      >
        Lock prediction
      </Button>
    </Stack>
  );
}

/* A locked prediction is revealed, waits for its card on the table, or stays locked until its player reveals it. */
function lockedPredictionText(revealed: boolean, byCard: boolean) {
  if (revealed) {
    return 'Prediction revealed';
  }
  return byCard ? 'Prediction locked. Place your prediction card on the table to reveal it.' : 'Prediction locked';
}

function Prediction({
  row,
  hiddenHeading,
  disabled,
  onLockPrediction,
  onRevealPrediction,
}: Pick<SetupPanelProps, 'hiddenHeading' | 'disabled' | 'onLockPrediction' | 'onRevealPrediction'> &
  Readonly<{ row: PredictionRow }>) {
  const { state } = row;
  return (
    /* The Setup window's guidance names the current step only, so every other declaration keeps its heading in view. */
    <Section hiddenHeading={hiddenHeading && row.current} title={row.title} description={row.help}>
      <Stack gap="sm">
        {state.kind === 'locked' ? (
          <>
            <Text size="sm">{lockedPredictionText(state.revealed, state.byCard)}</Text>
            {state.choice && <PredictionCards {...state.choice} />}
            {state.canReveal && (
              <Button variant="default" disabled={disabled} onClick={() => onRevealPrediction(row.stepId)}>
                Reveal prediction
              </Button>
            )}
          </>
        ) : state.kind === 'choosing' ? (
          <PredictionInput
            key={row.stepId}
            options={state.options}
            disabled={disabled}
            onLock={(choice) => onLockPrediction(row.stepId, choice)}
          />
        ) : (
          <Text size="sm">Waiting for the faction player to lock a prediction.</Text>
        )}
      </Stack>
    </Section>
  );
}

/** The Setup window: the current setup step's instructions and action, then every prediction at the table. */
export function SetupPanel(props: SetupPanelProps) {
  const {
    step,
    hiddenHeading,
    instructions,
    predictions,
    traitors,
    disabled,
    observing,
    onGatherTraitors,
    onDealTraitors,
  } = props;
  const dealDisabledReason = (count: number) => {
    if (disabled) {
      return 'The table is unavailable.';
    }
    return (traitors?.available ?? 0) < count ? 'Combine enough traitor cards first.' : undefined;
  };
  return (
    <Stack gap="md">
      {step.kind !== 'prediction' && (
        <Section hiddenHeading={hiddenHeading} title={step.title} description={step.help}>
          <Stack gap="sm">
            {step.kind === 'traitors' && !observing && (
              <>
                <Button variant="default" disabled={disabled} onClick={onGatherTraitors}>
                  Gather tabletop traitors
                </Button>
                {traitors?.factions.map((faction) => (
                  <Group key={faction.value} justify="space-between" wrap="nowrap">
                    {factionOption(traitors.factions, faction.value)}
                    <Group gap="xs" wrap="nowrap">
                      {([1, 4] as const).map((count) => (
                        <IconAction
                          key={count}
                          label={`Deal ${count} to ${faction.label}`}
                          intent="neutral"
                          emphasis="quiet"
                          icon={
                            <>
                              <Layers size={14} aria-hidden />
                              <span aria-hidden>{count}</span>
                            </>
                          }
                          disabledReason={dealDisabledReason(count)}
                          onClick={() => onDealTraitors(faction.value, count)}
                        />
                      ))}
                    </Group>
                  </Group>
                ))}
              </>
            )}
            {step.kind === 'forces' &&
              instructions.map((entry) => (
                /* A visible heading, not help-only: the faction name is what tells the lines apart. */
                <Section key={entry.factionId} title={entry.name}>
                  <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                    <InlineFormattedTextSource
                      source={entry.text || 'Follow your faction rules for starting troops.'}
                    />
                  </Text>
                </Section>
              ))}
          </Stack>
        </Section>
      )}
      {predictions.map((row) => (
        <Prediction key={row.stepId} {...props} row={row} />
      ))}
    </Stack>
  );
}
