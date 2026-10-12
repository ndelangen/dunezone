import { Button, Group, Text } from '@mantine/core';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';

/** Fixture playback stays inline; a real game's playback bar owns stepping and return to live. */
function FixturePlaybackControls({
  client,
  playback,
  pending,
}: {
  client: TableSession;
  playback: NonNullable<TableProjection['playback']>;
  pending: boolean;
}) {
  return (
    <>
      <Text component="output" size="sm">
        Playback checkpoint {playback.step} of {playback.lastStep}. Table actions are paused.
      </Text>
      <Group gap="sm" role="group" aria-label="Phase playback">
        <Button
          variant="default"
          disabled={pending || playback.step === 0}
          onClick={() => client.requestHistory(playback.step - 1)}
        >
          Earlier phase
        </Button>
        <Button
          variant="default"
          disabled={pending || playback.step === playback.lastStep}
          onClick={() => client.requestHistory(playback.step + 1)}
        >
          Later phase
        </Button>
        <Button variant="default" onClick={client.resumeLive}>
          Return to live
        </Button>
      </Group>
    </>
  );
}

export function PlaybackControls({ client, table }: Readonly<{ client: TableSession; table: TableProjection }>) {
  const { playback, historyPending } = table;
  if (playback && table.snapshot.stage) {
    return <Text size="sm">Use the playback controls above the panel to step through the game or return to live.</Text>;
  }
  return (
    <>
      {historyPending && (
        <Text component="output" size="sm">
          Loading playback...
        </Text>
      )}
      {playback ? (
        <FixturePlaybackControls client={client} playback={playback} pending={historyPending} />
      ) : (
        <Group gap="sm" role="group" aria-label="Phase playback">
          <Button
            variant="default"
            disabled={historyPending || !!table.state.draftMove || table.reconnecting}
            onClick={() => client.requestHistory(0)}
          >
            Replay from start
          </Button>
          {historyPending && (
            <Button variant="default" onClick={client.resumeLive}>
              Return to live
            </Button>
          )}
        </Group>
      )}
    </>
  );
}
