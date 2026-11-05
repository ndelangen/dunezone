import { Group, Text } from '@mantine/core';
import { LabeledAction } from '@ui/control/LabeledAction';
import { ChevronLeft, ChevronRight, History, Radio } from 'lucide-react';

/** Where the table stands in its saved phases: browsing one of them, or live. */
export type ReplayState =
  /* A real game's header owns stepping and the return to live while it browses. */
  | Readonly<{ kind: 'header' }>
  | Readonly<{ kind: 'browsing'; step: number; lastStep: number }>
  | Readonly<{ kind: 'live'; canStart: boolean }>;

export type ReplayPanelProps = Readonly<{
  replay: ReplayState;
  /** A saved phase is on its way. */
  pending: boolean;
  onStep: (step: number) => void;
  onLive: () => void;
}>;

/** Browsing the table's saved phases: from the start while live, or step by step on a fixture table, and back to live. */
export function ReplayPanel({ replay, pending, onStep, onLive }: ReplayPanelProps) {
  if (replay.kind === 'header') {
    return <Text size="sm">Use the playback controls in the header to step through the game or return to live.</Text>;
  }
  return (
    <>
      {pending && (
        <Text component="output" size="sm">
          Loading playback...
        </Text>
      )}
      {replay.kind === 'browsing' ? (
        <>
          <Text component="output" size="sm">
            Playback checkpoint {replay.step} of {replay.lastStep}. Table actions are paused.
          </Text>
          <Group gap="sm" role="group" aria-label="Phase playback">
            <LabeledAction
              icon={<ChevronLeft size={16} />}
              disabledReason={
                pending ? 'Playback is loading.' : replay.step === 0 ? 'This is the first phase.' : undefined
              }
              onClick={() => onStep(replay.step - 1)}
            >
              Earlier phase
            </LabeledAction>
            <LabeledAction
              icon={<ChevronRight size={16} />}
              disabledReason={
                pending
                  ? 'Playback is loading.'
                  : replay.step === replay.lastStep
                    ? 'This is the last phase.'
                    : undefined
              }
              onClick={() => onStep(replay.step + 1)}
            >
              Later phase
            </LabeledAction>
            <LabeledAction icon={<Radio size={16} />} onClick={onLive}>
              Return to live
            </LabeledAction>
          </Group>
        </>
      ) : (
        <>
          <Text size="sm">Step through the game phase by phase, from its start.</Text>
          <Group gap="sm" role="group" aria-label="Phase playback">
            <LabeledAction
              icon={<History size={16} />}
              disabledReason={
                pending ? 'Playback is loading.' : replay.canStart ? undefined : 'The game has no phases to replay yet.'
              }
              onClick={() => onStep(0)}
            >
              Replay from start
            </LabeledAction>
            {pending && (
              <LabeledAction icon={<Radio size={16} />} onClick={onLive}>
                Return to live
              </LabeledAction>
            )}
          </Group>
        </>
      )}
    </>
  );
}
