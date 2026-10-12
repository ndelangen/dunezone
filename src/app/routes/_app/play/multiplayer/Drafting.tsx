import {
  Avatar,
  Button,
  CloseButton,
  Group,
  Indicator,
  Stack,
  Switch,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
  VisuallyHidden,
} from '@mantine/core';
import {
  bannedIds,
  bannersOf,
  draftGates,
  draftStatus,
  draftWarning,
  draftedPool,
  isBanned,
  pickersOf,
  setAsideReason,
} from '@shared/play/drafting';
import type { DraftFaction, DraftState } from '@shared/play/drafting';
import type { PublicControls } from '@shared/play/inventory';
import type { SeatRequest } from '@shared/play/participation';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import { FormError } from '@ui/block/FormError';
import { ProfileLink } from '@ui/content/ProfileLink';
import clsx from 'clsx';
import { Check } from 'lucide-react';
import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import { Token } from '@game/assets/faction/token/Token';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import styles from './Drafting.module.css';
import { ReadyToggle } from './PhaseNavigation';
import { publicControlsOf } from './publicControls';
import { seatLocked } from './SeatRequests';

/*
 * Drafting as accepted on #1016 (overlay D, refined) and #1145 (the panel): the ledger over the
 * table with each player's bans left and picks right and the pooled Banned and Drafted zones at
 * the edges, tokens only; the statistics in the page header; the panel with search, a suitable-first
 * list and Draft and Ban toggles. Readiness and failures sit above the controls, with pool details
 * in the header tooltip. Tokens are the
 * real generated faces and players are their real avatars, neither with a border.
 */

type Props = Readonly<{ client: TableSession; table: TableProjection }>;
type Player = PublicControls['players'][number];

function draftOf(table: TableProjection): DraftState | undefined {
  return table.snapshot.stage === 'drafting' ? table.snapshot.draft : undefined;
}

/* What the deal waits for: enough players, enough factions in the pool, and everyone ready. */
function gatesOf(table: TableProjection, draft: DraftState) {
  return draftGates(draft, publicControlsOf(table).seats, draft.minimum);
}

function playersOf(table: TableProjection): Player[] {
  const controls = publicControlsOf(table);
  const seats = (table.snapshot.roster?.seats ?? []).map((seat) => seat.id);
  return controls.players
    .filter((player) => seats.includes(player.seat))
    .sort((a, b) => seats.indexOf(a.seat) - seats.indexOf(b.seat));
}

function unavailableReason(banned: boolean, published: boolean, setAside: string | undefined): string | undefined {
  switch (true) {
    case banned:
      return 'Banned; remove every ban on it first';
    case !published:
      return 'Not generated yet: its assets are not published';
    case setAside !== undefined:
      return `Not ready to deal: ${setAside}`;
    default:
      return undefined;
  }
}

function factionById(draft: DraftState, id: string): DraftFaction | undefined {
  return draft.factions.find((faction) => faction.id === id);
}

/** What a ledger token says on hover: the undo it offers its owner, or who put it there. */
function ledgerTitle(mine: boolean, kind: 'pick' | 'ban', faction: string, owner: string): string {
  switch (true) {
    case mine && kind === 'ban':
      return `Remove your ban on ${faction}`;
    case mine:
      return `Remove ${faction} from your draft`;
    case kind === 'ban':
      return `${owner} banned ${faction}`;
    default:
      return `${owner} drafted ${faction}`;
  }
}

/** No draft control sends while the session cannot act or a seat command is still in flight. */
function locked(table: TableProjection): boolean {
  return !table.canInteract || table.seatCommandPending;
}

/** The real generated token face, clipped round, no border; a banned token is greyed and slashed. */
function FactionToken({
  faction,
  size,
  banned = false,
  dim = false,
  title,
  onClick,
}: Readonly<{
  faction: DraftFaction;
  size: number;
  banned?: boolean;
  dim?: boolean;
  title: string;
  onClick?: () => void;
}>) {
  const className = clsx(styles.token, banned && styles.tokenBanned, dim && styles.tokenDim);
  const style = { '--token-size': `${size}rem` } as CSSProperties;
  const face = (
    <span className={styles.tokenFace} aria-hidden="true">
      <Token logo={faction.logo} background={faction.background} />
    </span>
  );
  return onClick ? (
    <button type="button" className={className} style={style} title={title} aria-label={title} onClick={onClick}>
      {face}
    </button>
  ) : (
    <span className={className} style={style} title={title} role="img" aria-label={title}>
      {face}
    </span>
  );
}

