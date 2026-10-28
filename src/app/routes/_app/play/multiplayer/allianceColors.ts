import { alliesOf } from '@shared/play/alliances';
import type { AllianceState } from '@shared/play/alliances';
import { factionTokenOf } from '@shared/play/factionToken';

type AllianceColorsData = {
  alliances?: AllianceState;
  roster?: { seats: readonly { faction: { id: string; color: string } | null }[] };
  table: { pieces: readonly { stackKey: string | null; color: string }[] };
};

/** The faction's authored colour, retained in the roster or its table token. */
export function factionColor(snapshot: AllianceColorsData, factionId: string): string | undefined {
  return (
    snapshot.roster?.seats.find(({ faction }) => faction?.id === factionId)?.faction?.color ??
    factionTokenOf(snapshot.table.pieces, factionId)?.color
  );
}

/** Each ally contributes its own colour, matching the coins beneath the faction's token. */
export function alliedFactionColors(snapshot: AllianceColorsData, factionId: string | undefined): string[] {
  return factionId
    ? alliesOf(snapshot.alliances, factionId).flatMap((id) => {
        const color = factionColor(snapshot, id);
        return color ? [color] : [];
      })
    : [];
}
