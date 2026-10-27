import { Button, Group, Select, Slider, Stack, Switch, Text } from '@mantine/core';
import { playCreateGameRequestSchema } from '@shared/play/admission';
import { playGameNameSchema } from '@shared/play/gameNames';
import { generatePlayGameName } from '@shared/play/generatedGameNames';
import { DEFAULT_LAST_TURN, MAX_LAST_TURN, MIN_LAST_TURN } from '@shared/play/lastTurn';
import {
  DEFAULT_TABLE_SEAT_COUNT,
  isTableSeatCount,
  TABLE_SEAT_COUNTS,
  tableSeatAngles,
} from '@shared/play/tableSettings';
import { FormError } from '@ui/block/FormError';
import { PageTitle } from '@ui/block/PageTitle';
import { Eyebrow } from '@ui/content/Eyebrow';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { DarkSchemeIsland, darkSchemeIslandAttributes } from '@ui/surface/DarkSchemeIsland';
import { Dices } from 'lucide-react';
import type { Dispatch, ReactNode } from 'react';
import { createPortal } from 'react-dom';

import type { CreatableRuleset, CreatableRulesetPreview, useCreateGame } from '@db/play';
import { GameNameInput } from '@app/pickers/GameNameInput';

import styles from './CreateGamePass.module.css';
import { RulesetManifest } from './RulesetManifest';

/*
 * The create page is a boarding pass from the app to the table (Norbert, 2026-10-12): the pass itself is the app's
 * paper, where the game gets its name and ruleset, and its stub is already the table's dark ground, where the seats
 * are counted. The generated name is the default; a custom name is the optional step.
 * The Play create page and the tutorial chapter that teaches it both show it.
 */

const TITLE = 'Create a game';
const MINIMUM = TABLE_SEAT_COUNTS[0];
const MAXIMUM = TABLE_SEAT_COUNTS[TABLE_SEAT_COUNTS.length - 1]!;
const MARKS = [2, 6, 10, 14, 18].map((value) => ({ value, label: String(value) }));

/** The pass as it is being filled in, owned by the page; a refusal from the server is held with it, and the next change clears it. */
export type CreateGameDraft = {
  generatedName: string;
  custom: boolean;
  customName: string;
  rulesetId: string;
  minimumPlayers: number;
  lastTurn: number;
  refusal: string | null;
};
export type CreateGameDraftEvent =
  | { kind: 'patch'; update: Partial<Omit<CreateGameDraft, 'generatedName' | 'refusal'>> }
  | { kind: 'reroll' }
  | { kind: 'refused'; reason: string };

export const initialCreateGameDraft = (): CreateGameDraft => ({
  generatedName: generatePlayGameName(),
  custom: false,
  customName: '',
  rulesetId: '',
  minimumPlayers: DEFAULT_TABLE_SEAT_COUNT,
  lastTurn: DEFAULT_LAST_TURN,
  refusal: null,
});

/* One draft, one reducer: a field change, a new draw and a refusal from the server are the events. */
export function createGameDraftReducer(state: CreateGameDraft, event: CreateGameDraftEvent): CreateGameDraft {
  switch (event.kind) {
    case 'patch':
      return { ...state, ...event.update, refusal: null };
    case 'reroll':
      return { ...state, generatedName: generatePlayGameName(), refusal: null };
    case 'refused':
      return { ...state, refusal: event.reason };
  }
}

/* The name the game will carry: the custom one once typed, else the generated one. */
function createdGameName(draft: CreateGameDraft) {
  return draft.custom && draft.customName.trim() ? draft.customName.trim() : draft.generatedName;
}

/* A custom name's first problem once something is typed, and whether the name the game would carry is ready. */
function customNameCheck(draft: CreateGameDraft) {
  const customName = draft.custom ? playGameNameSchema.safeParse(draft.customName) : null;
  return {
    nameError:
      customName && !customName.success && draft.customName.trim() ? customName.error.issues[0]?.message : undefined,
    nameReady: customName === null || customName.success,
  };
}

/** A ruleset the pass offers, by what it shows of it; a creatable ruleset from Convex is one. */
export type PassRuleset = Readonly<Omit<CreatableRuleset, 'id'> & { id: string }>;

