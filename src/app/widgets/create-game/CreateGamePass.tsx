import { Anchor, Box, Divider, Group, Select, Slider, Stack, Switch, Text } from '@mantine/core';
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
import { ActionError } from '@ui/block/ActionError';
import { PageTitle } from '@ui/block/PageTitle';
import { BoardSeats } from '@ui/content/BoardSeats';
import { CountHeading } from '@ui/content/CountHeading';
import { Eyebrow } from '@ui/content/Eyebrow';
import { GameName } from '@ui/content/GameName';
import { SeatRow } from '@ui/content/SeatRow';
import { CallToAction } from '@ui/control/CallToAction';
import { ControlBlock } from '@ui/control/ControlBlock';
import { LabeledAction } from '@ui/control/LabeledAction';
import { TicketLayout } from '@ui/layout/TicketLayout';
import { FactList } from '@ui/list/FactList';
import { TicketMain, TicketStub } from '@ui/surface/TicketSurface';
import { Dices } from 'lucide-react';
import { useEffect, useId } from 'react';
import type { Dispatch, ReactNode } from 'react';

import type { CreatableRuleset, CreatableRulesetPreview, useCreateGame } from '@db/play';
import { GameNameInput } from '@app/pickers/GameNameInput';
import { DepartureCover } from '@app/widgets/voyage/DepartureCover';
import { beginDeparture, endDeparture, leaveDeparture } from '@app/widgets/voyage/voyage';

import styles from './CreateGamePass.module.css';
import { RulesetManifest } from './RulesetManifest';

/*
 * The create page is a boarding pass from the app to the table (Norbert, 2026-10-12): the pass itself is the app's
 * paper, where the game gets its name and ruleset, and its stub is already the table's dark ground, where the seats
 * are counted. The generated name is the default; a custom name is the optional step.
 * The Play create page and the tutorial chapter that teaches it both show it.
 */

const MINIMUM = TABLE_SEAT_COUNTS[0];
const MAXIMUM = TABLE_SEAT_COUNTS[TABLE_SEAT_COUNTS.length - 1]!;
const MARKS = [2, 6, 10, 14, 18].map((value) => ({
  value,
  label: String(value),
}));

/** The create page's title, which the page puts in its header above the pass. */
export function CreateGamePassTitle() {
  return <PageTitle title="Create a game" subtitle="From dune.zone to the table" />;
}

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
  | {
      kind: 'patch';
      update: Partial<Omit<CreateGameDraft, 'generatedName' | 'refusal'>>;
    }
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

/** Where the check of the chosen ruleset's decks and bundles stands. */
export type RulesetCheck = 'checking' | 'ready' | 'unknown';

const RULESET_CHECK_LINES: Record<RulesetCheck, string> = {
  checking: 'Checking every deck and bundle the way the table takes them…',
  ready: 'Every deck and bundle is ready for the table.',
  unknown: 'The decks and bundles could not be checked here. The table checks them when it prepares.',
};

/** A ruleset the pass offers, by what it shows of it; a creatable ruleset from Convex is one. */
export type PassRuleset = Readonly<Omit<CreatableRuleset, 'id'> & { id: string }>;

/** A game to create, as the pass's fields hold it, and the request the button sends. */
export type CreateGameRequest = Parameters<ReturnType<typeof useCreateGame>['mutate']>[0];

