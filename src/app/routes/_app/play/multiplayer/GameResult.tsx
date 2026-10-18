import { Button, Group, MultiSelect, Radio, Select, Stack, VisuallyHidden } from '@mantine/core';
import { phaseAt } from '@shared/play/phases';
import { describeResult, resultFactionCountFits } from '@shared/play/result';
import type { GameResult, GameResultKind } from '@shared/play/result';
import { Section } from '@ui/block/Section';
import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import { predictionCardInHand } from '../prediction/predictionCardInHand';
import { factionName, factionOptions, isSpectator, viewerFaction } from './tableFactions';

type Props = Readonly<{ client: TableSession; table: TableProjection }>;

const KINDS: { value: GameResultKind; label: string }[] = [
  { value: 'faction', label: 'Faction' },
  { value: 'alliance', label: 'Alliance' },
  { value: 'none', label: 'No winner' },
];

/** The viewer's own locked prediction that nobody has seen yet, if any. */
function unrevealedPrediction(table: TableProjection): string | undefined {
  const own = viewerFaction(table);
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

/** One state of the end of the game, as the Result tab's section: what is happening, and what this viewer can do. */
function ResultSection({
  eyebrow,
  title,
  context,
  action,
  readiness,
}: Readonly<{ eyebrow: string; title: string; context?: string; action?: ReactNode; readiness?: ReactNode }>) {
  return (
    <Section eyebrow={eyebrow} title={title} description={context} action={action}>
      {readiness}
    </Section>
  );
}

type Choice = { kind: GameResultKind; faction: string | null; alliance: string[] };

function chosenFactions(choice: Choice): string[] {
  if (choice.kind === 'alliance') {
    return choice.alliance;
  }
  return choice.kind === 'faction' && choice.faction ? [choice.faction] : [];
}

const NO_CHOICE: Choice = { kind: 'faction', faction: null, alliance: [] };

export type DeclareChoice = Readonly<{ choice: Choice; change: (patch: Partial<Choice>) => void }>;

/**
 * The declaring player's pending choice, held above the Result tab so opening another tab (Hand, to reveal a prediction) keeps it.
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

/* The declaring player's bar: one faction, an alliance of factions or no winner, then Declare. */
function DeclareBar({ client, table, declare: { choice, change } }: Props & Readonly<{ declare: DeclareChoice }>) {
  const factionIds = chosenFactions(choice);
  const valid = resultFactionCountFits(choice.kind, factionIds.length);
  const options = factionOptions(table);
  const stepId = unrevealedPrediction(table);
  const byCard = stepId !== undefined && predictionCardInHand(table, stepId);
  return (
    <ResultSection
      eyebrow="Determine winner"
      title="Declare the result"
      context={`Every player sees that you are determining the winner, and anyone holding a prediction is reminded to reveal it. ${byCard ? 'To reveal yours, place its card on the table before declaring. ' : ''}Declaring finishes the game.`}
      readiness={
        <Stack gap="sm">
          <Radio.Group
            label={<VisuallyHidden>Result</VisuallyHidden>}
            value={choice.kind}
            onChange={(kind) => change({ kind: kind as GameResultKind })}
            disabled={!table.canInteract}
          >
            <Group gap="lg" wrap="wrap">
              {KINDS.map(({ value, label }) => (
                <Radio key={value} value={value} label={label} />
              ))}
            </Group>
          </Radio.Group>
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
            {stepId && !byCard && <RevealButton client={client} table={table} stepId={stepId} />}
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
 * The Result tab for the end of the game, in the accepted arrangement (#1016): the declaring player chooses and declares, every other panel names who is determining the winner and reminds a prediction holder to reveal, and a finished game names its result with Continue playing.
 * Nothing reveals by itself and nothing waits for a reveal.
 */
export function ResultControls({ client, table, declare }: Props & Readonly<{ declare: DeclareChoice }>) {
  const { ending, result, stage } = table.snapshot;
  /* Playback shows an earlier table; the live decision is not offered from it. */
  if (table.playback) {
    return null;
  }
  if (stage === 'play' && ending) {
    return ending.by.seat === table.viewer.viewerSeat ? (
      <DeclareBar client={client} table={table} declare={declare} />
    ) : (
      <DeterminingBar client={client} table={table} name={ending.by.name} />
    );
  }
  if (stage === 'finished' && result) {
    return <FinishedBar client={client} table={table} result={result} />;
  }
  return null;
}

/** The viewer's own unrevealed prediction; spectators hold none. */
function ownUnrevealed(table: TableProjection) {
  return seated(table) ? unrevealedPrediction(table) : undefined;
}

function seated(table: TableProjection) {
  return !isSpectator(table);
}

/* Every other panel while one player determines the winner: the reveal reminder, never a block. */
function DeterminingBar({ client, table, name }: Props & Readonly<{ name: string }>) {
  const stepId = ownUnrevealed(table);
  /* During play the prediction card in hand is the reveal; placing it on the table shows the choice. */
  const byCard = stepId !== undefined && predictionCardInHand(table, stepId);
  const reveal = stepId && !byCard && <RevealButton client={client} table={table} stepId={stepId} />;
  return (
    <ResultSection
      eyebrow="Determine winner"
      title={`${name} is determining the winner`}
      context={
        byCard
          ? 'You hold a locked prediction. Place its card on the table now if it should count; the result does not wait for it.'
          : reveal
            ? 'You hold a locked prediction. Reveal it now if it should count; the result does not wait for it.'
            : 'Anyone holding a locked prediction can reveal it now.'
      }
      action={reveal}
    />
  );
}

function FinishedBar({ client, table, result }: Props & Readonly<{ result: GameResult }>) {
  const player = seated(table);
  const stepId = ownUnrevealed(table);
  return (
    <ResultSection
      eyebrow="Finished"
      title={describeResult(
        result.kind,
        result.factionIds.map((id) => factionName(table, id))
      )}
      context={`Declared by ${result.by.name}. ${player ? 'Continue playing, at the top right, resumes the game from Mentat Pause of this turn.' : 'The table stays as it was.'}`}
      action={player && stepId && <RevealButton client={client} table={table} stepId={stepId} />}
    />
  );
}

/** The finished game's words for the phase chip: who won, as the Result tab says it. */
export function resultTitle(table: TableProjection): string | undefined {
  const { result, stage } = table.snapshot;
  return stage === 'finished' && result
    ? describeResult(
        result.kind,
        result.factionIds.map((id) => factionName(table, id))
      )
    : undefined;
}

/** A finished game's one phase control, where Next phase sat: any player resumes it from Mentat Pause of this turn. */
export function ContinuePlaying({ client, table }: Props) {
  if (table.playback || table.snapshot.stage !== 'finished' || !table.snapshot.result || !seated(table)) {
    return null;
  }
  return (
    <Button disabled={!table.canInteract} onClick={() => client.command({ kind: 'result-continue' })}>
      Continue playing
    </Button>
  );
}

/** Any seated player may open the sequence during Mentat Pause of play while nobody else has. */
function canDetermine(table: TableProjection) {
  const { stage, phase, phases, ending } = table.snapshot;
  const mentat = stage === 'play' && phaseAt(phase, phases).id === 'mentat-pause';
  return mentat && !ending && seated(table);
}

/** The plain Mentat Pause control that opens the end-of-game sequence for every player. */
export function DetermineWinner({ client, table }: Props) {
  if (table.playback || !canDetermine(table)) {
    return null;
  }
  return (
    <Button variant="default" disabled={!table.canInteract} onClick={() => client.command({ kind: 'result-open' })}>
      Determine winner
    </Button>
  );
}
