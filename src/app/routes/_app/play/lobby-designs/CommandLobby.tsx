import {
  Avatar,
  Badge,
  Button,
  Group,
  Modal,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { phaseAt } from '@shared/play/phases';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { StatusBadge } from '@ui/content/StatusBadge';
import type { StatusBadgeTone } from '@ui/content/StatusBadge';
import { CallToAction } from '@ui/control/CallToAction';
import { IconAction } from '@ui/control/IconAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { Card } from '@ui/surface/Card';
import clsx from 'clsx';
import { ArrowRight, Check, Crown, Eye, Link2, Plus, Swords, Trophy, UserPlus } from 'lucide-react';
import { useReducer, useState } from 'react';
import type { CSSProperties } from 'react';

import styles from './CommandLobby.module.css';
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
  turnOf,
  VIEWER,
  whereWords,
} from './lobbyDesigns.fixture';
import type { DesignEntry } from './lobbyDesigns.fixture';

/*
 * Direction A, Command: the lobby as a cockpit for the games you sit in.
 * Your seats come first as large cards ordered by what needs you, each with one way back in.
 * Open seats, games being played and past games sit below, quieter and denser.
 */

type Stage = DesignEntry['stage'];

/* What needs you first: a game in play, then one being prepared, then one still filling its seats. */
const URGENCY: Record<Stage, number> = { play: 0, setup: 1, swapping: 2, drafting: 3, finished: 4, discarded: 5 };

const STAGE_TONE: Record<Stage, StatusBadgeTone> = {
  play: 'progress',
  setup: 'pending',
  swapping: 'pending',
  drafting: 'neutral',
  finished: 'neutral',
  discarded: 'neutral',
};

const STEPS = ['drafting', 'swapping', 'setup', 'play'] as const;
const SEAT_CHOICES = ['2', '3', '4', '5', '6'];

type Notice = { gameId: string; text: string };

type LobbyState = { entries: DesignEntry[]; notice: Notice | null; created: number };

type LobbyEvent =
  | { kind: 'joined'; gameId: string }
  | { kind: 'created'; name: string; ruleset: string; seatCount: number }
  | { kind: 'noted'; notice: Notice };

function lobbyReducer(state: LobbyState, event: LobbyEvent): LobbyState {
  switch (event.kind) {
    case 'joined':
      return {
        ...state,
        entries: state.entries.map((entry) =>
          entry.gameId === event.gameId
            ? {
                ...entry,
                viewerSeated: true,
                seatsFilled: entry.seatsFilled + 1,
                players: [...entry.players, { displayName: VIEWER, faction: null }],
                lastActivityAt: NOW,
              }
            : entry
        ),
        notice: { gameId: event.gameId, text: `You took seat ${seatNumber(state.entries, event.gameId)}.` },
      };
    case 'created': {
      const gameId = `g-created-${state.created + 1}`;
      const created: DesignEntry = {
        gameId,
        name: event.name,
        stage: 'drafting',
        seatsFilled: 1,
        seatCount: event.seatCount,
        viewerSeated: true,
        players: [{ displayName: VIEWER, faction: null }],
        phase: null,
        lastActivityAt: NOW,
        result: null,
        ruleset: event.ruleset,
        host: VIEWER,
      };
      return {
        entries: [created, ...state.entries],
        created: state.created + 1,
        notice: { gameId, text: 'Created. Share the invite link to fill the table.' },
      };
    }
    case 'noted':
      return { ...state, notice: event.notice };
  }
}

function seatNumber(entries: DesignEntry[], gameId: string): number {
  return (entries.find((entry) => entry.gameId === gameId)?.seatsFilled ?? 0) + 1;
}

const initials = (name: string) => name.slice(0, 2);

const byUrgency = (a: DesignEntry, b: DesignEntry) =>
  URGENCY[a.stage] - URGENCY[b.stage] || b.lastActivityAt - a.lastActivityAt;

const byRecency = (a: DesignEntry, b: DesignEntry) => b.lastActivityAt - a.lastActivityAt;

