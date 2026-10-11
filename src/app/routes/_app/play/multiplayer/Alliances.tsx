import { Avatar, Button, Group, Stack, Text, Tooltip } from '@mantine/core';
import { alliesOf } from '@shared/play/alliances';
import type { AllianceState } from '@shared/play/alliances';
import { snapshotFactionLabels } from '@shared/play/factionLabels';
import { factionTokenStackKey } from '@shared/play/factionToken';
import { rosterSeat } from '@shared/play/schema';
import { Section } from '@ui/block/Section';
import { TopicIcon } from '@ui/content/TopicIcon';
import { Surface } from '@ui/surface/Surface';
import type { ReactNode } from 'react';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import { allianceSlot, allianceThemeColor } from './allianceHues';

type Props = Readonly<{ client: TableSession; table: TableProjection }>;

function viewerFaction(table: TableProjection): string | undefined {
  return rosterSeat(table.snapshot.roster, table.viewer.viewerSeat)?.faction?.id;
}

/** The ring colour of the alliance `factionId` belongs to, or undefined when it stands alone. */
export function allianceHue(snapshot: TableProjection['snapshot'], factionId: string | undefined) {
  const slot = allianceSlot(snapshot, factionId);
  return slot === undefined ? undefined : allianceThemeColor(slot);
}