/** A game to create, as the pass's fields hold it, and the request the button sends. */
export type CreateGameRequest = Parameters<ReturnType<typeof useCreateGame>['mutate']>[0];

/**
 * The create page's pass: the game's name, ruleset, seats and last turn, and the button that creates it.
 * The page owns the draft, since its one query carries the chosen ruleset, and it creates the game and opens it;
 * the pass says what it is doing through `pending`, `departing` and `notice`, and fades to the table's ground while it departs.
 */
export function CreateGamePass({
  rulesets,
  preview,
  draft,
  dispatch,
  pending,
  departing,
  notice,
  failure,
  onCreate,
  rulesetLink,
}: Readonly<{
  rulesets: readonly PassRuleset[];
  preview: CreatableRulesetPreview | null;
  draft: CreateGameDraft;
  dispatch: Dispatch<CreateGameDraftEvent>;
  /** Whether the request is on its way. */
  pending: boolean;
  /** Whether the page is fading to the table, once the game is created. */
  departing: boolean;
  /** What the line under Create game says in place of the pass's own summary, such as the server being out of reach. */
  notice: string | null;
  /** Why the last request failed, besides a refusal the draft holds. */
  failure: string | null;
  onCreate: (request: CreateGameRequest) => void;
  rulesetLink: (slug: string) => (rootProps: object) => ReactNode;
}>) {
  const chosen = rulesets.find((ruleset) => ruleset.id === draft.rulesetId);
  const request = playCreateGameRequestSchema.safeParse({
    rulesetId: draft.rulesetId,
    minimumPlayers: draft.minimumPlayers,
    lastTurn: draft.lastTurn,
  });
  const { nameError, nameReady } = customNameCheck(draft);
  const objection = chosen?.objection ?? null;
  const canCreate =
    nameReady && request.success && chosen !== undefined && objection === null && !pending && !departing;
  const submit = () => {
    if (canCreate && request.success) {
      onCreate(
        draft.custom
          ? { ...request.data, name: draft.customName }
          : { ...request.data, generatedName: draft.generatedName }
      );
    }
  };
  const shownFailure = draft.refusal ?? failure;
  const waiting =
    notice ??
    readiness({
      chosen,
      objection,
      nameReady,
      summary: `${createdGameName(draft)}, ${chosen?.name}, ${draft.minimumPlayers} seats, ${draft.lastTurn} turns.`,
    });

  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <PageTitle title={TITLE} subtitle="From dune.zone to the table" />
      </PageLayout.Header>
      <PageLayout.Content>
        <form
          className={styles.pass}
          aria-label="New game"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Surface padding="xl">
            <Stack gap="xl" className={styles.main}>
              <NameField draft={draft} dispatch={dispatch} error={nameError} disabled={pending} />
              <RulesetField
                rulesets={rulesets}
                value={draft.rulesetId}
                onChange={(rulesetId) => dispatch({ kind: 'patch', update: { rulesetId } })}
                disabled={pending}
              />
              {chosen && preview ? (
                <RulesetManifest ruleset={chosen} preview={preview} rulesetLink={rulesetLink} />
              ) : null}
              <PassFacts ruleset={chosen?.name ?? null} seats={draft.minimumPlayers} lastTurn={draft.lastTurn} />
            </Stack>
          </Surface>
          <DarkSchemeIsland>
            <div className={styles.stub} {...darkSchemeIslandAttributes}>
              <Surface padding="xl">
                <Stack gap="lg">
                  <SeatsField
                    value={draft.minimumPlayers}
                    onChange={(minimumPlayers) => dispatch({ kind: 'patch', update: { minimumPlayers } })}
                    disabled={pending}
                  />
                  <LastTurnField
                    value={draft.lastTurn}
                    onChange={(lastTurn) => dispatch({ kind: 'patch', update: { lastTurn } })}
                    disabled={pending}
                  />
                  {shownFailure ? <FormError title="Not created">{shownFailure}</FormError> : null}
                  <Stack gap="xs">
                    <Button type="submit" size="lg" fullWidth disabled={!canCreate} loading={pending}>
                      Create game
                    </Button>
                    <Text size="sm" c="dimmed" ta="center" role="status">
                      {waiting}
                    </Text>
                  </Stack>
                </Stack>
              </Surface>
            </div>
          </DarkSchemeIsland>
        </form>
        {departing && notice === null
          ? createPortal(<div className={styles.departure} aria-hidden />, document.body)
          : null}
      </PageLayout.Content>
    </PageLayout>
  );
}

