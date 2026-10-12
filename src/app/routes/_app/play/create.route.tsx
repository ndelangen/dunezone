import { Button, Group, Select, Slider, Stack, Switch, Text } from '@mantine/core';
import { playCreateGameRequestSchema } from '@shared/play/admission';
import { playGameNameSchema } from '@shared/play/gameNames';
import { generatePlayGameName } from '@shared/play/generatedGameNames';
import { DEFAULT_LAST_TURN, MAX_LAST_TURN, MIN_LAST_TURN } from '@shared/play/lastTurn';
import { PLAY_SEAT_LIMIT_MESSAGE } from '@shared/play/seatLimit';
import {
  DEFAULT_TABLE_SEAT_COUNT,
  isTableSeatCount,
  TABLE_SEAT_COUNTS,
  tableSeatAngles,
} from '@shared/play/tableSettings';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { FormError } from '@ui/block/FormError';
import { LoadPending } from '@ui/block/LoadPending';
import { LoginGate } from '@ui/block/LoginGate';
import { PageTitle } from '@ui/block/PageTitle';
import { Eyebrow } from '@ui/content/Eyebrow';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { Dices } from 'lucide-react';
import { useReducer, useRef, useState } from 'react';
import type { Dispatch } from 'react';
import { createPortal } from 'react-dom';

import { useCreatableRulesets, useCreateGame } from '@db/play';
import type { CreatableRuleset, CreatableRulesetPreview } from '@db/play';
import { GameNameInput } from '@app/pickers/GameNameInput';
import { pageHead } from '@app/routes/pageTitle';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

import styles from './create.module.css';
import { DarkSchemeIsland, darkSchemeIslandAttributes } from './DarkSchemeIsland';
import { RulesetManifest } from './RulesetManifest';
import { SERVER_RETRYING, SERVER_UNREACHABLE_TITLE, useServerUnreachable } from './useServerUnreachable';

export const Route = createFileRoute('/_app/play/create')({
  head: () => pageHead('Create a game', { noindex: true }),
  component: CreateGamePage,
});

/*
 * The create page is a boarding pass from the app to the table (Norbert, 2026-10-12): the pass itself is the app's
 * paper, where the game gets its name and ruleset, and its stub is already the table's dark ground, where the seats
 * are counted. The generated name is the default; a custom name is the optional step.
 */
const TITLE = 'Create a game';
const MINIMUM = TABLE_SEAT_COUNTS[0];
const MAXIMUM = TABLE_SEAT_COUNTS[TABLE_SEAT_COUNTS.length - 1]!;
const MARKS = [2, 6, 10, 14, 18].map((value) => ({ value, label: String(value) }));
/* As long as the fade to the table's ground in create.module.css takes. */
const DEPARTURE_MS = 700;

type Draft = {
  generatedName: string;
  custom: boolean;
  customName: string;
  rulesetId: string;
  minimumPlayers: number;
  lastTurn: number;
  refusal: string | null;
};
type DraftEvent =
  | { kind: 'patch'; update: Partial<Omit<Draft, 'generatedName' | 'refusal'>> }
  | { kind: 'reroll' }
  | { kind: 'refused'; reason: string };

const initialDraft = (): Draft => ({
  generatedName: generatePlayGameName(),
  custom: false,
  customName: '',
  rulesetId: '',
  minimumPlayers: DEFAULT_TABLE_SEAT_COUNT,
  lastTurn: DEFAULT_LAST_TURN,
  refusal: null,
});

/* One draft, one reducer: a field change, a new draw and a refusal from the server are the events. */
function draftReducer(state: Draft, event: DraftEvent): Draft {
  switch (event.kind) {
    case 'patch':
      return { ...state, ...event.update, refusal: null };
    case 'reroll':
      return { ...state, generatedName: generatePlayGameName(), refusal: null };
    case 'refused':
      return { ...state, refusal: event.reason };
  }
}

const REFUSALS = {
  not_authorized: 'Your account cannot create a game while signed out, suspended or deleted.',
  rate_limited: 'Too many games were created recently. Try again later.',
  seat_limit: PLAY_SEAT_LIMIT_MESSAGE,
  unavailable: 'That ruleset cannot start a game right now.',
  invalid_name: 'Choose a game name with 1 to 80 characters and at least one Latin letter or number.',
  profanity_detected: 'Choose a game name without profanity. Your other choices are still here.',
} as const;

function CreateGamePage() {
  /* The draft lives here so the page's one query can carry the chosen ruleset and answer with its manifest. */
  const [draft, dispatch] = useReducer(draftReducer, undefined, initialDraft);
  const { data } = useCreatableRulesets(draft.rulesetId);
  const unreachable = useServerUnreachable(data === undefined);
  switch (data?.access) {
    case undefined:
      return (
        <PageMessage size="compact" title={TITLE} back={<PageMessage.Back to="/">Go back home</PageMessage.Back>}>
          {unreachable ? (
            <LoadPending title={SERVER_UNREACHABLE_TITLE}>{SERVER_RETRYING}</LoadPending>
          ) : (
            <LoadPending title="Loading rulesets">
              The rulesets you can start a game with are still loading.
            </LoadPending>
          )}
        </PageMessage>
      );
    case 'unauthenticated':
      return (
        <PageMessage size="compact" title={TITLE}>
          <LoginGate action="create a game" />
        </PageMessage>
      );
    case 'allowed':
      return (
        <CreateGameForm
          rulesets={data.rulesets}
          preview={data.preview?.rulesetId === draft.rulesetId ? data.preview : null}
          draft={draft}
          dispatch={dispatch}
        />
      );
  }
}

