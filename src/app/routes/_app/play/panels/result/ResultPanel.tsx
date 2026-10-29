import { Button, Group, MultiSelect, Radio, Select, Stack, Text, VisuallyHidden } from '@mantine/core';
import type { GameResultKind } from '@shared/play/result';
import { Section } from '@ui/block/Section';
import type { ReactNode } from 'react';

import { factionOption } from '../../multiplayer/factionOption';
import type { FactionOption } from '../../multiplayer/factionOption';

const KINDS: { value: GameResultKind; label: string }[] = [
  { value: 'faction', label: 'Faction' },
  { value: 'alliance', label: 'Alliance' },
  { value: 'none', label: 'No winner' },
];

export type Choice = { kind: GameResultKind; faction: string | null; alliance: string[] };

/** The factions a choice names: its faction, its alliance, or none. */
export function chosenFactions(choice: Choice): string[] {
  if (choice.kind === 'alliance') {
    return choice.alliance;
  }
  return choice.kind === 'faction' && choice.faction ? [choice.faction] : [];
}

/**
 * How the viewer's own locked, unrevealed prediction is revealed: by its button, by placing its card on the table, or not at all because the viewer holds none.
 */
export type PredictionReveal = 'button' | 'card' | null;

/** The end of the game as one viewer sees it. */
export type ResultState =
  | Readonly<{
      /** The viewer is determining the winner: one faction, an alliance of factions or no winner, then Declare. */
      kind: 'declaring';
      options: readonly FactionOption[];
      choice: Choice;
      /** Whether the choice names as many factions as its kind needs. */
      valid: boolean;
    }>
  | Readonly<{ kind: 'determining'; /** The player determining the winner. */ name: string }>
  | Readonly<{
      kind: 'finished';
      /** The declared result, in words. */
      title: string;
      by: string;
      /** A seated player can continue the game; an observer cannot. */
      player: boolean;
    }>;

export type ResultPanelProps = Readonly<{
  /** Nothing to settle: no ending is under way and the game is not finished, or the table shows an earlier turn. */
  state: ResultState | null;
  prediction: PredictionReveal;
  revealedPrediction?: string;
  /** The actions are greyed out while the table is not taking moves. */
  disabled: boolean;
  onReveal: () => void;
  onChange: (patch: Partial<Choice>) => void;
  onStop: () => void;
  onDeclare: () => void;
}>;

/** One state of the end of the game, as the Result window's section: what is happening, and what this viewer can do. */
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

function RevealButton({ disabled, onReveal }: Pick<ResultPanelProps, 'disabled' | 'onReveal'>) {
  return (
    <Button variant="default" disabled={disabled} onClick={onReveal}>
      Reveal prediction
    </Button>
  );
}

/* The declaring player's bar: one faction, an alliance of factions or no winner, then Declare. */
function DeclareBar({
  state: { options, choice, valid },
  prediction,
  disabled,
  onReveal,
  onChange,
  onStop,
  onDeclare,
}: ResultPanelProps & Readonly<{ state: Extract<ResultState, { kind: 'declaring' }> }>) {
  return (
    <ResultSection
      eyebrow="Determine winner"
      title="Declare the result"
      context={`Every player sees that you are determining the winner, and anyone holding a prediction is reminded to reveal it. ${prediction === 'card' ? 'To reveal yours, place its card on the table before declaring. ' : ''}Declaring finishes the game.`}
      readiness={
        <Stack gap="sm">
          <Radio.Group
            label={<VisuallyHidden>Result</VisuallyHidden>}
            value={choice.kind}
            onChange={(kind) => onChange({ kind: kind as GameResultKind })}
            disabled={disabled}
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
              renderOption={({ option }) => factionOption(options, option.value)}
              value={choice.faction}
              onChange={(faction) => onChange({ faction })}
              disabled={disabled}
            />
          )}
          {choice.kind === 'alliance' && (
            <MultiSelect
              label="Winning alliance"
              data={options}
              renderOption={({ option }) => factionOption(options, option.value)}
              value={choice.alliance}
              onChange={(alliance) => onChange({ alliance })}
              disabled={disabled}
            />
          )}
          <Group gap="xs" justify="flex-end">
            {prediction === 'button' && <RevealButton disabled={disabled} onReveal={onReveal} />}
            <Button variant="default" disabled={disabled} onClick={onStop}>
              Stop
            </Button>
            <Button disabled={disabled || !valid} onClick={() => valid && onDeclare()}>
              Declare
            </Button>
          </Group>
        </Stack>
      }
    />
  );
}

/* Every other window while one player determines the winner: the reveal reminder, never a block. */
function DeterminingBar({
  name,
  prediction,
  disabled,
  onReveal,
}: Pick<ResultPanelProps, 'prediction' | 'disabled' | 'onReveal'> & Readonly<{ name: string }>) {
  return (
    <ResultSection
      eyebrow="Determine winner"
      title={`${name} is determining the winner`}
      context={
        prediction === 'card'
          ? 'You hold a locked prediction. Place its card on the table now if it should count; the result does not wait for it.'
          : prediction === 'button'
            ? 'You hold a locked prediction. Reveal it now if it should count; the result does not wait for it.'
            : 'Anyone holding a locked prediction can reveal it now.'
      }
      action={prediction === 'button' && <RevealButton disabled={disabled} onReveal={onReveal} />}
    />
  );
}

function FinishedBar({
  state: { title, by, player },
  prediction,
  disabled,
  onReveal,
}: ResultPanelProps & Readonly<{ state: Extract<ResultState, { kind: 'finished' }> }>) {
  return (
    <ResultSection
      eyebrow="Finished"
      title={title}
      context={`Declared by ${by}. ${player ? 'Continue playing, at the top right, resumes the game from Mentat Pause of this turn.' : 'The table stays as it was.'}`}
      action={player && prediction && <RevealButton disabled={disabled} onReveal={onReveal} />}
    />
  );
}

/**
 * The Result window for the end of the game, in the accepted arrangement (#1016): the declaring player chooses and declares, every other window names who is determining the winner and reminds a prediction holder to reveal, and a finished game names its result with Continue playing.
 * Nothing reveals by itself and nothing waits for a reveal.
 */
export function ResultPanel(props: ResultPanelProps) {
  const { state } = props;
  if (!state) {
    return null;
  }
  let result: ReactNode;
  switch (state.kind) {
    case 'declaring':
      result = <DeclareBar {...props} state={state} />;
      break;
    case 'determining':
      result = <DeterminingBar {...props} name={state.name} />;
      break;
    case 'finished':
      result = <FinishedBar {...props} state={state} />;
      break;
  }
  return (
    <Stack gap="sm">
      {result}
      {props.revealedPrediction && <Text size="sm">{props.revealedPrediction}</Text>}
    </Stack>
  );
}
