import {
  Avatar,
  Button,
  CloseButton,
  Drawer,
  Group,
  Modal,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  VisuallyHidden,
} from '@mantine/core';
import { useElementSize } from '@mantine/hooks';
import { phaseAt, tableProgressFor } from '@shared/play/phases';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { Eyebrow } from '@ui/content/Eyebrow';
import { CallToAction } from '@ui/control/CallToAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import clsx from 'clsx';
import { Crown, Eye, Play, Search, Trophy, UserPlus } from 'lucide-react';
import { useMemo, useReducer, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';

import styles from './LedgerLobby.module.css';
import type { DesignEntry } from './lobbyDesigns.fixture';
import {
  ageWords,
  joinable,
  LAST_TURN,
  NOW,
  openSeats,
  PHASES_PER_TURN,
  resultWords,
  RULESETS,
  STAGE_WORDS,
  VIEWER,
  whereWords,
} from './lobbyDesigns.fixture';

/*
 * Direction B, the ledger: every game in one dense list, cut down by a filter, a search and a sort.
 * The chosen game opens in a pane beside the list on a wide screen and in a drawer from the bottom on a narrow one.
 */

type Filter = 'all' | 'mine' | 'open' | 'active' | 'finished';
type Sort = 'activity' | 'name' | 'seats';

const FILTERS: readonly { value: Filter; label: string; test: (game: DesignEntry) => boolean }[] = [
  { value: 'all', label: 'All', test: () => true },
  { value: 'mine', label: 'Mine', test: (game) => game.viewerSeated },
  { value: 'open', label: 'Open seats', test: joinable },
  { value: 'active', label: 'Under way', test: (game) => game.stage !== 'finished' && game.stage !== 'discarded' },
  { value: 'finished', label: 'Finished', test: (game) => game.stage === 'finished' },
];

const SORTS: readonly { value: Sort; label: string }[] = [
  { value: 'activity', label: 'Last activity' },
  { value: 'name', label: 'Name' },
  { value: 'seats', label: 'Seats open' },
];

const BEFORE_FINISH = ['drafting', 'swapping', 'setup', 'play'] as const;

/* The container width at which the pane stands beside the list, the 62rem step of the ladder. */
const WIDE_PX = 62 * 16;

type State = Readonly<{
  games: DesignEntry[];
  filter: Filter;
  query: string;
  sort: Sort;
  selectedId: string | null;
}>;

type Event =
  | { type: 'filterChosen'; filter: Filter }
  | { type: 'queryTyped'; query: string }
  | { type: 'sortChosen'; sort: Sort }
  | { type: 'gameSelected'; gameId: string }
  | { type: 'filtersReset' }
  | { type: 'gameCreated'; game: DesignEntry }
  | { type: 'seatTaken'; gameId: string };

function reduce(state: State, event: Event): State {
  switch (event.type) {
    case 'filterChosen':
      return { ...state, filter: event.filter };
    case 'queryTyped':
      return { ...state, query: event.query };
    case 'sortChosen':
      return { ...state, sort: event.sort };
    case 'gameSelected':
      return { ...state, selectedId: event.gameId };
    case 'filtersReset':
      return { ...state, filter: 'all', query: '' };
    case 'gameCreated':
      return { ...state, games: [event.game, ...state.games], filter: 'all', query: '', selectedId: event.game.gameId };
    case 'seatTaken':
      return {
        ...state,
        games: state.games.map((game) =>
          game.gameId === event.gameId
            ? {
                ...game,
                viewerSeated: true,
                seatsFilled: game.seatsFilled + 1,
                players: [...game.players, { displayName: VIEWER, faction: null }],
                lastActivityAt: NOW,
              }
            : game
        ),
      };
  }
}

function matches(game: DesignEntry, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') {
    return true;
  }
  const haystack = [
    game.name,
    game.host,
    game.ruleset,
    ...game.players.flatMap((player) => [player.displayName, player.faction ?? '']),
  ];
  return haystack.some((words) => words.toLowerCase().includes(needle));
}

const BY: Record<Sort, (a: DesignEntry, b: DesignEntry) => number> = {
  activity: (a, b) => b.lastActivityAt - a.lastActivityAt,
  name: (a, b) => a.name.localeCompare(b.name),
  seats: (a, b) =>
    Number(joinable(b)) - Number(joinable(a)) || openSeats(b) - openSeats(a) || b.lastActivityAt - a.lastActivityAt,
};