/* What the line under Create game says while the pass is still being filled in. */
function readiness({
  chosen,
  objection,
  nameReady,
  summary,
}: Readonly<{ chosen: PassRuleset | undefined; objection: string | null; nameReady: boolean; summary: string }>) {
  if (!chosen) {
    return 'Choose a ruleset to board.';
  }
  if (objection) {
    return `${chosen.name} cannot start a game yet.`;
  }
  return nameReady ? summary : 'Type a custom name, or turn the switch off to keep the generated one.';
}

function NameField({
  draft,
  dispatch,
  error,
  disabled,
}: Readonly<{
  draft: CreateGameDraft;
  dispatch: (event: CreateGameDraftEvent) => void;
  error?: string;
  disabled: boolean;
}>) {
  return (
    <Stack gap="sm">
      <Eyebrow>This will be the name of your game</Eyebrow>
      <p
        className={styles.name}
        aria-live="polite"
        data-pending={draft.custom && !draft.customName.trim() ? '' : undefined}
      >
        {createdGameName(draft)}
      </p>
      <Group gap="md">
        {draft.custom ? null : (
          <Button
            variant="default"
            size="xs"
            radius="xl"
            leftSection={<Dices size={15} aria-hidden />}
            onClick={() => dispatch({ kind: 'reroll' })}
            disabled={disabled}
          >
            Roll another name
          </Button>
        )}
        <Switch
          label="Set a custom name"
          checked={draft.custom}
          onChange={(event) => dispatch({ kind: 'patch', update: { custom: event.currentTarget.checked } })}
          disabled={disabled}
        />
      </Group>
      {draft.custom ? (
        <GameNameInput
          value={draft.customName}
          onChange={(customName) => dispatch({ kind: 'patch', update: { customName } })}
          error={error}
          disabled={disabled}
        />
      ) : null}
    </Stack>
  );
}