function factionList(names: Readonly<Record<string, string>>, ids: readonly string[]) {
  const labels = ids.map((id) => names[id] ?? id);
  return labels.length < 2 ? (labels[0] ?? '') : `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
}

/* Offers waiting on the viewer's faction while the game is in play. */
function offersToViewer(table: TableProjection) {
  const own = viewerFaction(table);
  if (!own || table.snapshot.stage !== 'play') {
    return [];
  }
  return table.snapshot.alliances?.offers.filter((offer) => offer.to === own) ?? [];
}

/** Offers made to the viewer's faction, each answered here in the decision bar. */
export function AllianceDecisionBar({ client, table }: Props) {
  const offers = offersToViewer(table);
  if (!offers.length) {
    return null;
  }
  const names = snapshotFactionLabels(table.snapshot);
  return (
    <Surface padding="sm">
      {offers.map((offer) => {
        const allies = alliesOf(table.snapshot.alliances, offer.from);
        return (
          <Group key={offer.from} gap="sm" wrap="wrap">
            <TopicIcon topic="alliance" size={20} />
            <Text size="sm" fw={700}>
              {names[offer.from] ?? offer.from} offers you an alliance
              {allies.length ? ` (with ${factionList(names, allies)})` : ''}
            </Text>
            <Button
              size="compact-sm"
              disabled={!table.canInteract}
              onClick={() => client.command({ kind: 'alliance-accept', factionId: offer.from, offer: offer.id })}
            >
              Accept
            </Button>
            <Button
              size="compact-sm"
              variant="subtle"
              disabled={!table.canInteract}
              onClick={() => client.command({ kind: 'alliance-decline', factionId: offer.from, offer: offer.id })}
            >
              Decline
            </Button>
          </Group>
        );
      })}
    </Surface>
  );
}

/** A player's alliance on their Info tab, with what the viewer can do about it: offer, accept or decline, withdraw, or break an alliance. */
export function PlayerAlliance({ client, table, seat }: Props & Readonly<{ seat: string }>) {
  const factionId = rosterSeat(table.snapshot.roster, seat)?.faction?.id;
  if (!factionId || table.snapshot.stage !== 'play') {
    return null;
  }
  const names = snapshotFactionLabels(table.snapshot);
  const row = { factionId, seat, player: null };
  return (
    <Group gap="sm" justify="space-between" wrap="wrap">
      <Group gap="xs" wrap="nowrap">
        <AllianceMark hue={allianceHue(table.snapshot, factionId)} />
        <Text size="sm">{rowStatus(table.snapshot.alliances, row, viewerFaction(table), names)}</Text>
      </Group>
      <RowAction client={client} table={table} row={row} />
    </Group>
  );
}

function AllianceMark({ hue }: Readonly<{ hue: string | undefined }>) {
  return (
    <span style={{ color: hue ?? 'var(--mantine-color-dimmed)', display: 'inline-flex' }}>
      <TopicIcon topic="alliance" size={18} />
    </span>
  );
}

type Row = Readonly<{ factionId: string; seat: string; player: string | null }>;

/* How the viewer's faction stands with one faction at the table. */
type Relation = 'own-allied' | 'own' | 'ally' | 'incoming' | 'outgoing' | 'none';

function hasOffer(alliances: AllianceState | undefined, from: string | undefined, to: string | undefined) {
  return alliances?.offers.some((offer) => offer.from === from && offer.to === to) ?? false;
}

function relationTo(alliances: AllianceState | undefined, own: string, factionId: string): Relation {
  const allies = alliesOf(alliances, own);
  if (factionId === own) {
    return allies.length ? 'own-allied' : 'own';
  }
  if (allies.includes(factionId)) {
    return 'ally';
  }
  if (hasOffer(alliances, factionId, own)) {
    return 'incoming';
  }
  return hasOffer(alliances, own, factionId) ? 'outgoing' : 'none';
}

type ActionProps = Readonly<{ disabled: boolean; send: (kind: AllianceCommandKind) => void }>;
type AllianceCommandKind =
  | 'alliance-offer'
  | 'alliance-withdraw'
  | 'alliance-accept'
  | 'alliance-decline'
  | 'alliance-break';

const ACTIONS: Readonly<Record<Relation, (props: ActionProps) => ReactNode>> = {
  'own-allied': ({ disabled, send }) => (
    <Button size="xs" variant="default" disabled={disabled} onClick={() => send('alliance-break')}>
      Break alliance
    </Button>
  ),
  own: () => (
    <Text size="sm" c="dimmed">
      Your faction
    </Text>
  ),
  ally: () => (
    <Text size="sm" c="dimmed">
      Your ally
    </Text>
  ),
  incoming: ({ disabled, send }) => (
    <Group gap="xs" wrap="nowrap">
      <Button size="xs" disabled={disabled} onClick={() => send('alliance-accept')}>
        Accept
      </Button>
      <Button size="xs" variant="subtle" disabled={disabled} onClick={() => send('alliance-decline')}>
        Decline
      </Button>
    </Group>
  ),
  outgoing: ({ disabled, send }) => (
    <Button size="xs" variant="subtle" disabled={disabled} onClick={() => send('alliance-withdraw')}>
      Withdraw offer
    </Button>
  ),
  none: ({ disabled, send }) => (
    <Button size="xs" variant="default" disabled={disabled} onClick={() => send('alliance-offer')}>
      Offer alliance
    </Button>
  ),
};

/* What the viewer may do about one faction: offer, accept or decline, withdraw an offer, or break their own alliance. */
function RowAction({ client, table, row }: Props & Readonly<{ row: Row }>) {
  const own = viewerFaction(table);
  if (!own) {
    return null;
  }
  const Action = ACTIONS[relationTo(table.snapshot.alliances, own, row.factionId)];
  /* Breaking names an ally the viewer saw, so a late click never leaves an alliance formed since. */
  const target = row.factionId === own ? (alliesOf(table.snapshot.alliances, own)[0] ?? own) : row.factionId;
  /* An answer names the offer the viewer saw. */
  const incoming = table.snapshot.alliances?.offers.find((offer) => offer.from === row.factionId && offer.to === own);
  const send = (kind: AllianceCommandKind) => {
    if (kind !== 'alliance-accept' && kind !== 'alliance-decline') {
      client.command({ kind, factionId: target });
    } else if (incoming) {
      client.command({ kind, factionId: target, offer: incoming.id });
    }
  };
  return <Action disabled={!table.canInteract} send={send} />;
}

function rowStatus(
  alliances: AllianceState | undefined,
  row: Row,
  own: string | undefined,
  names: Readonly<Record<string, string>>
) {
  if (hasOffer(alliances, row.factionId, own)) {
    return 'Offers you an alliance';
  }
  if (hasOffer(alliances, own, row.factionId)) {
    return 'Your offer is waiting';
  }
  const allies = alliesOf(alliances, row.factionId);
  return allies.length ? `Allied with ${factionList(names, allies)}` : 'No alliance';
}

/**
 * The Alliances tab: every faction at the table in seat order, its alliance, and what the viewer can do about it.
 * Like trading seats during setup, each row carries the one action that fits, so offers start here.
 */
export function AlliancesPanel({ client, table }: Props) {
  const { snapshot } = table;
  const names = snapshotFactionLabels(snapshot);
  const own = viewerFaction(table);
  const players = snapshot.controls?.players ?? [];
  const rows: Row[] =
    snapshot.roster?.seats.flatMap((seat) =>
      seat.faction
        ? [
            {
              factionId: seat.faction.id,
              seat: seat.id,
              player: players.find((entry) => entry.seat === seat.id)?.name ?? null,
            },
          ]
        : []
    ) ?? [];
  return (
    <Section
      helpOnly
      title="Alliances"
      description="Offer an alliance to another faction. Once it accepts, the table shows you as allies until one of you breaks the alliance. Your ruleset decides when alliances may form and how large they may grow."
    >
      <Stack gap="xs">
        {rows.map((row) => {
          const logo = snapshot.factionArtwork?.[row.factionId]?.logo;
          const hue = allianceHue(snapshot, row.factionId);
          return (
            <Group key={row.factionId} justify="space-between" gap="sm" wrap="nowrap">
              <Group gap="sm" wrap="nowrap">
                <Avatar
                  src={logo}
                  size={32}
                  radius="xl"
                  alt=""
                  style={hue ? { boxShadow: `0 0 0 2px ${hue}` } : undefined}
                >
                  {(names[row.factionId] ?? row.factionId).slice(0, 1)}
                </Avatar>
                <Stack gap={0}>
                  <Text size="sm" fw={700}>
                    {names[row.factionId] ?? row.factionId}
                    {row.player ? ` · ${row.player}` : ' · Open seat'}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {rowStatus(snapshot.alliances, row, own, names)}
                  </Text>
                </Stack>
              </Group>
              <RowAction client={client} table={table} row={row} />
            </Group>
          );
        })}
      </Stack>
    </Section>
  );
}

/**
 * Every alliance at the table as its factions' tokens side by side, beside the logo in the top bar, so it shows in every view.
 * The strip keeps to the space beside the logo and scrolls sideways when the alliances outgrow it, so the top bar never grows and the phase stays clear.
 */
export function AllianceStrip({ table }: Readonly<{ table: TableProjection }>) {
  const groups = table.snapshot.alliances?.groups ?? [];
  if (!groups.length || table.snapshot.stage !== 'play') {
    return null;
  }
  const names = snapshotFactionLabels(table.snapshot);
  const face = (factionId: string) =>
    table.state.pieces.find((piece) => piece.stackKey === factionTokenStackKey(factionId))?.items[0]?.artwork?.front;
  return (
    <Group
      gap="xs"
      wrap="nowrap"
      aria-label="Alliances"
      style={{ flex: '0 1 auto', minWidth: 0, overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'thin' }}
    >
      {groups.map(({ members: group }) => {
        const label = `${factionList(names, group)} are allied`;
        return (
          <Tooltip key={group.join(':')} label={label} withinPortal>
            <Group
              gap={0}
              wrap="nowrap"
              role="img"
              aria-label={label}
              style={{
                flexShrink: 0,
                padding: '2px 6px',
                borderRadius: 999,
                background: 'rgba(210, 174, 104, 0.14)',
                border: '1px solid rgba(210, 174, 104, 0.55)',
              }}
            >
              {group.map((factionId, index) => (
                <Avatar
                  key={factionId}
                  src={face(factionId)}
                  size={26}
                  radius="xl"
                  alt=""
                  style={{ marginLeft: index ? -6 : 0, border: '1px solid #d2ae68' }}
                >
                  {(names[factionId] ?? factionId).slice(0, 1)}
                </Avatar>
              ))}
            </Group>
          </Tooltip>
        );
      })}
    </Group>
  );
}