/*
 * A player is their real avatar, cited through `ProfileLink` so it leads to their profile; a ready player carries a
 * check. A player without a profile slug (an inactive account, or one admitted before slugs were carried) is the
 * avatar alone.
 */
function PlayerMark({ player, size, ready = false }: Readonly<{ player: Player; size: number; ready?: boolean }>) {
  const name = `${player.name}${ready ? ', ready' : ''}`;
  const mark = player.slug ? (
    <ProfileLink
      slug={player.slug}
      name={player.name}
      image={player.avatar}
      showName={false}
      title={name}
      style={
        {
          '--profile-link-avatar-size': `${size}rem`,
          '--profile-link-initials-size': `${size * 0.4}rem`,
        } as CSSProperties
      }
    />
  ) : (
    <Avatar src={player.avatar} size={`${size}rem`} radius="50%" alt="" role="img" aria-label={name} title={name}>
      {player.name.slice(0, 1)}
    </Avatar>
  );
  return (
    <Indicator color="green" size={16} label={<span aria-hidden="true">✓</span>} disabled={!ready}>
      {mark}
    </Indicator>
  );
}

function names(players: Player[], seats: string[]): string {
  return seats.map((seat) => players.find((player) => player.seat === seat)?.name ?? seat).join(', ');
}

/**
 * A pending seat request in the roster, under the seated players: the requester as a dashed ghost.
 * A player approves it here;
 * the spectator who asked waits here and can withdraw.
 */
function RequestRow({ client, table, request }: Props & Readonly<{ request: SeatRequest }>) {
  return (
    <li className={styles.ledgerRow} data-seat-request={request.id}>
      <span className={styles.side} />
      <Avatar
        size="2.6rem"
        radius="50%"
        color="gray"
        className={styles.requestGhost}
        role="img"
        aria-label={request.own ? 'Your seat request' : `${request.requesterName} asks for a seat`}
      >
        {request.requesterName.slice(0, 1)}
      </Avatar>
      <span className={clsx(styles.side, styles.sidePicks)}>
        <span className={styles.requestTag}>
          {request.own ? (
            <>
              <Text span size="sm" c="dimmed">
                Waiting for approval
              </Text>
              <CloseButton
                size="sm"
                radius="xl"
                aria-label="Withdraw your seat request"
                title="Withdraw"
                disabled={seatLocked(table)}
                onClick={() => client.command({ kind: 'seat-withdraw' })}
              />
            </>
          ) : (
            <>
              <Text span size="sm" fw={600}>
                {request.requesterName}
              </Text>
              <Text span size="sm" c="dimmed">
                asks to sit
              </Text>
              {/* Keyed by the request, so a press that began on one request never approves the next. */}
              <Button
                key={request.id}
                size="compact-sm"
                radius="xl"
                color="green"
                leftSection={<Check size={14} aria-hidden />}
                disabled={seatLocked(table)}
                onClick={() => client.command({ kind: 'seat-approve', requestId: request.id })}
              >
                Approve
              </Button>
            </>
          )}
        </span>
      </span>
    </li>
  );
}

/* The pooled zones at the ledger's edges: every banned faction on the left, every drafted one on the right. */
const POOL_ZONES = {
  banned: { title: 'Banned', zone: styles.zoneBanned, list: undefined, ids: bannedIds, by: bannersOf },
  drafted: { title: 'Drafted', zone: styles.zoneDrafted, list: styles.zoneListEnd, ids: draftedPool, by: pickersOf },
} as const;

function PoolZone({
  kind,
  draft,
  players,
}: Readonly<{ kind: keyof typeof POOL_ZONES; draft: DraftState; players: Player[] }>) {
  const zone = POOL_ZONES[kind];
  return (
    <section className={clsx(styles.zone, zone.zone)} aria-label={`${zone.title} factions`}>
      <h2 className={styles.zoneTitle}>{zone.title}</h2>
      <ul className={clsx(styles.zoneList, zone.list)}>
        {zone.ids(draft).map((id) => {
          const faction = factionById(draft, id);
          return faction ? (
            <li key={id}>
              <FactionToken
                faction={faction}
                size={2.6}
                banned={kind === 'banned'}
                title={`${faction.name}, ${kind} by ${names(players, zone.by(draft, id))}`}
              />
            </li>
          ) : null;
        })}
      </ul>
    </section>
  );
}

