import { Button, Group, Text } from '@mantine/core';

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
            <Button variant="default" disabled={pending || replay.step === 0} onClick={() => onStep(replay.step - 1)}>
              Earlier phase
            </Button>
            <Button
              variant="default"
              disabled={pending || replay.step === replay.lastStep}
              onClick={() => onStep(replay.step + 1)}
            >
              Later phase
            </Button>
            <Button variant="default" onClick={onLive}>
              Return to live
            </Button>
          </Group>
        </>
      ) : (
        <>
          <Text size="sm">Step through the game phase by phase, from its start.</Text>
          <Group gap="sm" role="group" aria-label="Phase playback">
            <Button variant="default" disabled={pending || !replay.canStart} onClick={() => onStep(0)}>
              Replay from start
            </Button>
            {pending && (
              <Button variant="default" onClick={onLive}>
                Return to live
              </Button>
            )}
          </Group>
        </>
      )}
    </>
  );
}
