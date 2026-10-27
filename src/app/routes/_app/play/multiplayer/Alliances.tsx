import { Button, Group, Stack, Text, Tooltip } from '@mantine/core';
import { alliesOf } from '@shared/play/alliances';
import type { AllianceAction, AllianceState } from '@shared/play/alliances';
import { snapshotFactionLabels } from '@shared/play/factionLabels';
import { playUiColors, withAlpha } from '@shared/uiPalette';
import { Section } from '@ui/block/Section';
import { TopicIcon } from '@ui/content/TopicIcon';
import type { ReactNode } from 'react';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import { alliedFactionColors, allianceRingStyle } from './allianceColors';
import { FactionTokenFace, FactionTokenGroup } from './FactionTokenFace';
import { ALLIANCES_HELP } from './panelGuidance';
import { actingFaction, seatFaction, viewerFaction } from './tableFactions';

type Props = Readonly<{ client: TableSession; table: TableProjection }>;

function factionList(names: Readonly<Record<string, string>>, ids: readonly string[]) {
  const labels = ids.map((id) => names[id] ?? id);
  return labels.length < 2 ? (labels[0] ?? '') : `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
}

/** Alliances show while the game is in play and, read-only, once it is finished, so everyone still sees who was allied at the end. */
export function showsAlliances(stage: string | undefined) {
  return stage === 'play' || stage === 'finished';
}

/** A seat's alliance as the Faction info shows it: the faction's allies as tokens, how it stands with the viewer, and the one action that fits. */
export type SeatAlliance = Readonly<{ mark: ReactNode; status: string; action: ReactNode }>;

/** The seat's alliance, or null outside play and for a seat without a faction. */
export function seatAlliance(client: TableSession, table: TableProjection, seat: string): SeatAlliance | null {
  const factionId = seatFaction(table, seat);
  if (!factionId || !showsAlliances(table.snapshot.stage)) {
    return null;
  }
  const names = snapshotFactionLabels(table.snapshot);
  const row = { factionId, seat, player: null };
  return {
    mark: <AllianceMark table={table} allies={alliesOf(table.snapshot.alliances, factionId)} />,
    status: rowStatus(table.snapshot.alliances, row, viewerFaction(table), names),
    action: <RowAction client={client} table={table} row={row} />,
  };
}

/* The faction's allies as their tokens, or the alliance mark while it has none. */
function AllianceMark({
  table,
  allies,
  size = 22,
}: Readonly<{ table: TableProjection; allies: readonly string[]; size?: number }>) {
  if (allies.length) {
    return (
      <FactionTokenGroup table={table} factionIds={allies} names={snapshotFactionLabels(table.snapshot)} size={size} />
    );
  }
  return (
    <span
      style={{
        display: 'inline-flex',
        borderRadius: '50%',
        background: 'var(--color-ground)',
        color: 'var(--color-muted)',
      }}
    >
      <TopicIcon topic="alliance" size={size - 4} />
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

/*
 * The command for one of the viewer's alliance actions about `factionId`.
 * Breaking names an ally the viewer saw, so a late click never leaves an alliance formed since; a withdrawal or an answer names the offer the viewer saw.
 */
function allianceAction(
  alliances: AllianceState | undefined,
  kind: AllianceCommandKind,
  own: string,
  factionId: string
): AllianceAction | null {
  if (kind === 'alliance-offer') {
    return { kind, factionId };
  }
  if (kind === 'alliance-break') {
    return { kind, factionId: alliesOf(alliances, own)[0] ?? own };
  }
  const [from, to] = kind === 'alliance-withdraw' ? [own, factionId] : [factionId, own];
  const offer = alliances?.offers.find((entry) => entry.from === from && entry.to === to);
  return offer ? { kind, factionId, offer: offer.id } : null;
}

/* What the viewer may do about one faction: offer, accept or decline, withdraw an offer, or break their own alliance. */
function RowAction({ client, table, row }: Props & Readonly<{ row: Row }>) {
  const own = actingFaction(table);
  /* Alliances change only while the game is in play. */
  if (!own || table.snapshot.stage !== 'play') {
    return null;
  }
  const Action = ACTIONS[relationTo(table.snapshot.alliances, own, row.factionId)];
  const send = (kind: AllianceCommandKind) => {
    const action = allianceAction(table.snapshot.alliances, kind, own, row.factionId);
    if (action) {
      client.command(action);
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
    <Section hiddenHeading title="Alliances" description={ALLIANCES_HELP}>
      <Stack gap="xs">
        {rows.map((row) => {
          const colors = alliedFactionColors(snapshot, row.factionId);
          const allies = alliesOf(snapshot.alliances, row.factionId);
          return (
            <Group key={row.factionId} justify="space-between" gap="sm" wrap="nowrap">
              <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'inline-flex', flexShrink: 0, ...allianceRingStyle(colors) }}>
                  <FactionTokenFace table={table} factionId={row.factionId} names={names} size={32} />
                </span>
                <Stack gap={0} style={{ minWidth: 0 }}>
                  <Text size="sm" fw={700} truncate>
                    {names[row.factionId] ?? row.factionId}
                    {row.player ? ` · ${row.player}` : ' · Open seat'}
                  </Text>
                  <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                    {allies.length > 0 && (
                      <FactionTokenGroup table={table} factionIds={allies} names={names} size={18} />
                    )}
                    <Text size="xs" c="dimmed" truncate>
                      {rowStatus(snapshot.alliances, row, own, names)}
                    </Text>
                  </Group>
                </Stack>
              </Group>
              <div style={{ flexShrink: 0 }}>
                <RowAction client={client} table={table} row={row} />
              </div>
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
  if (!groups.length || !showsAlliances(table.snapshot.stage)) {
    return null;
  }
  const names = snapshotFactionLabels(table.snapshot);
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
                background: withAlpha(playUiColors.annotationGold, 0.14),
                border: `1px solid ${withAlpha(playUiColors.annotationGold, 0.55)}`,
              }}
            >
              {group.map((factionId, index) => (
                <FactionTokenFace
                  key={factionId}
                  table={table}
                  factionId={factionId}
                  names={names}
                  size={26}
                  style={{ marginLeft: index ? -6 : 0 }}
                />
              ))}
            </Group>
          </Tooltip>
        );
      })}
    </Group>
  );
}
