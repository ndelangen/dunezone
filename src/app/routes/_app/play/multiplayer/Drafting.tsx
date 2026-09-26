import { Button, Group, Stack, Switch, Text, TextInput, Tooltip, UnstyledButton, VisuallyHidden } from '@mantine/core';
import {
  bannedIds,
  bannersOf,
  draftGates,
  draftStatus,
  draftWarning,
  draftedPool,
  isBanned,
  pickersOf,
} from '@shared/play/drafting';
import type { DraftFaction, DraftState } from '@shared/play/drafting';
import { emptyPublicControls } from '@shared/play/inventory';
import type { PublicControls } from '@shared/play/inventory';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import clsx from 'clsx';
import { useState } from 'react';
import type { CSSProperties } from 'react';

import { Token } from '@game/assets/faction/token/Token';

import styles from './Drafting.module.css';
import type { TableProjection, TableSession } from './TableSession';

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

function playersOf(table: TableProjection): Player[] {
  const controls = table.snapshot.controls ?? emptyPublicControls();
  const seats = (table.snapshot.roster?.seats ?? []).map((seat) => seat.id);
  return controls.players
    .filter((player) => seats.includes(player.seat))
    .sort((a, b) => seats.indexOf(a.seat) - seats.indexOf(b.seat));
}

function unavailableReason(banned: boolean, published: boolean): string | undefined {
  switch (true) {
    case banned:
      return 'Banned; remove every ban on it first';
    case !published:
      return 'Not generated yet: its assets are not published';
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

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
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

/** A player is their real avatar, round, no border; a ready player carries a small check. */
function PlayerMark({ player, size, ready = false }: Readonly<{ player: Player; size: number; ready?: boolean }>) {
  const style = { '--avatar-size': `${size}rem` } as CSSProperties;
  return (
    <span className={styles.avatar} style={style} title={`${player.name}${ready ? ', ready' : ''}`}>
      {player.avatar ? (
        <img className={styles.avatarImage} src={player.avatar} alt="" />
      ) : (
        <span className={styles.avatarInitials} aria-hidden="true">
          {initials(player.name)}
        </span>
      )}
      {ready && (
        <span className={styles.avatarCheck} aria-label="ready">
          ✓
        </span>
      )}
      <VisuallyHidden>{player.name}</VisuallyHidden>
    </span>
  );
}

function OpenSeat({ size }: Readonly<{ size: number }>) {
  const style = { '--avatar-size': `${size}rem` } as CSSProperties;
  return (
    <span className={clsx(styles.avatar, styles.avatarOpen)} style={style} title="Open seat">
      <span className={styles.avatarInitials} aria-hidden="true">
        +
      </span>
    </span>
  );
}

function names(players: Player[], seats: string[]): string {
  return seats.map((seat) => players.find((player) => player.seat === seat)?.name ?? seat).join(', ');
}

/** The ledger on the table: every viewer sees the same draft. */
export function DraftingOverlay({ client, table }: Props) {
  const draft = draftOf(table);
  if (!draft) {
    return null;
  }
  const players = playersOf(table);
  const own = table.viewer.viewerSeat;
  const seatCount = table.snapshot.roster?.seatCount ?? players.length;
  const open = Math.max(0, seatCount - players.length);
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
        dim={kind === 'pick' && isBanned(draft, id)}
        title={ledgerTitle(mine, kind, faction.name, owner.name)}
        onClick={mine && !locked(table) ? () => client.command({ kind: undo, factionId: id }) : undefined}
      />
    );
  };
  return (
    <div className={styles.overlay} data-drafting-overlay="">
      <section className={styles.zone} aria-label="Banned factions">
        <h3 className={styles.zoneTitle}>Banned</h3>
        <ul className={styles.zoneList}>
          {bannedIds(draft).map((id) => {
            const faction = factionById(draft, id);
            return faction ? (
              <li key={id}>
                <FactionToken
                  faction={faction}
                  size={2.6}
                  banned
                  title={`${faction.name}, banned by ${names(players, bannersOf(draft, id))}`}
                />
              </li>
            ) : null;
          })}
        </ul>
      </section>
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
          {Array.from({ length: open }, (_, index) => (
            <li key={`open-${index}`} className={styles.ledgerRow}>
              <span className={styles.side} />
              <OpenSeat size={2.6} />
              <span className={styles.side} />
            </li>
          ))}
        </ol>
      </section>
      <section className={clsx(styles.zone, styles.zoneDrafted)} aria-label="Drafted factions">
        <h3 className={styles.zoneTitle}>Drafted</h3>
        <ul className={clsx(styles.zoneList, styles.zoneListEnd)}>
          {draftedPool(draft).map((id) => {
            const faction = factionById(draft, id);
            return faction ? (
              <li key={id}>
                <FactionToken
                  faction={faction}
                  size={2.6}
                  title={`${faction.name}, drafted by ${names(players, pickersOf(draft, id))}`}
                />
              </li>
            ) : null;
          })}
        </ul>
      </section>
    </div>
  );
}