const initials = (name: string) => name.slice(0, 2);

/** How far through its life a game is: the index in drafting, swapping, setup, play, or past the end once finished. */
function stageStep(game: DesignEntry): number {
  if (game.stage === 'finished') {
    return BEFORE_FINISH.length;
  }
  return BEFORE_FINISH.indexOf(game.stage as (typeof BEFORE_FINISH)[number]);
}

/** The turn and phase a game reached, in play or at its end; null before play. */
function progressOf(game: DesignEntry): { turn: number; phase: number } | null {
  if (game.phase === null || (game.stage !== 'play' && game.stage !== 'finished')) {
    return null;
  }
  return { turn: tableProgressFor(game.phase).turn, phase: game.phase % PHASES_PER_TURN };
}

function MiniStepper({ game }: Readonly<{ game: DesignEntry }>) {
  const step = stageStep(game);
  return (
    <span className={clsx(styles.miniStepper, game.stage === 'finished' && styles.miniStepperDone)} aria-hidden>
      {BEFORE_FINISH.map((stage, index) => (
        <span
          key={stage}
          className={styles.miniStep}
          data-state={index < step ? 'done' : index === step ? 'current' : 'todo'}
        />
      ))}
    </span>
  );
}

function SeatPips({ game }: Readonly<{ game: DesignEntry }>) {
  const open = joinable(game);
  return (
    <span className={styles.seats}>
      <span className={styles.pips} aria-hidden>
        {Array.from({ length: game.seatCount }, (_, index) => (
          <span
            key={index}
            className={styles.pip}
            data-state={index < game.seatsFilled ? 'filled' : open ? 'open' : 'empty'}
          />
        ))}
      </span>
      <span className={clsx(styles.seatCount, open && styles.seatCountOpen)}>
        {game.seatsFilled}/{game.seatCount}
      </span>
      <VisuallyHidden>
        {game.seatsFilled} of {game.seatCount} seats taken
      </VisuallyHidden>
    </span>
  );
}

function Players({ game }: Readonly<{ game: DesignEntry }>) {
  const shown = game.players.slice(0, 4);
  const more = game.players.length - shown.length;
  return (
    <Avatar.Group spacing="xs" className={styles.players} aria-hidden>
      {shown.map((player) => (
        <Avatar
          key={player.displayName}
          size={26}
          radius="xl"
          variant={player.displayName === VIEWER ? 'filled' : 'default'}
          className={styles.avatar}
        >
          {initials(player.displayName)}
        </Avatar>
      ))}
      {more > 0 ? (
        <Avatar size={26} radius="xl" variant="default" className={styles.avatar}>
          +{more}
        </Avatar>
      ) : null}
    </Avatar.Group>
  );
}

function GameRow({
  game,
  selected,
  focusable,
  onChoose,
  onKeyDown,
  register,
}: Readonly<{
  game: DesignEntry;
  selected: boolean;
  focusable: boolean;
  onChoose: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  register: (element: HTMLDivElement | null) => void;
}>) {
  const where = whereWords(game);
  return (
    <div
      ref={register}
      role="option"
      aria-selected={selected}
      tabIndex={focusable ? 0 : -1}
      className={styles.row}
      data-yours={game.viewerSeated || undefined}
      data-finished={game.stage === 'finished' || undefined}
      onClick={onChoose}
      onKeyDown={onKeyDown}
    >
      <span className={styles.cellMark}>
        {game.viewerSeated ? (
          <>
            <span className={styles.mark} aria-hidden />
            <VisuallyHidden>You sit here.</VisuallyHidden>
          </>
        ) : null}
      </span>
      <span className={styles.cellGame}>
        <span className={styles.gameName}>{game.name}</span>
        <span className={styles.gameMeta}>{game.ruleset}</span>
      </span>
      <span className={styles.cellStage}>
        <MiniStepper game={game} />
        <span className={styles.stageWords} title={where}>
          {game.stage === 'finished' ? (resultWords(game.result) ?? where) : where}
        </span>
      </span>
      <span className={styles.cellSeats}>
        <SeatPips game={game} />
      </span>
      <span className={styles.cellPlayers}>
        <Players game={game} />
        <VisuallyHidden>{game.players.map((player) => player.displayName).join(', ')}</VisuallyHidden>
      </span>
      <span className={styles.cellAge}>{ageWords(game.lastActivityAt)}</span>
    </div>
  );
}