/**
 * The create page's pass: the game's name, ruleset, seats and last turn, and the button that creates it.
 * The page owns the draft, since its one query carries the chosen ruleset, and it creates the game and opens it;
 * the pass says what it is doing through `pending`, `departing` and `notice`, and departs while the game is created: the page fades away and the app's planet rises to where the table's loading frame circles it.
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
  disabledReason,
  rulesetCheck = 'ready',
  onRecheck,
}: Readonly<{
  rulesets: readonly PassRuleset[];
  preview: CreatableRulesetPreview | null;
  draft: CreateGameDraft;
  dispatch: Dispatch<CreateGameDraftEvent>;
  /** Whether the request is on its way. */
  disabledReason?: string | undefined;
  pending: boolean;
  /** Whether the page is fading to the table's ground while the game is created and opened. */
  departing: boolean;
  /** What the line under Create game says in place of the pass's own summary, such as the server being out of reach. */
  notice: string | null;
  /** Why the last request failed, besides a refusal the draft holds. */
  failure: string | null;
  onCreate: (request: CreateGameRequest) => void;
  rulesetLink: (slug: string) => (rootProps: object) => ReactNode;
  /**
   * Where the check of the chosen ruleset's decks and bundles stands, made the way the table will capture them: still running, passed, or unable to finish, in which case the table checks them when it prepares.
   */
  rulesetCheck?: RulesetCheck;
  /** Runs the check of the chosen ruleset again; absent when there is nothing to check here, such as a ruleset the server already refuses. */
  onRecheck?: (() => void) | undefined;
}>) {
  /* The departure marks the document, so the planet keeps rising while the route changes to the table; a called-off departure ends at once. */
  useEffect(() => (departing ? beginDeparture() : endDeparture()), [departing]);
  useEffect(() => leaveDeparture, []);
  const chosen = rulesets.find((ruleset) => ruleset.id === draft.rulesetId);
  const request = playCreateGameRequestSchema.safeParse({
    rulesetId: draft.rulesetId,
    minimumPlayers: draft.minimumPlayers,
    lastTurn: draft.lastTurn,
  });
  const { nameError, nameReady } = customNameCheck(draft);
  const objection = chosen?.objection ?? null;
  const canCreate =
    !disabledReason &&
    nameReady &&
    request.success &&
    chosen !== undefined &&
    objection === null &&
    rulesetCheck !== 'checking' &&
    !pending &&
    !departing;
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
    disabledReason ??
    notice ??
    readiness({
      chosen,
      objection,
      nameReady,
      summary: `${createdGameName(draft)}, ${chosen?.name}, ${draft.minimumPlayers} seats, ${draft.lastTurn} turns.`,
    });
  /* The line under the button reads the summary once the pass is filled in; the button's reason never does. */
  const summaryShown = !disabledReason && !notice && chosen !== undefined && objection === null && nameReady;
  const blockedReason =
    canCreate || pending
      ? undefined
      : summaryShown
        ? rulesetCheck === 'checking'
          ? 'Checking the ruleset first.'
          : 'Finish the game pass first.'
        : waiting;

  return (
    <>
      <form
        className={styles.pass}
        aria-label="New game"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <TicketLayout>
          <TicketLayout.Main>
            <TicketMain>
              <Stack gap="xl" flex={1}>
                <NameField draft={draft} dispatch={dispatch} error={nameError} disabled={pending} />
                <RulesetField
                  rulesets={rulesets}
                  check={rulesetCheck}
                  onRecheck={onRecheck}
                  value={draft.rulesetId}
                  onChange={(rulesetId) => dispatch({ kind: 'patch', update: { rulesetId } })}
                  disabled={pending}
                />
                {chosen && preview ? (
                  <RulesetManifest ruleset={chosen} preview={preview} rulesetLink={rulesetLink} />
                ) : null}
                <Box mt="auto">
                  <PassFacts ruleset={chosen?.name ?? null} seats={draft.minimumPlayers} lastTurn={draft.lastTurn} />
                </Box>
              </Stack>
            </TicketMain>
          </TicketLayout.Main>
          <TicketLayout.Stub>
            <TicketStub>
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
                <ActionError subject="Game" verb="create" error={shownFailure} />
                <Stack gap="xs">
                  <CallToAction submit size="lg" busy={pending} disabledReason={blockedReason}>
                    Create game
                  </CallToAction>
                  <Text size="sm" c="dimmed" ta="center" role="status">
                    {waiting}
                  </Text>
                </Stack>
              </Stack>
            </TicketStub>
          </TicketLayout.Stub>
        </TicketLayout>
      </form>
      {departing ? <DepartureCover /> : null}
    </>
  );
}

