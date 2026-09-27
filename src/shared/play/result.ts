import { z } from 'zod';

import { tableCountSchema, tableIdentitySchema } from './schema';
import { TABLE_SEAT_COUNTS } from './tableSettings';

/**
 * The end of a real game: Determine winner opens the sequence during Mentat pause, its player declares one faction, an alliance or no winner, and Continue playing drops the result again.
 * One seated player acts each time;
 * nobody votes or confirms.
 */
const gameResultKindSchema = z.enum(['faction', 'alliance', 'none']);
export type GameResultKind = z.infer<typeof gameResultKindSchema>;

const factionIdsSchema = z.array(tableIdentitySchema).max(TABLE_SEAT_COUNTS[TABLE_SEAT_COUNTS.length - 1]!);

/** The seated player who acted, by the name they held then; a deleted account reads `[deleted user]`. */
const actorSchema = z.object({ seat: tableIdentitySchema, name: z.string().max(160) });

/** The open sequence: every panel shows who is determining the winner. */
export const gameEndingSchema = z.object({ by: actorSchema, startedAt: tableCountSchema });

/** The declared result while the game is finished. */
export const gameResultSchema = z.object({
  kind: gameResultKindSchema,
  factionIds: factionIdsSchema,
  by: actorSchema,
  declaredAt: tableCountSchema,
});
export type GameResult = z.infer<typeof gameResultSchema>;

export const resultActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('result-open') }),
  z.strictObject({ kind: z.literal('result-cancel') }),
  z.strictObject({ kind: z.literal('result-declare'), result: gameResultKindSchema, factionIds: factionIdsSchema }),
  z.strictObject({ kind: z.literal('result-continue') }),
]);
export type ResultAction = z.infer<typeof resultActionSchema>;
const kinds: ReadonlySet<string> = new Set(resultActionSchema.options.map((option) => option.shape.kind.value));
export function isResultAction(action: { kind: string }): action is ResultAction {
  return kinds.has(action.kind);
}

/** How many factions each kind names: one winner, an alliance of two or more, or none. */
export function resultFactionCountFits(kind: GameResultKind, count: number): boolean {
  switch (kind) {
    case 'faction':
      return count === 1;
    case 'alliance':
      return count >= 2;
    case 'none':
      return count === 0;
  }
}

/** The result as one sentence, with the factions already named. */
export function describeResult(kind: GameResultKind, factions: string[]): string {
  switch (kind) {
    case 'faction':
      return `${factions[0]} won`;
    case 'alliance':
      return `${listNames(factions)} won as an alliance`;
    case 'none':
      return 'No winner';
  }
}

function listNames(names: string[]): string {
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}