/** The ledger on the table: every viewer sees the same draft. */
export function DraftingOverlay({ client, table, error = null }: Props & Readonly<{ error?: string | null }>) {
  const draft = draftOf(table);
  if (!draft) {
    return null;
  }
  const players = playersOf(table);
  const own = table.viewer.viewerSeat;
  const controls = publicControlsOf(table);
  /* While drafting a request names no seat; a spectator sees only their own, a player every one they can approve. */
  const requests = controls.seatRequests.filter(
    (request) => request.seat === null && (own !== SPECTATOR_SEAT || request.own)
  );
  const token = (id: string, size: number, mine: boolean, kind: 'ban' | 'pick', owner: Player) => {
    const faction = factionById(draft, id);
    if (!faction) {
      return null;
    }
    const undo = kind === 'ban' ? 'draft-unban' : 'draft-unpick';
    return (
      <FactionToken
        key={id}
        faction={faction}
        size={size}
        banned={kind === 'ban'}
        dim={kind === 'pick' && (isBanned(draft, id) || setAsideReason(draft, id) !== undefined)}
        title={ledgerTitle(mine, kind, faction.name, owner.name)}
        onClick={mine && !locked(table) ? () => client.command({ kind: undo, factionId: id }) : undefined}
      />
    );
  };
  return (
    <div className={styles.overlay} data-drafting-overlay="">
      <div className={styles.layout}>
        <PoolZone kind="banned" draft={draft} players={players} />
        <section className={styles.ledger} aria-label="Players">
          <ol className={styles.ledgerList}>
            {players.map((player) => (
              <li key={player.seat} className={clsx(styles.ledgerRow, player.seat === own && styles.ledgerRowMine)}>
                <span className={clsx(styles.side, styles.sideBans)}>
                  {(draft.bans[player.seat] ?? []).map((id) => token(id, 1.7, player.seat === own, 'ban', player))}
                </span>
                <PlayerMark player={player} size={2.6} ready={draft.ready.includes(player.seat)} />
                <span className={clsx(styles.side, styles.sidePicks)}>
                  {(draft.picks[player.seat] ?? []).map((id) => token(id, 1.7, player.seat === own, 'pick', player))}
                </span>
              </li>
            ))}
            {requests.map((request) => (
              <RequestRow key={request.id} client={client} table={table} request={request} />
            ))}
            {/* The (+) is a spectator's way into the roster; players never see it, and it goes once the spectator has asked. */}
            {own === SPECTATOR_SEAT && !requests.some((request) => request.own) && (
              <li className={styles.ledgerRow}>
                <span className={styles.side} />
                <Tooltip label="Take a seat" withinPortal>
                  <UnstyledButton
                    className={styles.openSeat}
                    aria-label="Take a seat"
                    disabled={seatLocked(table)}
                    onClick={() => client.command({ kind: 'seat-request' })}
                  >
                    +
                  </UnstyledButton>
                </Tooltip>
                <span className={styles.side} />
              </li>
            )}
            {/* A spectator has no panel, so a refused request is said beneath the roster where it was asked. */}
            {own === SPECTATOR_SEAT && error && (
              <li className={styles.requestError}>
                <FormError title="From the table">{error}</FormError>
              </li>
            )}
          </ol>
        </section>
        <PoolZone kind="drafted" draft={draft} players={players} />
      </div>
    </div>
  );
}

type Gate = Readonly<{ label: string; count: ReactNode; met: boolean; current: boolean; help?: string }>;

/** One step of the deal's track: a dot that fills once met, the current step ringed. */
function GateStep({ gate }: Readonly<{ gate: Gate }>) {
  const className = clsx(styles.gate, gate.met && styles.gateMet, gate.current && styles.gateCurrent);
  const content = (
    <>
      <span className={styles.gateDot} aria-hidden="true">
        {gate.met ? <Check size={11} strokeWidth={3.5} /> : null}
      </span>
      {gate.label} <strong>{gate.count}</strong>
      {/* A met step fills in, and says so in words for anyone who cannot see it. */}
      {gate.met && <VisuallyHidden component="span">, met</VisuallyHidden>}
      {gate.help && <VisuallyHidden component="span">. {gate.help}</VisuallyHidden>}
    </>
  );
  /* A step with more to say is a button, so the keyboard reaches its tooltip as the pointer does. */
  return gate.help ? (
    <Tooltip label={gate.help} multiline maw={320} events={{ hover: true, focus: true, touch: true }}>
      <UnstyledButton type="button" className={className}>
        {content}
      </UnstyledButton>
    </Tooltip>
  ) : (
    <span className={className}>{content}</span>
  );
}