function StageStepper({ game }: Readonly<{ game: DesignEntry }>) {
  const step = stageStep(game);
  const stages = [...BEFORE_FINISH, 'finished'] as const;
  return (
    <ol className={styles.stepper}>
      {stages.map((stage, index) => {
        const state = index < step ? 'done' : index === step ? 'current' : 'todo';
        return (
          <li
            key={stage}
            className={styles.step}
            data-state={state}
            aria-current={state === 'current' ? 'step' : undefined}
          >
            <span className={styles.stepBar} aria-hidden />
            <span className={styles.stepLabel}>{STAGE_WORDS[stage]}</span>
          </li>
        );
      })}
    </ol>
  );
}

function TurnTrack({ game }: Readonly<{ game: DesignEntry }>) {
  const progress = progressOf(game);
  const turn = progress?.turn ?? 0;
  const finished = game.stage === 'finished';
  const caption =
    progress === null
      ? 'Turn 1 starts once setup is done.'
      : finished
        ? `Ended in turn ${turn} of ${LAST_TURN}.`
        : `Turn ${turn} of ${LAST_TURN}, phase ${progress.phase + 1} of ${PHASES_PER_TURN}: ${phaseAt(game.phase ?? 0).label}.`;
  return (
    <div className={styles.track}>
      <ol className={styles.turns} aria-hidden>
        {Array.from({ length: LAST_TURN }, (_, index) => {
          const number = index + 1;
          const state = number < turn || (finished && number <= turn) ? 'done' : number === turn ? 'current' : 'todo';
          return (
            <li key={number} className={styles.turn} data-state={state}>
              {number}
            </li>
          );
        })}
      </ol>
      {progress !== null && !finished ? (
        <ol className={styles.phases} aria-hidden>
          {Array.from({ length: PHASES_PER_TURN }, (_, index) => (
            <li
              key={index}
              className={styles.phaseTick}
              data-state={index < progress.phase ? 'done' : index === progress.phase ? 'current' : 'todo'}
            />
          ))}
        </ol>
      ) : null}
      <Text size="sm" c="dimmed" className={styles.numeric}>
        {caption}
      </Text>
    </div>
  );
}

function SeatList({ game }: Readonly<{ game: DesignEntry }>) {
  return (
    <ol className={styles.seatList}>
      {Array.from({ length: game.seatCount }, (_, index) => {
        const player = game.players[index];
        const number = String(index + 1).padStart(2, '0');
        if (player === undefined) {
          return (
            <li key={index} className={styles.seat} data-joinable={joinable(game) || undefined}>
              <span className={styles.seatNumber}>{number}</span>
              <span className={styles.seatOpen}>Open seat</span>
            </li>
          );
        }
        const you = player.displayName === VIEWER;
        return (
          <li key={index} className={styles.seat} data-you={you || undefined}>
            <span className={styles.seatNumber}>{number}</span>
            <span className={styles.seatPlayer}>
              {player.displayName}
              {you ? <span className={styles.tag}>You</span> : null}
              {player.displayName === game.host ? (
                <Crown size={13} className={styles.hostMark} aria-label="Host" />
              ) : null}
            </span>
            <span className={styles.seatFaction}>{player.faction ?? 'No faction yet'}</span>
          </li>
        );
      })}
    </ol>
  );
}

type Intent = { kind: 'idle' } | { kind: 'confirmJoin' } | { kind: 'note'; words: string };