/* What the line under Create game says while the pass is still being filled in. */
function readiness({
  chosen,
  objection,
  nameReady,
  summary,
}: Readonly<{
  chosen: PassRuleset | undefined;
  objection: string | null;
  nameReady: boolean;
  summary: string;
}>) {
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
      <GameName pending={draft.custom && !draft.customName.trim()}>{createdGameName(draft)}</GameName>
      <Group gap="md">
        {draft.custom ? null : (
          <LabeledAction
            size="xs"
            icon={<Dices size={15} />}
            disabledReason={disabled ? 'The game is being created.' : undefined}
            onClick={() => dispatch({ kind: 'reroll' })}
          >
            Roll another name
          </LabeledAction>
        )}
        <Switch
          label="Set a custom name"
          checked={draft.custom}
          onChange={(event) =>
            dispatch({
              kind: 'patch',
              update: { custom: event.currentTarget.checked },
            })
          }
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
  return <FactList facts={facts} />;
}

/* A searchable dropdown, since a catalogue of forty rulesets would push the rest of the pass off the screen as a list. */
function RulesetField({
  rulesets,
  check,
  onRecheck,
  value,
  onChange,
  disabled,
}: Readonly<{
  rulesets: readonly PassRuleset[];
  check: RulesetCheck;
  onRecheck: (() => void) | undefined;
  value: string;
  onChange: (id: string) => void;
  disabled: boolean;
}>) {
  const chosen = rulesets.find((ruleset) => ruleset.id === value);
  /* Any finished check can be asked again, for a fix the page has not seen yet. */
  const recheckable = onRecheck && chosen && check !== 'checking';
  const objections = new Map<string, string | null>(rulesets.map((ruleset) => [ruleset.id, ruleset.objection]));
  const statusId = useId();
  return (
    <ControlBlock
      title="Ruleset"
      input={(fieldProps) => (
        /* The check's verdict is live state, not help, so it stays on screen under the field and describes it. */
        <Stack gap={4}>
          <Select
            {...fieldProps}
            attributes={chosen ? { input: { 'aria-describedby': statusId } } : undefined}
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
            comboboxProps={{ shadow: 'md' }}
          />
          {chosen ? (
            <Text id={statusId} size="xs" c={chosen.objection ? 'red' : 'dimmed'}>
              {chosen.objection ?? RULESET_CHECK_LINES[check]}
              {recheckable ? (
                <>
                  {' '}
                  <Anchor component="button" type="button" size="xs" onClick={onRecheck} disabled={disabled}>
                    Check again
                  </Anchor>
                </>
              ) : null}
            </Text>
          ) : null}
        </Stack>
      )}
    />
  );
}

function SeatsField({
  value,
  onChange,
  disabled,
}: Readonly<{
  value: number;
  onChange: (value: number) => void;
  disabled: boolean;
}>) {
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
      <div className={styles.inked}>
        <SeatRow seats={value} places={MAXIMUM} />
      </div>
      <div className={styles.inked}>
        <BoardSeats
          angles={isTableSeatCount(value) ? tableSeatAngles(value) : []}
          board="/vector/background/map.svg"
          label={`${value} seats round the board`}
        />
      </div>
      <Text size="sm" c="dimmed">
        The minimum number of players is the number of seats. You take the first; drafting seats the rest, and anyone
        who arrives after that watches.
      </Text>
    </Stack>
  );
}

const TURN_MARKS = [1, 5, 10, 15, 20].map((value) => ({
  value,
  label: String(value),
}));

/* The game's length, which the Phase tab can still change once the game plays. */
function LastTurnField({
  value,
  onChange,
  disabled,
}: Readonly<{
  value: number;
  onChange: (value: number) => void;
  disabled: boolean;
}>) {
  return (
    <Stack gap="md">
      <Divider variant="dashed" />
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