/**
 * The drafting chip at the top left of the header (#2056's phase chip, direction B of the drafting header round): the stage and the ruleset, the three things the deal waits for as one track that fills in, and one line saying what the table waits for now.
 * A failed deal or a pool too small to deal turns that line amber.
 */
export function DraftingHeader({
  table,
  rulesetName,
  invite,
}: Readonly<{ table: TableProjection; rulesetName?: string; invite?: ReactNode }>) {
  const draft = draftOf(table);
  if (!draft) {
    return null;
  }
  const gates = gatesOf(table, draft);
  const warning = draftWarning(gates);
  const fill = gates.poolSize < gates.seated ? Math.min(gates.fillable, gates.seated - gates.poolSize) : 0;
  const poolHelp =
    warning.kind === 'none' ? 'Drafted factions are dealt randomly when everyone is ready.' : warning.text;
  const current = !gates.minimumMet ? 'players' : !gates.enoughFactions ? 'factions' : 'ready';
  const alert = draft.failure
    ? { line: 'Seats were not dealt', help: `${draft.failure} Fix the content or change the draft, then deal again.` }
    : warning.kind === 'short'
      ? { line: 'Not enough factions in the pool', help: warning.text }
      : null;
  /* The header around this is already the polite live region, so the line announces through it rather than again. */
  return (
    <div className={styles.header}>
      <span className={styles.headerEyebrow}>
        Drafting{rulesetName ? <span className={styles.headerRuleset}> · {rulesetName}</span> : null}
      </span>
      <span className={styles.track} role="list" aria-label="Before the deal">
        {(
          [
            {
              label: 'Players',
              count: `${gates.seated}/${gates.minimum}+`,
              met: gates.minimumMet,
              current: current === 'players',
            },
            {
              label: 'Factions',
              count: (
                <>
                  {gates.poolSize}/{gates.seated}
                  {fill > 0 && <em> +{fill} random</em>}
                </>
              ),
              met: gates.enoughFactions,
              current: current === 'factions',
              help: poolHelp,
            },
            {
              label: 'Ready',
              count: `${gates.ready}/${gates.seated}`,
              met: gates.allReady,
              current: current === 'ready',
            },
          ] satisfies Gate[]
        ).map((gate, index) => (
          <span key={gate.label} role="listitem" className={styles.trackItem}>
            {index > 0 && (
              <span
                className={clsx(
                  styles.trackLink,
                  (index === 1 ? gates.minimumMet : gates.enoughFactions) && styles.trackLinkMet
                )}
                aria-hidden="true"
              />
            )}
            <GateStep gate={gate} />
          </span>
        ))}
      </span>
      <span className={styles.headerLine}>
        {alert ? (
          /* A button, like a gate step, so the keyboard reaches the reason and the way out as the pointer does. */
          <Tooltip label={alert.help} multiline maw={340} events={{ hover: true, focus: true, touch: true }}>
            <UnstyledButton type="button" className={styles.headerAlert}>
              <strong>
                {alert.line}
                <VisuallyHidden component="span">. {alert.help}</VisuallyHidden>
              </strong>
            </UnstyledButton>
          </Tooltip>
        ) : (
          <strong>{draftStatus(gates)}</strong>
        )}
        {!gates.minimumMet && table.viewer.viewerSeat !== SPECTATOR_SEAT && invite}
      </span>
    </div>
  );
}

function factionTag(faction: DraftFaction): string {
  switch (true) {
    case !faction.published:
      return 'not generated';
    case faction.linked:
      return 'suitable for this ruleset';
    default:
      return 'other faction';
  }
}

/** Who picked or banned a faction: the verb, red for a ban like the Ban button, then each player's mark. */
function Attribution({
  verb,
  players,
  seats,
}: Readonly<{ verb: 'picked' | 'banned'; players: Player[]; seats: string[] }>) {
  const cited = seats.map((seat) => players.find((player) => player.seat === seat)).filter((p) => p !== undefined);
  return (
    <Group gap="xs" wrap="nowrap">
      <Text span size="xs" c={verb === 'banned' ? 'red' : 'dimmed'}>
        {verb}
      </Text>
      {cited.map((player) => (
        <PlayerMark key={player.seat} player={player} size={1.05} />
      ))}
    </Group>
  );
}

