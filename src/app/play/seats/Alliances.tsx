import { Anchor, Group, Text, Tooltip } from '@mantine/core';
import { snapshotFactionLabels } from '@shared/play/factionLabels';
import { playUiColors, withAlpha } from '@shared/uiPalette';
import { Handshake } from 'lucide-react';

import type { TableProjection } from '../../db/tabletop/TableSession';
import { factionList } from '../panels/alliances/alliances';
import { actingFaction } from '../table/tableFactions';
import { factionToken, FactionTokenFace } from './FactionTokenFace';

/** Alliances show while the game is in play and, read-only, once it is finished, so everyone still sees who was allied at the end. */
export function showsAlliances(stage: string | undefined) {
  return stage === 'play' || stage === 'finished';
}

/** The gold pill each alliance, and each faction's held tech tokens, stand in at the top bar. */
export const allianceStripPill = {
  flexShrink: 0,
  padding: '2px 6px',
  borderRadius: 999,
  background: withAlpha(playUiColors.annotationGold, 0.14),
  border: `1px solid ${withAlpha(playUiColors.annotationGold, 0.55)}`,
} as const;

/**
 * Every alliance at the table as its factions' tokens side by side, beside the emblem in the top bar, so it shows in every view.
 * The strip keeps to the space beside the emblem and scrolls sideways when the alliances outgrow it, so the top bar never grows and the phase stays clear.
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
        const label = `${factionList(names, group)} are in an alliance`;
        return (
          <Tooltip key={group.join(':')} label={label} withinPortal>
            <Group gap={0} wrap="nowrap" role="img" aria-label={label} style={allianceStripPill}>
              {group.map((factionId, index) => (
                <FactionTokenFace
                  key={factionId}
                  token={factionToken(table, factionId, names)}
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

/**
 * The factions waiting on the viewer's answer to an alliance offer, as the header's notice names them (#2978).
 * It links to the Alliances panel, where the offer is answered;
 * it shows only to the faction offered to, at the live table in play.
 */
export function AllianceOfferNotice({
  table,
  onOpenAlliances,
}: Readonly<{ table: TableProjection; onOpenAlliances?: () => void }>) {
  const own = actingFaction(table);
  const offers = (table.snapshot.alliances?.offers ?? []).filter((offer) => offer.to === own);
  if (!own || table.snapshot.stage !== 'play' || !offers.length) {
    return null;
  }
  const names = snapshotFactionLabels(table.snapshot);
  const from = factionList(
    names,
    offers.map((offer) => offer.from)
  );
  const verb = offers.length === 1 ? 'offers' : 'offer';
  const link = onOpenAlliances ? (
    <Anchor component="button" type="button" inherit onClick={onOpenAlliances}>
      Alliances
    </Anchor>
  ) : (
    'Alliances'
  );
  return (
    <Text size="sm" role="status" aria-label="Alliance offer">
      <Handshake size={14} aria-hidden style={{ verticalAlign: '-2px', marginRight: 4 }} />
      {from} {verb} you an alliance. Answer in {link}.
    </Text>
  );
}