/** The players at a table as small initials, each naming its player and faction on hover. */
function Seats({ entry, size = 'md' }: Readonly<{ entry: DesignEntry; size?: 'sm' | 'md' }>) {
  return (
    <Tooltip.Group openDelay={150} closeDelay={80}>
      <Avatar.Group spacing="xs" aria-label={`${entry.seatsFilled} of ${entry.seatCount} seats taken`}>
        {entry.players.map((player) => {
          const you = player.displayName === VIEWER;
          return (
            <Tooltip
              key={player.displayName}
              label={`${you ? 'You' : player.displayName} · ${player.faction ?? 'no faction yet'}`}
              withArrow
            >
              <Avatar
                size={size === 'sm' ? 'sm' : 'md'}
                radius="xl"
                color="slate"
                variant={you ? 'filled' : 'light'}
                className={clsx(styles.avatar, you && styles.avatarYou)}
                aria-label={`${player.displayName}, ${player.faction ?? 'no faction yet'}`}
              >
                {initials(player.displayName)}
              </Avatar>
            </Tooltip>
          );
        })}
        {Array.from({ length: openSeats(entry) }, (_, index) => (
          <Avatar
            key={`open-${index}`}
            size={size === 'sm' ? 'sm' : 'md'}
            radius="xl"
            className={styles.avatarOpen}
            aria-hidden
          >
            {' '}
          </Avatar>
        ))}
      </Avatar.Group>
    </Tooltip.Group>
  );
}

/** Ten turns as a row of marks: the ones played filled, the current one lit and filling through its phases. */
function TurnTrack({ entry }: Readonly<{ entry: DesignEntry }>) {
  const turn = turnOf(entry) ?? 1;
  const phaseInTurn = ((entry.phase ?? 0) % PHASES_PER_TURN) + 1;
  return (
    <div className={styles.track} role="img" aria-label={`Turn ${turn} of ${LAST_TURN}`}>
      {Array.from({ length: LAST_TURN }, (_, index) => {
        const n = index + 1;
        const state = n < turn ? 'done' : n === turn ? 'now' : 'later';
        return (
          <div
            key={n}
            className={styles.turn}
            data-state={state}
            style={
              n === turn ? ({ '--turn-fill': `${(phaseInTurn / PHASES_PER_TURN) * 100}%` } as CSSProperties) : undefined
            }
          >
            <span className={styles.turnBar} />
            <span className={styles.turnNumber}>{n}</span>
          </div>
        );
      })}
    </div>
  );
}