/* The pass's printed line: what this game is, read back from the choices above. */
function PassFacts({
  ruleset,
  seats,
  lastTurn,
}: Readonly<{ ruleset: string | null; seats: number; lastTurn: number }>) {
  const facts = [
    { label: 'Your seat', value: '1' },
    { label: 'Ruleset', value: ruleset ?? 'Not chosen' },
    { label: 'Seats', value: String(seats) },
    { label: 'Last turn', value: String(lastTurn) },
    { label: 'First stop', value: 'Drafting' },
  ];
  return (
    <dl className={styles.facts}>
      {facts.map((fact) => (
        <div key={fact.label}>
          <dt>{fact.label}</dt>
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* A searchable dropdown, since a catalogue of forty rulesets would push the rest of the pass off the screen as a list. */
function RulesetField({
  rulesets,
  value,
  onChange,
  disabled,
}: Readonly<{ rulesets: readonly PassRuleset[]; value: string; onChange: (id: string) => void; disabled: boolean }>) {
  const chosen = rulesets.find((ruleset) => ruleset.id === value);
  const objections = new Map<string, string | null>(rulesets.map((ruleset) => [ruleset.id, ruleset.objection]));
  return (
    <Select
      label="Ruleset"
      placeholder="Choose a ruleset"
      searchable
      nothingFoundMessage="No ruleset has that name"
      value={value || null}
      onChange={(id) => id && onChange(id)}
      allowDeselect={false}
      disabled={disabled}
      data={rulesets.map((ruleset) => ({
        value: ruleset.id,
        label: ruleset.name,
        disabled: !ruleset.selectable,
      }))}
      renderOption={({ option }) => {
        const objection = objections.get(option.value);
        return (
          <Stack gap={0}>
            <Text size="sm">{option.label}</Text>
            {objection ? (
              <Text size="xs" c="red">
                {objection}
              </Text>
            ) : null}
          </Stack>
        );
      }}
      description={
        chosen ? (
          <Text component="span" size="xs" c={chosen.objection ? 'red' : 'dimmed'}>
            {chosen.objection ?? 'The board and decks are linked. The table checks every card when it prepares.'}
          </Text>
        ) : undefined
      }
      comboboxProps={{ shadow: 'md' }}
    />
  );
}

/* A stub field's heading, with its slider's value printed large beside it. */
function CountHeading({ label, value }: Readonly<{ label: string; value: number }>) {
  return (
    <Group justify="space-between" align="baseline" wrap="nowrap">
      <Eyebrow>{label}</Eyebrow>
      <span className={styles.count} aria-hidden>
        {value}
      </span>
    </Group>
  );
}

function SeatsField({
  value,
  onChange,
  disabled,
}: Readonly<{ value: number; onChange: (value: number) => void; disabled: boolean }>) {
  return (
    <Stack gap="md">
      <CountHeading label="Seats at the table" value={value} />
      <Slider
        color="slate.3"
        min={MINIMUM}
        max={MAXIMUM}
        step={1}
        marks={MARKS}
        value={value}
        onChange={onChange}
        thumbLabel="Minimum players"
        label={null}
        disabled={disabled}
        mb="md"
      />
      <SeatRow seats={value} />
      <SeatRing seats={value} />
      <Text size="sm" c="dimmed">
        The minimum number of players is the number of seats. You take the first; drafting seats the rest, and anyone
        who arrives after that watches.
      </Text>
    </Stack>
  );
}

const TURN_MARKS = [1, 5, 10, 15, 20].map((value) => ({ value, label: String(value) }));

/* The game's length, which the Phase tab can still change once the game plays. */
function LastTurnField({
  value,
  onChange,
  disabled,
}: Readonly<{ value: number; onChange: (value: number) => void; disabled: boolean }>) {
  return (
    <Stack gap="md" className={styles.turns}>
      <CountHeading label="Last turn" value={value} />
      <Slider
        color="slate.3"
        min={MIN_LAST_TURN}
        max={MAX_LAST_TURN}
        step={1}
        marks={TURN_MARKS}
        value={value}
        onChange={onChange}
        thumbLabel="Last turn"
        label={null}
        disabled={disabled}
        mb="md"
      />
      <Text size="sm" c="dimmed">
        The turn wheel counts to it. The table can play on past it, and the Phase tab changes it during the game.
      </Text>
    </Stack>
  );
}

/* Every possible seat, numbered: the table's seats lit, the rest left as places a larger game would add. */
function SeatRow({ seats }: Readonly<{ seats: number }>) {
  return (
    <ol className={styles.berths} aria-hidden>
      {Array.from({ length: MAXIMUM }, (_, index) => (
        <li key={index} className={styles.berth} data-state={index === 0 ? 'you' : index < seats ? 'open' : 'unused'}>
          {index === 0 ? 'You' : index + 1}
        </li>
      ))}
    </ol>
  );
}

const RING_RADIUS = 118;

/* The board as the table lays it out: the seats sit round its rim at the angles the table uses, seat one nearest you. */
function SeatRing({ seats }: Readonly<{ seats: number }>) {
  const angles = isTableSeatCount(seats) ? tableSeatAngles(seats) : [];
  return (
    <svg className={styles.ring} viewBox="-140 -140 280 280" role="img" aria-label={`${seats} seats round the board`}>
      <circle className={styles.ringGround} r="132" />
      <image href="/vector/background/map.svg" x="-100" y="-100" width="200" height="200" />
      {angles.map((angle, index) => {
        /* The table measures counter-clockwise from the right; the page's y axis runs down. */
        const degrees = (-angle * 180) / Math.PI;
        return (
          <g
            key={index}
            className={styles.station}
            data-you={index === 0 ? '' : undefined}
            style={{ transform: `rotate(${degrees}deg) translateX(${RING_RADIUS}px) rotate(${-degrees}deg)` }}
          >
            <circle r={index === 0 ? 12 : 9} />
            <text textAnchor="middle" dy="3.5">
              {index === 0 ? 'You' : index + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