function CreateGameForm({
  rulesets,
  preview,
  draft,
  dispatch,
}: Readonly<{
  rulesets: CreatableRuleset[];
  preview: CreatableRulesetPreview | null;
  draft: Draft;
  dispatch: Dispatch<DraftEvent>;
}>) {
  const navigate = useNavigate();
  const createGame = useCreateGame();
  const chosen = rulesets.find((ruleset) => ruleset.id === draft.rulesetId);
  const request = playCreateGameRequestSchema.safeParse({
    rulesetId: draft.rulesetId,
    minimumPlayers: draft.minimumPlayers,
    lastTurn: draft.lastTurn,
  });
  const customName = draft.custom ? playGameNameSchema.safeParse(draft.customName) : null;
  const nameError =
    customName && !customName.success && draft.customName.trim() ? customName.error.issues[0]?.message : undefined;
  const nameReady = customName === null || customName.success;
  const objection = chosen?.objection ?? null;
  const canCreate = nameReady && request.success && chosen !== undefined && objection === null && !createGame.isPending;
  const shownName = draft.custom && draft.customName.trim() ? draft.customName.trim() : draft.generatedName;
  /* Pressing Create game fades the page to the table's ground; the game opens once the fade is complete, and a refusal lifts it again. */
  const [departing, setDeparting] = useState(false);
  const departedAt = useRef(0);
  const submit = () => {
    if (canCreate && request.success) {
      departedAt.current = performance.now();
      setDeparting(true);
      createGame.mutate(
        draft.custom
          ? { ...request.data, name: draft.customName }
          : { ...request.data, generatedName: draft.generatedName },
        {
          onSuccess: (result) => {
            if (result.ok) {
              const remaining = Math.max(0, DEPARTURE_MS - (performance.now() - departedAt.current));
              setTimeout(
                () => void navigate({ to: '/play/$gameId', params: { gameId: result.slug ?? result.gameId } }),
                remaining
              );
            } else {
              setDeparting(false);
              dispatch({ kind: 'refused', reason: REFUSALS[result.reason] });
            }
          },
          onError: () => setDeparting(false),
        }
      );
    }
  };
  const failure = draft.refusal ?? (createGame.error ? 'The game could not be created. Try again.' : null);
  const waiting = !chosen
    ? 'Choose a ruleset to board.'
    : objection
      ? `${chosen.name} cannot start a game yet.`
      : !nameReady
        ? 'Type a custom name, or turn the switch off to keep the generated one.'
        : `${shownName}, ${chosen.name}, ${draft.minimumPlayers} seats, ${draft.lastTurn} turns.`;

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
              <NameField draft={draft} dispatch={dispatch} error={nameError} disabled={createGame.isPending} />
              <RulesetField
                rulesets={rulesets}
                value={draft.rulesetId}
                onChange={(rulesetId) => dispatch({ kind: 'patch', update: { rulesetId } })}
                disabled={createGame.isPending}
              />
              {chosen && preview ? <RulesetManifest ruleset={chosen} preview={preview} /> : null}
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
                    disabled={createGame.isPending}
                  />
                  <LastTurnField
                    value={draft.lastTurn}
                    onChange={(lastTurn) => dispatch({ kind: 'patch', update: { lastTurn } })}
                    disabled={createGame.isPending}
                  />
                  {failure ? <FormError title="Not created">{failure}</FormError> : null}
                  <Stack gap="xs">
                    <Button type="submit" size="lg" fullWidth disabled={!canCreate} loading={createGame.isPending}>
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
        {departing ? createPortal(<div className={styles.departure} aria-hidden />, document.body) : null}
      </PageLayout.Content>
    </PageLayout>
  );
}

function NameField({
  draft,
  dispatch,
  error,
  disabled,
}: Readonly<{ draft: Draft; dispatch: (event: DraftEvent) => void; error?: string; disabled: boolean }>) {
  return (
    <Stack gap="sm">
      <Eyebrow>This will be the name of your game</Eyebrow>
      <p className={styles.name} data-pending={draft.custom && !draft.customName.trim() ? '' : undefined}>
        {draft.custom && draft.customName.trim() ? draft.customName.trim() : draft.generatedName}
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
}: Readonly<{ rulesets: CreatableRuleset[]; value: string; onChange: (id: string) => void; disabled: boolean }>) {
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
      data={rulesets.map((ruleset) => ({ value: ruleset.id, label: ruleset.name }))}
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
            {chosen.objection ?? 'Both decks are linked. The table checks every card when it prepares.'}
          </Text>
        ) : undefined
      }
      comboboxProps={{ shadow: 'md' }}
    />
  );
}

function SeatsField({
  value,
  onChange,
  disabled,
}: Readonly<{ value: number; onChange: (value: number) => void; disabled: boolean }>) {
  return (
    <Stack gap="md">
      <Group justify="space-between" align="baseline" wrap="nowrap">
        <Eyebrow>Seats at the table</Eyebrow>
        <span className={styles.count} aria-hidden>
          {value}
        </span>
      </Group>
      <Slider
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
      <Group justify="space-between" align="baseline" wrap="nowrap">
        <Eyebrow>Last turn</Eyebrow>
        <span className={styles.count} aria-hidden>
          {value}
        </span>
      </Group>
      <Slider
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