/** The drafting statistics in the page header's centre, where turn and phase sit during play. */
export function DraftingHeader({ table }: Readonly<{ table: TableProjection }>) {
  const draft = draftOf(table);
  if (!draft) {
    return null;
  }
  const controls = table.snapshot.controls ?? emptyPublicControls();
  const gates = draftGates(draft, controls.seats, draft.minimum);
  const warning = draftWarning(gates);
  const fill = gates.poolSize < gates.seated ? Math.min(gates.fillable, gates.seated - gates.poolSize) : 0;
  return (
    <div className={styles.header} aria-live="polite">
      <div className="seated-phase-status__copy">
        <span>Drafting</span>
        <strong>{draftStatus(gates)}</strong>
      </div>
      <span className={styles.gates}>
        <span className={clsx(styles.gate, gates.minimumMet && styles.gateMet)}>
          Seats <strong>{gates.seated}</strong>/{gates.minimum}+
        </span>
        <Tooltip
          label={warning.kind === 'none' ? 'Drafted factions are dealt randomly when everyone is ready.' : warning.text}
          multiline
          maw={320}
          events={{ hover: true, focus: true, touch: true }}
        >
          <UnstyledButton
            type="button"
            aria-label="Draft pool details"
            className={clsx(styles.gate, styles.poolHelp, gates.enoughFactions && styles.gateMet)}
          >
            Pool <strong>{gates.poolSize}</strong>/{gates.seated}
            {fill > 0 && <em> +{fill} random</em>}
          </UnstyledButton>
        </Tooltip>
        <span className={clsx(styles.gate, gates.allReady && styles.gateMet)}>
          Ready <strong>{gates.ready}</strong>/{gates.seated}
        </span>
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
  const why = unavailableReason(banned, faction.published);
  const pickers = pickersOf(draft, faction.id);
  const banners = bannersOf(draft, faction.id);
  return (
    <li className={clsx(styles.row, banned && styles.rowBanned)}>
      <FactionToken faction={faction} size={2.2} banned={banned} dim={!faction.published} title={faction.name} />
      <div>
        <Text size="sm" fw={700}>
          {faction.name}
        </Text>
        <Text size="xs" c="dimmed">
          {why ?? factionTag(faction)}
        </Text>
      </div>
      <Group gap="xs">
        {pickers.length > 0 && <Attribution verb="picked" players={players} seats={pickers} />}
        {banners.length > 0 && <Attribution verb="banned" players={players} seats={banners} />}
      </Group>
      <Group gap="xs" wrap="nowrap">
        <Button
          size="compact-sm"
          variant={picked ? 'filled' : 'default'}
          aria-pressed={picked}
          disabled={locked(table) || ((banned || !faction.published) && !picked)}
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
export function DraftingPanel({ client, table }: Props) {
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

/** Readiness and personal draft summary sit above the faction selector. */
export function DraftingReadiness({ client, table }: Props) {
  const draft = draftOf(table);
  const own = table.viewer.viewerSeat;
  if (!draft || own === SPECTATOR_SEAT) {
    return null;
  }
  const ready = draft.ready.includes(own);
  const mine = draft.picks[own] ?? [];
  const bans = draft.bans[own] ?? [];
  const name = (id: string) => factionById(draft, id)?.name ?? id;
  return (
    <Group justify="space-between" gap="sm">
      <Text size="sm" c="dimmed" className={styles.mine}>
        Your draft: {mine.length ? mine.map(name).join(', ') : 'nothing yet'}
        {bans.length ? `; banned ${bans.map(name).join(', ')}` : ''}
      </Text>
      <Button
        variant={ready ? 'default' : 'filled'}
        aria-pressed={ready}
        disabled={locked(table)}
        onClick={() => client.command({ kind: 'draft-ready', ready: !ready })}
      >
        {ready ? 'Ready, withdraw' : 'Ready'}
      </Button>
    </Group>
  );
}

/** Only failures that prevent dealing interrupt the decision strip. */
export function DraftingNotice({ client, table }: Props) {
  const draft = draftOf(table);
  if (!draft) {
    return null;
  }
  const controls = table.snapshot.controls ?? emptyPublicControls();
  const warning = draftWarning(draftGates(draft, controls.seats, draft.minimum));
  if (!draft.failure && warning.kind !== 'short') {
    return null;
  }
  return (
    <Stack gap="xs">
      {draft.failure && (
        <Group role="alert" gap="sm">
          <Text size="sm">
            <strong>Seats were not dealt. </strong>
            {draft.failure} Fix the content or change the draft, or try the deal again as it stands.
          </Text>
          <Button
            size="xs"
            variant="default"
            disabled={locked(table)}
            onClick={() => client.command({ kind: 'draft-ready', ready: true })}
          >
            Try again
          </Button>
        </Group>
      )}
      {warning.kind === 'short' && (
        <Text role="alert" size="sm">
          <strong>Nobody can be dealt yet. </strong>
          {warning.text}
        </Text>
      )}
    </Stack>
  );
}
