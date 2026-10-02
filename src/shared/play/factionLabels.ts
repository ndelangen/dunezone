import { seatLabel } from './participation';
import type { TableRoster } from './schema';

/** Whoever holds a seat now, by the public name the table shows. */
type SeatHolder<P> = P & { seat: string; name: string };

/*
 * How one seated faction is named (#1667). A faction's display name may repeat across seats, so only when two seated
 * factions share one does it carry a tie-breaker: the player holding the seat, or the seat itself while nobody holds
 * it or when the players' names repeat too.
 */
export type FactionTitle<P = object> = Readonly<{
  name: string;
  tieBreak: { kind: 'player'; player: SeatHolder<P> } | { kind: 'seat'; seat: string } | null;
}>;

/** Every seated faction's title by its id. */
export function rosterFactionTitles<P>(
  roster: TableRoster | undefined,
  holders: readonly SeatHolder<P>[]
): ReadonlyMap<string, FactionTitle<P>> {
  const seats = roster?.seats.flatMap((seat) => (seat.faction ? [{ seat: seat.id, faction: seat.faction }] : [])) ?? [];
  const tally = (values: readonly string[]) => (value: string) => values.filter((entry) => entry === value).length;
  const nameCount = tally(seats.map(({ faction }) => faction.name));
  const holderOf = (seat: string) => holders.find((holder) => holder.seat === seat);
  /* A player's name can repeat, or even read like another seat's label, so a tie-breaker counts by the text it shows. */
  const shown = (seat: string) => holderOf(seat)?.name ?? seatLabel(seat);
  const pairCount = tally(
    seats
      .filter(({ faction }) => nameCount(faction.name) > 1)
      .map(({ seat, faction }) => JSON.stringify([faction.name, shown(seat)]))
  );
  return new Map(
    seats.map(({ seat, faction }): [string, FactionTitle<P>] => {
      if (nameCount(faction.name) < 2) {
        return [faction.id, { name: faction.name, tieBreak: null }];
      }
      const player = holderOf(seat);
      const unique = player && pairCount(JSON.stringify([faction.name, shown(seat)])) === 1;
      return [
        faction.id,
        { name: faction.name, tieBreak: unique ? { kind: 'player', player } : { kind: 'seat', seat } },
      ];
    })
  );
}

/** What tells a title apart as plain text, "Alice" or "seat 3", or nothing when its name is its own. */
function factionTieBreakText(title: FactionTitle): string | undefined {
  if (!title.tieBreak) {
    return undefined;
  }
  return title.tieBreak.kind === 'player' ? title.tieBreak.player.name : seatLabel(title.tieBreak.seat);
}

/** A title as plain text: "Harkonnen", or "Harkonnen (Alice)" and "Harkonnen (seat 3)" when two seats share the name. */
export function factionTitleText(title: FactionTitle): string {
  const tieBreak = factionTieBreakText(title);
  return tieBreak ? `${title.name} (${tieBreak})` : title.name;
}

/** Every seated faction's label by its id, told apart by its player only where two seated factions share a name. */
export function rosterFactionLabels(
  roster: TableRoster | undefined,
  holders: readonly { seat: string; name: string }[]
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    [...rosterFactionTitles(roster, holders)].map(([id, title]) => [id, factionTitleText(title)])
  );
}

/** The labels a snapshot shows, by who holds each seat as its controls say now. */
export function snapshotFactionLabels(snapshot: {
  roster?: TableRoster;
  controls?: { players: readonly { seat: string; name: string }[] };
}): Readonly<Record<string, string>> {
  return rosterFactionLabels(snapshot.roster, snapshot.controls?.players ?? []);
}

/** Only the tie-breakers a snapshot shows, by faction id, for a place that already names the faction. */
export function snapshotFactionTieBreaks(snapshot: {
  roster?: TableRoster;
  controls?: { players: readonly { seat: string; name: string }[] };
}): Readonly<Partial<Record<string, string>>> {
  return Object.fromEntries(
    [...rosterFactionTitles(snapshot.roster, snapshot.controls?.players ?? [])].flatMap(([id, title]) => {
      const tieBreak = factionTieBreakText(title);
      return tieBreak ? [[id, tieBreak]] : [];
    })
  );
}

/** A faction as a table event names it: events name seats and never players, so a shared name carries its seat. */
export function rosterFactionEventName(roster: TableRoster | undefined, factionId: string): string {
  const title = rosterFactionTitles(roster, []).get(factionId);
  return title ? factionTitleText(title) : factionId;
}