/** The stages before play as a stepper, the current one ringed and the ones behind it ticked. */
function StageStepper({ stage }: Readonly<{ stage: Stage }>) {
  const at = STEPS.indexOf(stage as (typeof STEPS)[number]);
  return (
    <ol className={styles.stepper} aria-label={`Stage ${at + 1} of ${STEPS.length}: ${STAGE_WORDS[stage]}`}>
      {STEPS.map((step, index) => {
        const state = index < at ? 'done' : index === at ? 'now' : 'later';
        return (
          <li key={step} className={styles.step} data-state={state} aria-current={state === 'now' ? 'step' : undefined}>
            <span className={styles.stepDot}>{state === 'done' ? <Check size={12} aria-hidden /> : null}</span>
            <span className={styles.stepLabel}>{step === 'play' ? 'Play' : STAGE_WORDS[step]}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** One line of quiet facts under a game's name. */
function hostWords(entry: DesignEntry): string {
  return entry.host === VIEWER ? `${entry.ruleset} · you host` : `${entry.ruleset} · hosted by ${entry.host}`;
}

/** The viewer's own faction at a table, once drafting has given them one. */
function yourFaction(entry: DesignEntry): string | null {
  return entry.players.find((player) => player.displayName === VIEWER)?.faction ?? null;
}

function stageLine(entry: DesignEntry): { main: string; aside: string } {
  switch (entry.stage) {
    case 'play': {
      const phase = (entry.phase ?? 0) % PHASES_PER_TURN;
      return {
        main: `Turn ${turnOf(entry)} of ${LAST_TURN}`,
        aside: `${phaseAt(entry.phase ?? 0).label}, phase ${phase + 1} of ${PHASES_PER_TURN}`,
      };
    }
    case 'setup':
      return { main: 'Setting up the board', aside: 'Factions placing their forces' };
    case 'swapping':
      return { main: 'Swapping factions', aside: 'Trades open before setup' };
    case 'drafting':
      return {
        main: openSeats(entry) > 0 ? 'Filling seats' : 'Drafting factions',
        aside: `${entry.seatsFilled} of ${entry.seatCount} seats taken`,
      };
    default:
      return { main: STAGE_WORDS[entry.stage], aside: '' };
  }
}

function SeatCard({
  entry,
  notice,
  onNote,
}: Readonly<{ entry: DesignEntry; notice: string | null; onNote: (text: string) => void }>) {
  const line = stageLine(entry);
  const free = openSeats(entry);
  const hosting = entry.host === VIEWER;
  return (
    <Card
      title={entry.name}
      padding="lg"
      className={styles.seatCard}
      action={<StatusBadge tone={STAGE_TONE[entry.stage]}>{STAGE_WORDS[entry.stage]}</StatusBadge>}
    >
      <Stack gap="md" className={styles.seatBody}>
        <Text size="xs" c="dimmed" className={styles.meta}>
          {hosting ? <Crown size={12} aria-hidden /> : null}
          {hostWords(entry)}
          {yourFaction(entry) === null ? null : ` · you play ${yourFaction(entry)}`}
        </Text>
        <div>
          <Text fw={700} size="lg" className={styles.where}>
            {line.main}
          </Text>
          <Text size="sm" c="dimmed">
            {line.aside}
          </Text>
        </div>
        {entry.stage === 'play' ? <TurnTrack entry={entry} /> : <StageStepper stage={entry.stage} />}
        {hosting && entry.stage === 'drafting' && free > 0 ? (
          <div className={styles.invite}>
            <UserPlus size={16} aria-hidden />
            <Text size="sm" className={styles.inviteWords}>
              {free === 1 ? '1 seat open' : `${free} seats open`}: invite
            </Text>
            <IconAction
              label="Copy invite link"
              intent="neutral"
              emphasis="standard"
              size="md"
              icon={<Link2 size={16} />}
              onClick={() => onNote('Invite link copied. Send it to the players you want at the table.')}
            />
          </div>
        ) : null}
        <div className={styles.seatFoot}>
          <Stack gap={6} miw={0}>
            <Seats entry={entry} />
            <Text size="xs" c="dimmed">
              Last move {ageWords(entry.lastActivityAt)}
            </Text>
          </Stack>
          <Button
            rightSection={<ArrowRight size={16} aria-hidden />}
            onClick={() =>
              onNote(
                entry.stage === 'play'
                  ? `Would open the table at ${whereWords(entry)}.`
                  : `Would open ${STAGE_WORDS[entry.stage].toLowerCase()}.`
              )
            }
          >
            Resume
          </Button>
        </div>
        {notice === null ? null : (
          <Text size="sm" role="status" className={styles.notice}>
            {notice}
          </Text>
        )}
      </Stack>
    </Card>
  );
}

/** Seat pips: a filled dot per player, a ring per free seat. */
function SeatPips({ entry }: Readonly<{ entry: DesignEntry }>) {
  return (
    <span className={styles.pips} aria-label={`${openSeats(entry)} of ${entry.seatCount} seats free`} role="img">
      {Array.from({ length: entry.seatCount }, (_, index) => (
        <span key={index} className={styles.pip} data-taken={index < entry.seatsFilled || undefined} />
      ))}
    </span>
  );
}

function OpenRow({
  entry,
  notice,
  onJoin,
  onNote,
}: Readonly<{ entry: DesignEntry; notice: string | null; onJoin: () => void; onNote: (text: string) => void }>) {
  const free = openSeats(entry);
  return (
    <li className={styles.row}>
      <div className={styles.rowMain}>
        <Text fw={700} truncate>
          {entry.name}
        </Text>
        <Text size="xs" c="dimmed" truncate>
          {hostWords(entry)} · {ageWords(entry.lastActivityAt)}
        </Text>
      </div>
      <div className={styles.rowSeats}>
        <SeatPips entry={entry} />
        <Text size="xs" c="dimmed">
          {free} open
        </Text>
      </div>
      <Group gap="xs" wrap="nowrap" className={styles.rowActions}>
        <Button
          size="xs"
          variant="subtle"
          leftSection={<Eye size={14} aria-hidden />}
          onClick={() => onNote('Would open the table to watch.')}
        >
          Watch
        </Button>
        <Button size="xs" color="confirm" leftSection={<UserPlus size={14} aria-hidden />} onClick={onJoin}>
          Join
        </Button>
      </Group>
      {notice === null ? null : (
        <Text size="xs" role="status" className={clsx(styles.notice, styles.rowNotice)}>
          {notice}
        </Text>
      )}
    </li>
  );
}

function WatchRow({
  entry,
  notice,
  onNote,
}: Readonly<{ entry: DesignEntry; notice: string | null; onNote: (text: string) => void }>) {
  const turn = turnOf(entry);
  return (
    <li className={styles.row}>
      <div className={styles.rowMain}>
        <Text fw={700} truncate>
          {entry.name}
        </Text>
        <Text size="xs" c="dimmed" truncate>
          {whereWords(entry)} · {ageWords(entry.lastActivityAt)}
        </Text>
      </div>
      <div className={styles.rowSeats}>
        {turn === null ? (
          <StatusBadge tone={STAGE_TONE[entry.stage]}>{STAGE_WORDS[entry.stage]}</StatusBadge>
        ) : (
          <span className={styles.miniTrack} role="img" aria-label={`Turn ${turn} of ${LAST_TURN}`}>
            {Array.from({ length: LAST_TURN }, (_, index) => (
              <span
                key={index}
                className={styles.miniTurn}
                data-state={index + 1 < turn ? 'done' : index + 1 === turn ? 'now' : 'later'}
              />
            ))}
          </span>
        )}
      </div>
      <Group gap="xs" wrap="nowrap" className={styles.rowActions}>
        <Button
          size="xs"
          variant="subtle"
          leftSection={<Eye size={14} aria-hidden />}
          onClick={() => onNote('Would open the table to watch.')}
        >
          Watch
        </Button>
      </Group>
      {notice === null ? null : (
        <Text size="xs" role="status" className={clsx(styles.notice, styles.rowNotice)}>
          {notice}
        </Text>
      )}
    </li>
  );
}

function PastRow({ entry }: Readonly<{ entry: DesignEntry }>) {
  const mine = entry.players.find((player) => player.displayName === VIEWER);
  const won = mine?.faction != null && entry.result?.factions.includes(mine.faction) === true;
  return (
    <li className={styles.pastRow} data-mine={entry.viewerSeated || undefined}>
      <div className={styles.rowMain}>
        <Group gap="xs" wrap="nowrap" miw={0}>
          <Text fw={600} truncate>
            {entry.name}
          </Text>
          {entry.viewerSeated ? (
            <Badge size="xs" variant="outline" color="slate" className={styles.mineBadge}>
              {won ? 'You won' : mine?.faction != null ? `You, ${mine.faction}` : 'You played'}
            </Badge>
          ) : null}
        </Group>
        <Text size="xs" c="dimmed" truncate>
          {entry.ruleset} · {entry.seatCount} players · {ageWords(entry.lastActivityAt)}
        </Text>
      </div>
      <div className={styles.result} aria-label={resultWords(entry.result) ?? undefined}>
        {entry.result === null || entry.result.kind === 'none' ? (
          <Text size="xs" c="dimmed" fs="italic">
            No winner
          </Text>
        ) : (
          entry.result.factions.map((faction) => (
            <Badge
              key={faction}
              size="sm"
              variant="light"
              color="confirm"
              leftSection={
                entry.result?.kind === 'alliance' ? <Swords size={11} aria-hidden /> : <Trophy size={11} aria-hidden />
              }
            >
              {faction}
            </Badge>
          ))
        )}
      </div>
    </li>
  );
}

function CreateGameModal({
  opened,
  onClose,
  onCreate,
}: Readonly<{
  opened: boolean;
  onClose: () => void;
  onCreate: (game: { name: string; ruleset: string; seatCount: number }) => void;
}>) {
  const [name, setName] = useState('');
  const [ruleset, setRuleset] = useState<string>(RULESETS[0]);
  const [seats, setSeats] = useState('6');
  const [open, setOpen] = useState(true);
  const [tried, setTried] = useState(false);
  const trimmed = name.trim();
  const close = () => {
    setName('');
    setTried(false);
    onClose();
  };
  return (
    <Modal opened={opened} onClose={close} title="Create a game" centered>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setTried(true);
          if (trimmed !== '') {
            onCreate({ name: trimmed, ruleset, seatCount: Number(seats) });
            close();
          }
        }}
      >
        <Stack gap="md">
          <TextInput
            label="Name"
            placeholder="Friday night table"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            error={tried && trimmed === '' ? 'Give the game a name.' : undefined}
            data-autofocus
          />
          <Select
            label="Ruleset"
            data={[...RULESETS]}
            value={ruleset}
            onChange={(value) => setRuleset(value ?? RULESETS[0])}
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
          />
          <Stack gap={4}>
            <Text size="sm" fw={500}>
              Seats
            </Text>
            <SegmentedControl fullWidth data={SEAT_CHOICES} value={seats} onChange={setSeats} />
            <Text size="xs" c="dimmed">
              You take the first seat. Drafting starts once every seat is filled.
            </Text>
          </Stack>
          <Switch
            label="Open to anyone"
            description="Show the game under open seats. Otherwise only people with the invite link can join."
            checked={open}
            onChange={(event) => setOpen(event.currentTarget.checked)}
          />
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" color="confirm">
              Create game
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

function JoinModal({
  entry,
  onClose,
  onJoin,
}: Readonly<{ entry: DesignEntry | null; onClose: () => void; onJoin: (gameId: string) => void }>) {
  return (
    <Modal opened={entry !== null} onClose={onClose} title="Take a seat" centered size="sm">
      {entry === null ? null : (
        <Stack gap="md">
          <Text>
            Join <strong>{entry.name}</strong> as seat {entry.seatsFilled + 1} of {entry.seatCount}?
          </Text>
          <Text size="sm" c="dimmed">
            {hostWords(entry)}. Drafting starts once every seat is filled.
          </Text>
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button color="confirm" onClick={() => onJoin(entry.gameId)} data-autofocus>
              Join
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}

function EmptyLobby({ onCreate }: Readonly<{ onCreate: () => void }>) {
  return (
    <Surface padding="xl" className={styles.empty}>
      <Stack align="center" gap="sm" className={styles.emptyInner}>
        <span className={styles.emptyMark} aria-hidden>
          <Swords size={28} />
        </span>
        <Text fw={700} size="xl">
          No games yet
        </Text>
        <Text c="dimmed" ta="center" maw={420}>
          Start a table, pick a ruleset and invite your players. Games that others open will show up here too.
        </Text>
        <Button color="confirm" size="md" mt="xs" onClick={onCreate} leftSection={<Plus size={17} aria-hidden />}>
          Create a game
        </Button>
      </Stack>
    </Surface>
  );
}

export function CommandLobby({ entries }: Readonly<{ entries: DesignEntry[] }>) {
  const [state, dispatch] = useReducer(lobbyReducer, { entries, notice: null, created: 0 });
  const [creating, setCreating] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const ongoing = state.entries.filter((entry) => entry.stage !== 'finished' && entry.stage !== 'discarded');
  const mine = ongoing.filter((entry) => entry.viewerSeated).sort(byUrgency);
  const open = ongoing.filter(joinable).sort(byRecency);
  const watching = ongoing.filter((entry) => !entry.viewerSeated && !joinable(entry)).sort(byUrgency);
  const past = state.entries.filter((entry) => entry.stage === 'finished').sort(byRecency);
  const joining = state.entries.find((entry) => entry.gameId === joiningId) ?? null;

  const noticeFor = (gameId: string) => (state.notice?.gameId === gameId ? state.notice.text : null);
  const note = (gameId: string) => (text: string) => dispatch({ kind: 'noted', notice: { gameId, text } });
  const inPlay = mine.filter((entry) => entry.stage === 'play').length;
  const summary =
    mine.length === 0
      ? 'You hold no seat yet. Take an open one or start your own.'
      : `You sit in ${mine.length} ${mine.length === 1 ? 'game' : 'games'}${inPlay > 0 ? `, ${inPlay} in play` : ''}.`;

  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <Stack align="center" gap="md">
          <Stack gap={4} miw={0} align="center">
            <PageTitle eyebrow="Play" title="Your games" />
            {state.entries.length === 0 ? null : (
              <Text size="sm" c="dimmed" ta="center">
                {summary}
              </Text>
            )}
          </Stack>
          {state.entries.length === 0 ? null : (
            <CallToAction
              renderRoot={(rootProps) => <button type="button" {...rootProps} onClick={() => setCreating(true)} />}
            >
              Create a game
            </CallToAction>
          )}
        </Stack>
      </PageLayout.Header>
      <PageLayout.Content>
        <div className={styles.lobby}>
          {state.entries.length === 0 ? (
            <EmptyLobby onCreate={() => setCreating(true)} />
          ) : (
            <>
              {mine.length === 0 ? null : (
                <Section title="Your seats" description="Ordered by what needs you: games in play first.">
                  <div className={styles.hero}>
                    {mine.map((entry) => (
                      <SeatCard
                        key={entry.gameId}
                        entry={entry}
                        notice={noticeFor(entry.gameId)}
                        onNote={note(entry.gameId)}
                      />
                    ))}
                  </div>
                </Section>
              )}
              <div className={styles.lower}>
                <div className={styles.lowerMain}>
                  <Card title="Open seats" padding="lg">
                    {open.length === 0 ? (
                      <Text size="sm" c="dimmed">
                        No game has a free seat right now. Create one and invite your table.
                      </Text>
                    ) : (
                      <ul className={styles.rows}>
                        {open.map((entry) => (
                          <OpenRow
                            key={entry.gameId}
                            entry={entry}
                            notice={noticeFor(entry.gameId)}
                            onJoin={() => setJoiningId(entry.gameId)}
                            onNote={note(entry.gameId)}
                          />
                        ))}
                      </ul>
                    )}
                  </Card>
                  <Card title="Being played" padding="lg">
                    {watching.length === 0 ? (
                      <Text size="sm" c="dimmed">
                        No other game is under way.
                      </Text>
                    ) : (
                      <ul className={styles.rows}>
                        {watching.map((entry) => (
                          <WatchRow
                            key={entry.gameId}
                            entry={entry}
                            notice={noticeFor(entry.gameId)}
                            onNote={note(entry.gameId)}
                          />
                        ))}
                      </ul>
                    )}
                  </Card>
                </div>
                <Card title="Past games" padding="lg" className={styles.past}>
                  {past.length === 0 ? (
                    <Text size="sm" c="dimmed">
                      No game has finished yet.
                    </Text>
                  ) : (
                    <ul className={styles.rows}>
                      {past.map((entry) => (
                        <PastRow key={entry.gameId} entry={entry} />
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
            </>
          )}
        </div>
        <CreateGameModal
          opened={creating}
          onClose={() => setCreating(false)}
          onCreate={(game) => dispatch({ kind: 'created', ...game })}
        />
        <JoinModal
          entry={joining}
          onClose={() => setJoiningId(null)}
          onJoin={(gameId) => {
            dispatch({ kind: 'joined', gameId });
            setJoiningId(null);
          }}
        />
      </PageLayout.Content>
    </PageLayout>
  );
}
