import { Button, Group, MultiSelect, SegmentedControl, Select, Stack } from '@mantine/core';
import { phaseAt } from '@shared/play/phases';
import { describeResult, resultFactionCountFits } from '@shared/play/result';
import type { GameResultKind } from '@shared/play/result';
import { rosterSeat, SPECTATOR_SEAT } from '@shared/play/schema';
import { useReducer } from 'react';

import { DecisionBar } from './SeatRequests';
import type { TableProjection, TableSession } from './TableSession';

type Props = Readonly<{ client: TableSession; table: TableProjection }>;

const KINDS: { value: GameResultKind; label: string }[] = [
  { value: 'faction', label: 'Faction' },
  { value: 'alliance', label: 'Alliance' },
  { value: 'none', label: 'No winner' },
];

function factionOptions(table: TableProjection) {
  return (
    table.snapshot.roster?.seats.flatMap((seat) =>
      seat.faction ? [{ value: seat.faction.id, label: seat.faction.name }] : []
    ) ?? []
  );
}

function factionName(table: TableProjection, id: string) {
  return table.snapshot.roster?.seats.find((seat) => seat.faction?.id === id)?.faction?.name ?? id;
}

/** The viewer's own locked prediction that nobody has seen yet, if any. */
function unrevealedPrediction(table: TableProjection): string | undefined {
  const own = rosterSeat(table.snapshot.roster, table.viewer.viewerSeat)?.faction?.id;
  return Object.entries(table.snapshot.predictions ?? {}).find(
    ([, prediction]) => prediction.factionId === own && prediction.revealedAt === null
  )?.[0];
}

function RevealButton({ client, table, stepId }: Props & Readonly<{ stepId: string }>) {
  return (
    <Button
      variant="default"
      disabled={!table.canInteract}
      onClick={() => client.command({ kind: 'prediction-reveal', stepId })}
    >
      Reveal prediction
    </Button>
  );
}

type Choice = { kind: GameResultKind; faction: string | null; alliance: string[] };

/* The declaring player's bar: one faction, an alliance of factions or no winner, then Declare. */
function DeclareBar({ client, table }: Props) {
  const [choice, change] = useReducer((state: Choice, patch: Partial<Choice>) => ({ ...state, ...patch }), {
    kind: 'faction',
    faction: null,
    alliance: [],
  });
  const factionIds =
    choice.kind === 'faction'
      ? choice.faction
        ? [choice.faction]
        : []
      : choice.kind === 'alliance'
        ? choice.alliance
        : [];
  const valid = resultFactionCountFits(choice.kind, factionIds.length);
  const options = factionOptions(table);
  const stepId = unrevealedPrediction(table);
  return (
    <DecisionBar
      eyebrow="Determine winner"
      title="Declare the result"
      context="Every player sees that you are determining the winner, and anyone holding a prediction is reminded to reveal it. Declaring finishes the game."
      readiness={
        <Stack gap="sm">
          <SegmentedControl
            aria-label="Result"
            data={KINDS}
            value={choice.kind}
            onChange={(kind) => change({ kind: kind as GameResultKind })}
            disabled={!table.canInteract}
          />
          {choice.kind === 'faction' && (
            <Select
              label="Winning faction"
              data={options}
              value={choice.faction}
              onChange={(faction) => change({ faction })}
              disabled={!table.canInteract}
            />
          )}
          {choice.kind === 'alliance' && (
            <MultiSelect
              label="Winning alliance"
              data={options}
              value={choice.alliance}
              onChange={(alliance) => change({ alliance })}
              disabled={!table.canInteract}
            />
          )}
          <Group gap="xs" justify="flex-end">
            {stepId && <RevealButton client={client} table={table} stepId={stepId} />}
            <Button
              variant="default"
              disabled={!table.canInteract}
              onClick={() => client.command({ kind: 'result-cancel' })}
            >
              Stop
            </Button>
            <Button
              disabled={!table.canInteract || !valid}
              onClick={() => valid && client.command({ kind: 'result-declare', result: choice.kind, factionIds })}
            >
              Declare
            </Button>
          </Group>
        </Stack>
      }
    />
  );
}

/**
 * The important-decision bar for the end of the game, in the accepted arrangement (#1016): the declaring player chooses and declares, every other panel names who is determining the winner and reminds a prediction holder to reveal, and a finished game names its result with Continue playing.
 * Nothing reveals by itself and nothing waits for a reveal.
 */
export function ResultDecisionBar({ client, table }: Props) {
  const { ending, result, stage } = table.snapshot;
  const seated = table.viewer.viewerSeat !== SPECTATOR_SEAT;
  const stepId = seated ? unrevealedPrediction(table) : undefined;
  const reveal = stepId && <RevealButton client={client} table={table} stepId={stepId} />;
  if (stage === 'play' && ending) {
    if (seated && ending.by.seat === table.viewer.viewerSeat) {
      return <DeclareBar client={client} table={table} />;
    }
    return (
      <DecisionBar
        eyebrow="Determine winner"
        title={`${ending.by.name} is determining the winner`}
        context={
          stepId
            ? 'You hold a locked prediction. Reveal it now if it should count; the result does not wait for it.'
            : 'Anyone holding a locked prediction can reveal it now.'
        }
        action={reveal}
      />
    );
  }
  if (stage === 'finished' && result) {
    return (
      <DecisionBar
        eyebrow="Finished"
        title={describeResult(
          result.kind,
          result.factionIds.map((id) => factionName(table, id))
        )}
        context={`Declared by ${result.by.name}. ${seated ? 'Any player can continue the game from Mentat pause of this turn.' : 'The table stays as it was.'}`}
        action={
          seated && (
            <Group gap="xs">
              {reveal}
              <Button disabled={!table.canInteract} onClick={() => client.command({ kind: 'result-continue' })}>
                Continue playing
              </Button>
            </Group>
          )
        }
      />
    );
  }
  return null;
}

/** The plain Mentat pause control that opens the end-of-game sequence for every player. */
export function DetermineWinner({ client, table }: Props) {
  const mentat = table.snapshot.stage === 'play' && phaseAt(table.snapshot.phase).id === 'mentat-pause';
  if (!mentat || table.snapshot.ending || table.viewer.viewerSeat === SPECTATOR_SEAT) {
    return null;
  }
  return (
    <Button variant="default" disabled={!table.canInteract} onClick={() => client.command({ kind: 'result-open' })}>
      Determine winner
    </Button>
  );
}