function GameDetail({ game, onTakeSeat }: Readonly<{ game: DesignEntry; onTakeSeat: () => void }>) {
  const [intent, setIntent] = useState<Intent>({ kind: 'idle' });
  const finished = game.stage === 'finished';
  const result = resultWords(game.result);
  const yours = game.viewerSeated;

  return (
    <Section
      eyebrow={yours ? `${STAGE_WORDS[game.stage]} · your game` : STAGE_WORDS[game.stage]}
      title={game.name}
      description={`${game.ruleset}, hosted by ${game.host}.`}
    >
      <Stack gap="md">
        <dl className={styles.facts}>
          <div>
            <dt>Seats</dt>
            <dd>
              {game.seatsFilled} of {game.seatCount}
            </dd>
          </div>
          <div>
            <dt>Open</dt>
            <dd>{openSeats(game)}</dd>
          </div>
          <div>
            <dt>Last move</dt>
            <dd>{ageWords(game.lastActivityAt)}</dd>
          </div>
        </dl>

        {result === null ? null : (
          <p className={styles.result}>
            <Trophy size={16} aria-hidden />
            {result}
          </p>
        )}

        <div className={styles.actions}>
          {intent.kind === 'confirmJoin' ? (
            <div className={styles.confirm} role="group" aria-label="Confirm joining">
              <Text size="sm" fw={700}>
                Take seat {game.seatsFilled + 1} of {game.seatCount} in {game.name}?
              </Text>
              <Text size="sm" c="dimmed">
                You can leave again while the game is drafting.
              </Text>
              <Group gap="xs">
                <Button
                  size="xs"
                  color="confirm"
                  onClick={() => {
                    onTakeSeat();
                    setIntent({
                      kind: 'note',
                      words: `You hold seat ${game.seatsFilled + 1}. ${game.host} sees you at the table.`,
                    });
                  }}
                >
                  Take the seat
                </Button>
                <Button size="xs" variant="default" onClick={() => setIntent({ kind: 'idle' })}>
                  Cancel
                </Button>
              </Group>
            </div>
          ) : (
            <Group gap="xs">
              {yours && !finished ? (
                <Button
                  size="sm"
                  leftSection={<Play size={15} aria-hidden />}
                  onClick={() => setIntent({ kind: 'note', words: `Would open the table at ${whereWords(game)}.` })}
                >
                  Resume
                </Button>
              ) : null}
              {joinable(game) ? (
                <Button
                  size="sm"
                  color="confirm"
                  leftSection={<UserPlus size={15} aria-hidden />}
                  onClick={() => setIntent({ kind: 'confirmJoin' })}
                >
                  Join a seat
                </Button>
              ) : null}
              {!yours || finished ? (
                <Button
                  size="sm"
                  variant="default"
                  leftSection={<Eye size={15} aria-hidden />}
                  onClick={() =>
                    setIntent({
                      kind: 'note',
                      words: finished
                        ? 'Would open the final table.'
                        : 'Would open the table to watch, without a seat.',
                    })
                  }
                >
                  {finished ? 'View final table' : 'Watch'}
                </Button>
              ) : null}
            </Group>
          )}
          {intent.kind === 'note' ? (
            <Text size="sm" c="dimmed" role="status" className={styles.note}>
              {intent.words}
            </Text>
          ) : null}
        </div>

        <div className={styles.block}>
          <Eyebrow>Stage</Eyebrow>
          <StageStepper game={game} />
        </div>

        <div className={styles.block}>
          <Eyebrow>Turn track</Eyebrow>
          <TurnTrack game={game} />
        </div>

        <div className={styles.block}>
          <Eyebrow>Seats</Eyebrow>
          <SeatList game={game} />
        </div>
      </Stack>
    </Section>
  );
}

