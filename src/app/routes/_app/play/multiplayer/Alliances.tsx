import { Button, Group, Text } from '@mantine/core';
import { alliesOf } from '@shared/play/alliances';
import type { AllianceState } from '@shared/play/alliances';
import { snapshotFactionLabels } from '@shared/play/factionLabels';
import { rosterSeat } from '@shared/play/schema';
import { Surface } from '@ui/surface/Surface';
import { Handshake } from 'lucide-react';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';

type Props = Readonly<{ client: TableSession; table: TableProjection }>;

/* Each alliance takes one hue in the players rail, by its place in the list, so two alliances never share a ring. */
const ALLIANCE_HUES = ['teal', 'grape', 'orange', 'lime', 'cyan', 'pink'] as const;

export function viewerFaction(table: TableProjection): string | undefined {
  return rosterSeat(table.snapshot.roster, table.viewer.viewerSeat)?.faction?.id;
}

/** The ring colour of the alliance `factionId` belongs to, or undefined when it stands alone. */
export function allianceHue(alliances: AllianceState | undefined, factionId: string | undefined) {
  if (!factionId) {
    return undefined;
  }
  const index = alliances?.groups.findIndex((group) => group.includes(factionId)) ?? -1;
  return index < 0 ? undefined : `var(--mantine-color-${ALLIANCE_HUES[index % ALLIANCE_HUES.length]}-5)`;
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
            <Handshake size={20} aria-hidden />
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

/** A player's alliance on their Info tab, with the viewer's offer, withdrawal or leaving. */
export function PlayerAlliance({ client, table, seat }: Props & Readonly<{ seat: string }>) {
  const factionId = rosterSeat(table.snapshot.roster, seat)?.faction?.id;
  if (!factionId || table.snapshot.stage !== 'play') {
    return null;
  }
  const alliances = table.snapshot.alliances;
  const names = snapshotFactionLabels(table.snapshot);
  const own = viewerFaction(table);
  const allies = alliesOf(alliances, factionId);
  const offered = alliances?.offers.some((offer) => offer.from === own && offer.to === factionId);
  const incoming = alliances?.offers.some((offer) => offer.from === factionId && offer.to === own);
  const hue = allianceHue(alliances, factionId);
  return (
    <>
      <Group gap="xs" wrap="nowrap">
        <Handshake size={18} aria-hidden color={hue ?? 'currentColor'} />
        <Text size="sm">{allies.length ? `Allied with ${factionList(names, allies)}` : 'No alliance'}</Text>
      </Group>
      {own === factionId
        ? allies.length > 0 && (
            <Button
              variant="default"
              disabled={!table.canInteract}
              onClick={() => client.command({ kind: 'alliance-leave' })}
            >
              Leave alliance
            </Button>
          )
        : own &&
          !allies.includes(own) &&
          (offered ? (
            <Group gap="sm">
              <Text size="sm" c="dimmed">
                Waiting for {names[factionId] ?? factionId} to answer your offer.
              </Text>
              <Button
                size="compact-sm"
                variant="subtle"
                disabled={!table.canInteract}
                onClick={() => client.command({ kind: 'alliance-withdraw', factionId })}
              >
                Withdraw offer
              </Button>
            </Group>
          ) : (
            <Button
              variant="default"
              disabled={!table.canInteract}
              onClick={() => client.command({ kind: incoming ? 'alliance-accept' : 'alliance-offer', factionId })}
            >
              {incoming ? 'Accept alliance' : 'Offer alliance'}
            </Button>
          ))}
    </>
  );
}