function FactionRow({
  client,
  table,
  draft,
  faction,
  players,
}: Props & Readonly<{ draft: DraftState; faction: DraftFaction; players: Player[] }>) {
  const own = table.viewer.viewerSeat;
  const banned = isBanned(draft, faction.id);
  const picked = (draft.picks[own] ?? []).includes(faction.id);
  const mine = (draft.bans[own] ?? []).includes(faction.id);
  const aside = setAsideReason(draft, faction.id);
  const why = unavailableReason(banned, faction.published, aside);
  const dealable = faction.published && aside === undefined;
  const pickers = pickersOf(draft, faction.id);
  const banners = bannersOf(draft, faction.id);
  return (
    <li className={clsx(styles.row, banned && styles.rowBanned)}>
      <FactionToken faction={faction} size={2.2} banned={banned} dim={!dealable} title={faction.name} />
      <div>
        <Text size="sm" fw={700}>
          {faction.name}
        </Text>
        <Text size="xs" c="dimmed">
          {why ?? factionTag(faction)}
        </Text>
      </div>
      <Group gap="xs" className={styles.rowStatus}>
        {pickers.length > 0 && <Attribution verb="picked" players={players} seats={pickers} />}
        {banners.length > 0 && <Attribution verb="banned" players={players} seats={banners} />}
      </Group>
      <Group gap="xs" wrap="nowrap" className={styles.rowActions}>
        <Button
          size="compact-sm"
          variant={picked ? 'filled' : 'default'}
          aria-pressed={picked}
          disabled={locked(table) || ((banned || !dealable) && !picked)}
          title={why}
          onClick={() => client.command({ kind: picked ? 'draft-unpick' : 'draft-pick', factionId: faction.id })}
        >
          {picked ? 'Drafted' : 'Draft'}
        </Button>
        <Button
          size="compact-sm"
          color="red"
          variant={mine ? 'filled' : 'default'}
          aria-pressed={mine}
          disabled={locked(table)}
          onClick={() => client.command({ kind: mine ? 'draft-unban' : 'draft-ban', factionId: faction.id })}
        >
          {mine ? 'Banned' : 'Ban'}
        </Button>
      </Group>
    </li>
  );
}

/** The drafting panel for a seated player; a spectator's panel is the bar alone. */
export function DraftingPanel({ client, table, error }: Props & Readonly<{ error?: string | null }>) {
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const draft = draftOf(table);
  const own = table.viewer.viewerSeat;
  if (!draft || own === SPECTATOR_SEAT) {
    return null;
  }
  const players = playersOf(table);
  const needle = query.trim().toLowerCase();
  const rows = draft.factions.filter(
    (faction) => (showAll || faction.linked || needle.length > 0) && faction.name.toLowerCase().includes(needle)
  );
  return (
    <Stack gap="sm" className={styles.panel} data-drafting-panel="">
      {/* A refused draft or seat command shows above the list that sent it. */}
      {error && <FormError title="From the table">{error}</FormError>}
      <Group gap="sm" align="center" wrap="wrap">
        <TextInput
          aria-label="Search factions"
          placeholder="Search factions"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          className={styles.search}
        />
        <Switch
          label="Show all factions"
          checked={showAll}
          onChange={(event) => setShowAll(event.currentTarget.checked)}
        />
      </Group>
      <ul className={styles.list} aria-label="Factions">
        {rows.map((faction) => (
          <FactionRow
            key={faction.id}
            client={client}
            table={table}
            draft={draft}
            faction={faction}
            players={players}
          />
        ))}
        {rows.length === 0 && (
          <li>
            <Text size="sm" c="dimmed">
              No faction matches.
            </Text>
          </li>
        )}
      </ul>
    </Stack>
  );
}

/** The header's Ready toggle while drafting: the same toggle as in play, counting the seated players who are ready. */
export function DraftingReady({ client, table }: Props) {
  const draft = draftOf(table);
  const own = table.viewer.viewerSeat;
  if (!draft || own === SPECTATOR_SEAT) {
    return null;
  }
  const gates = gatesOf(table, draft);
  const ready = draft.ready.includes(own);
  /* A failed deal keeps everyone's readiness, so a ready player deals again rather than withdrawing. */
  if (draft.failure && ready) {
    return (
      <Button
        color="yellow"
        disabled={locked(table)}
        onClick={() => client.command({ kind: 'draft-ready', ready: true })}
      >
        Deal again
      </Button>
    );
  }
  return (
    <ReadyToggle
      ready={ready}
      count={gates.ready}
      of={gates.seated}
      disabled={locked(table)}
      onToggle={() => client.command({ kind: 'draft-ready', ready: !ready })}
    />
  );
}