function CreateGameModal({
  opened,
  onClose,
  onCreate,
}: Readonly<{ opened: boolean; onClose: () => void; onCreate: (game: DesignEntry) => void }>) {
  const [name, setName] = useState('');
  const [ruleset, setRuleset] = useState<string>(RULESETS[0]);
  const [seats, setSeats] = useState('6');
  const [openToAnyone, setOpenToAnyone] = useState(true);
  const [tried, setTried] = useState(false);
  const created = useRef(0);
  const nameMissing = name.trim() === '';

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (nameMissing) {
      return;
    }
    onCreate({
      gameId: `g-new-${(created.current += 1)}`,
      name: name.trim(),
      stage: 'drafting',
      seatsFilled: 1,
      seatCount: Number(seats),
      viewerSeated: true,
      players: [{ displayName: VIEWER, faction: null }],
      phase: null,
      lastActivityAt: NOW,
      result: null,
      ruleset,
      host: VIEWER,
    });
    setName('');
    setTried(false);
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Create a game" centered>
      <form onSubmit={submit}>
        <Stack gap="md">
          <TextInput
            label="Name"
            placeholder="Sietch Tabr Thursday"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            error={tried && nameMissing ? 'Give the game a name.' : undefined}
            data-autofocus
          />
          <Select
            label="Ruleset"
            data={[...RULESETS]}
            value={ruleset}
            onChange={(value) => setRuleset(value ?? RULESETS[0])}
            allowDeselect={false}
          />
          <Stack gap="xs">
            <Text size="sm" fw={500} id="ledger-seat-count">
              Seats
            </Text>
            <SegmentedControl
              aria-labelledby="ledger-seat-count"
              value={seats}
              onChange={setSeats}
              data={['2', '3', '4', '5', '6']}
              fullWidth
            />
          </Stack>
          <Switch
            label="Open to anyone"
            description="Anyone signed in can take a free seat. Otherwise only people you invite."
            checked={openToAnyone}
            onChange={(event) => setOpenToAnyone(event.currentTarget.checked)}
          />
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" color="confirm">
              Create the game
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

function EmptyLobby({ onCreate }: Readonly<{ onCreate: () => void }>) {
  return (
    <Surface padding="xl" as="section" aria-label="No games yet">
      <div className={styles.empty}>
        <div className={styles.emptyRule} aria-hidden>
          {Array.from({ length: 6 }, (_, index) => (
            <span key={index} className={styles.pip} data-state="open" />
          ))}
        </div>
        <Text fw={700} size="lg">
          No games yet
        </Text>
        <Text c="dimmed" size="sm" maw="32rem">
          Start the first table and invite your group. Every game you create, join or watch is listed here, with its
          seats, its stage and its last move.
        </Text>
        <CallToAction renderRoot={(props) => <button type="button" {...props} onClick={onCreate} />}>
          Create a game
        </CallToAction>
      </div>
    </Surface>
  );
}

export function LedgerLobby({ entries }: Readonly<{ entries: DesignEntry[] }>) {
  const [state, dispatch] = useReducer(reduce, {
    games: entries,
    filter: 'all',
    query: '',
    sort: 'activity',
    selectedId: null,
  });
  const [creating, setCreating] = useState(false);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const { ref: frameRef, width } = useElementSize();
  const wide = width >= WIDE_PX;
  const rows = useRef(new Map<string, HTMLDivElement>());

  const searched = useMemo(() => state.games.filter((game) => matches(game, state.query)), [state.games, state.query]);
  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((filter) => [filter.value, searched.filter(filter.test).length])),
    [searched]
  );
  const visible = useMemo(() => {
    const test = FILTERS.find((filter) => filter.value === state.filter)!.test;
    return searched.filter(test).sort(BY[state.sort]);
  }, [searched, state.filter, state.sort]);

  const selected = visible.find((game) => game.gameId === state.selectedId) ?? (wide ? visible[0] : undefined);
  const focusId = selected?.gameId ?? visible[0]?.gameId;
  const drawerGame = state.games.find((game) => game.gameId === drawerId);

  const choose = (game: DesignEntry) => {
    dispatch({ type: 'gameSelected', gameId: game.gameId });
    if (!wide) {
      setDrawerId(game.gameId);
    }
  };

  const onListKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = visible.findIndex((game) => game.gameId === focusId);
    const next =
      event.key === 'ArrowDown'
        ? Math.min(index + 1, visible.length - 1)
        : event.key === 'ArrowUp'
          ? Math.max(index - 1, 0)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? visible.length - 1
              : null;
    if (next !== null) {
      event.preventDefault();
      const game = visible[next]!;
      dispatch({ type: 'gameSelected', gameId: game.gameId });
      rows.current.get(game.gameId)?.focus();
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && selected !== undefined) {
      event.preventDefault();
      choose(selected);
    }
  };

  const create = (game: DesignEntry) => {
    dispatch({ type: 'gameCreated', game });
    setCreating(false);
    if (!wide) {
      setDrawerId(game.gameId);
    }
  };

  const yoursCount = state.games.filter((game) => game.viewerSeated && game.stage !== 'finished').length;
  const openCount = state.games.filter(joinable).length;
  const filterLabel = FILTERS.find((filter) => filter.value === state.filter)!.label;

  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <PageTitle title="Game lobby" eyebrow="Play" />
      </PageLayout.Header>
      <PageLayout.Content>
        <div ref={frameRef} className={styles.frame}>
          {state.games.length === 0 ? (
            <EmptyLobby onCreate={() => setCreating(true)} />
          ) : (
            <div className={styles.columns}>
              <Surface as="section" aria-label="Games" className={styles.ledger}>
                <div className={styles.head}>
                  <p className={styles.tally}>
                    <span>
                      <strong>{state.games.length}</strong> games
                    </span>
                    <span>
                      <strong>{yoursCount}</strong> under way with you
                    </span>
                    <span>
                      <strong>{openCount}</strong> with a seat for you
                    </span>
                  </p>
                  <CallToAction
                    size="sm"
                    renderRoot={(props) => <button type="button" {...props} onClick={() => setCreating(true)} />}
                  >
                    Create a game
                  </CallToAction>
                </div>

                <div className={styles.toolbar}>
                  <div className={styles.filterScroll}>
                    <SegmentedControl
                      size="xs"
                      aria-label="Show games"
                      value={state.filter}
                      onChange={(value) => dispatch({ type: 'filterChosen', filter: value as Filter })}
                      data={FILTERS.map((filter) => ({
                        value: filter.value,
                        label: (
                          <span className={styles.segment}>
                            {filter.label}
                            <span className={styles.count}>{counts[filter.value]}</span>
                          </span>
                        ),
                      }))}
                    />
                  </div>
                  <TextInput
                    size="xs"
                    className={styles.search}
                    aria-label="Search games"
                    placeholder="Game, player or faction"
                    leftSection={<Search size={14} aria-hidden />}
                    value={state.query}
                    onChange={(event) => dispatch({ type: 'queryTyped', query: event.currentTarget.value })}
                    rightSection={
                      state.query === '' ? null : (
                        <CloseButton
                          size="sm"
                          aria-label="Clear search"
                          onClick={() => dispatch({ type: 'queryTyped', query: '' })}
                        />
                      )
                    }
                  />
                  <Select
                    size="xs"
                    className={styles.sort}
                    aria-label="Sort games"
                    data={[...SORTS]}
                    value={state.sort}
                    onChange={(value) => dispatch({ type: 'sortChosen', sort: (value ?? 'activity') as Sort })}
                    allowDeselect={false}
                  />
                </div>

                <div className={styles.table}>
                  <div className={styles.columnHeads} aria-hidden>
                    <span />
                    <span>Game</span>
                    <span>Stage</span>
                    <span>Seats</span>
                    <span>Players</span>
                    <span className={styles.alignEnd}>Last move</span>
                  </div>
                  {visible.length === 0 ? (
                    <div className={styles.noMatch}>
                      <Text size="sm" fw={700}>
                        No game matches
                        {state.query.trim() === '' ? '' : ` "${state.query.trim()}"`}
                        {state.filter === 'all' ? '.' : ` in ${filterLabel}.`}
                      </Text>
                      <Button size="xs" variant="default" onClick={() => dispatch({ type: 'filtersReset' })}>
                        Reset filters
                      </Button>
                    </div>
                  ) : (
                    <div role="listbox" aria-label="Games" className={styles.rows}>
                      {visible.map((game) => (
                        <GameRow
                          key={game.gameId}
                          game={game}
                          selected={selected?.gameId === game.gameId}
                          focusable={focusId === game.gameId}
                          onChoose={() => choose(game)}
                          onKeyDown={onListKey}
                          register={(element) => {
                            if (element === null) {
                              rows.current.delete(game.gameId);
                            } else {
                              rows.current.set(game.gameId, element);
                            }
                          }}
                        />
                      ))}
                    </div>
                  )}
                  <p className={styles.footer}>
                    Showing <strong>{visible.length}</strong> of <strong>{state.games.length}</strong>
                  </p>
                </div>
              </Surface>

              {wide && selected !== undefined ? (
                <Surface as="aside" aria-label="Chosen game" padding="lg" className={styles.pane}>
                  <GameDetail
                    key={selected.gameId}
                    game={selected}
                    onTakeSeat={() => dispatch({ type: 'seatTaken', gameId: selected.gameId })}
                  />
                </Surface>
              ) : null}
            </div>
          )}
        </div>

        <Drawer
          opened={!wide && drawerGame !== undefined}
          onClose={() => setDrawerId(null)}
          position="bottom"
          size="88%"
          title={<Eyebrow>Game details</Eyebrow>}
          classNames={{ body: styles.drawerBody }}
        >
          {drawerGame === undefined ? null : (
            <GameDetail
              key={drawerGame.gameId}
              game={drawerGame}
              onTakeSeat={() => dispatch({ type: 'seatTaken', gameId: drawerGame.gameId })}
            />
          )}
        </Drawer>

        <CreateGameModal opened={creating} onClose={() => setCreating(false)} onCreate={create} />
      </PageLayout.Content>
    </PageLayout>
  );
}
