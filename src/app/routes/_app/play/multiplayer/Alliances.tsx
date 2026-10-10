import { Avatar, Button, Group, Stack, Text } from '@mantine/core';
import { alliesOf } from '@shared/play/alliances';
import type { AllianceState } from '@shared/play/alliances';
import { snapshotFactionLabels } from '@shared/play/factionLabels';
import { rosterSeat } from '@shared/play/schema';
import { Section } from '@ui/block/Section';
import { TopicIcon } from '@ui/content/TopicIcon';
import { Surface } from '@ui/surface/Surface';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import { allianceThemeColor } from './allianceHues';

type Props = Readonly<{ client: TableSession; table: TableProjection }>;

export function viewerFaction(table: TableProjection): string | undefined {
  return rosterSeat(table.snapshot.roster, table.viewer.viewerSeat)?.faction?.id;
}

/** The ring colour of the alliance `factionId` belongs to, or undefined when it stands alone. */
export function allianceHue(alliances: AllianceState | undefined, factionId: string | undefined) {
  if (!factionId) {
    return undefined;
  }
  const index = alliances?.groups.findIndex((group) => group.includes(factionId)) ?? -1;
  return index < 0 ? undefined : allianceThemeColor(index);
}

export function factionList(names: Readonly<Record<string, string>>, ids: readonly string[]) {
  const labels = ids.map((id) => names[id] ?? id);
  return labels.length < 2 ? (labels[0] ?? '') : `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
}

/** Offers made to the viewer's faction, each answered here in the decision bar. */
export function AllianceDecisionBar({ client, table }: Props) {
  const own = viewerFaction(table);
  const offers = table.snapshot.alliances?.offers.filter((offer) => offer.to === own) ?? [];
  if (!own || !offers.length) {
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
              onClick={() => client.command({ kind: 'alliance-accept', factionId: offer.from })}
            >
              Accept
            </Button>
            <Button
              size="compact-sm"
              variant="subtle"
              disabled={!table.canInteract}
              onClick={() => client.command({ kind: 'alliance-decline', factionId: offer.from })}
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
        <AllianceMark hue={allianceHue(table.snapshot.alliances, factionId)} />
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

/** What the viewer may do about one other faction: offer, accept or decline, or withdraw an offer. */
function RowAction({ client, table, row }: Props & Readonly<{ row: Row }>) {
  const own = viewerFaction(table);
  const alliances = table.snapshot.alliances;
  const disabled = !table.canInteract;
  if (!own) {
    return null;
  }
  if (row.factionId === own) {
    return alliesOf(alliances, own).length ? (
      <Button
        size="xs"
        variant="default"
        disabled={disabled}
        onClick={() => client.command({ kind: 'alliance-break' })}
      >
        Break alliance
      </Button>
    ) : (
      <Text size="sm" c="dimmed">
        Your faction
      </Text>
    );
  }
  if (alliesOf(alliances, own).includes(row.factionId)) {
    return (
      <Text size="sm" c="dimmed">
        Your ally
      </Text>
    );
  }
  const send = (kind: 'alliance-offer' | 'alliance-withdraw' | 'alliance-accept' | 'alliance-decline') =>
    client.command({ kind, factionId: row.factionId });
  if (alliances?.offers.some((offer) => offer.from === row.factionId && offer.to === own)) {
    return (
      <Group gap="xs" wrap="nowrap">
        <Button size="xs" disabled={disabled} onClick={() => send('alliance-accept')}>
          Accept
        </Button>
        <Button size="xs" variant="subtle" disabled={disabled} onClick={() => send('alliance-decline')}>
          Decline
        </Button>
      </Group>
    );
  }
  if (alliances?.offers.some((offer) => offer.from === own && offer.to === row.factionId)) {
    return (
      <Button size="xs" variant="subtle" disabled={disabled} onClick={() => send('alliance-withdraw')}>
        Withdraw offer
      </Button>
    );
  }
  return (
    <Button size="xs" variant="default" disabled={disabled} onClick={() => send('alliance-offer')}>
      Offer alliance
    </Button>
  );
}

function rowStatus(
  alliances: AllianceState | undefined,
  row: Row,
  own: string | undefined,
  names: Readonly<Record<string, string>>
) {
  const allies = alliesOf(alliances, row.factionId);
  if (alliances?.offers.some((offer) => offer.from === row.factionId && offer.to === own)) {
    return 'Offers you an alliance';
  }
  if (alliances?.offers.some((offer) => offer.from === own && offer.to === row.factionId)) {
    return 'Your offer is waiting';
  }
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
          const hue = allianceHue(snapshot.alliances, row.factionId);
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
