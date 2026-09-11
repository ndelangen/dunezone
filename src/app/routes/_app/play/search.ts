import { DRAFT_VARIANTS, SCENARIOS } from './drafting-prototype/fixture';
import type { DraftVariant, Scenario } from './drafting-prototype/fixture';
import { DEFAULT_TABLE_SEAT_COUNT, isTableSeatCount } from './tableSettings';

/* PROTOTYPE (#1142, #1143, #1144, #1145): ?variant= mounts a prototype variant, ?scenario= its fixture state; absent means the plain demo. */
export function playSearch(search: Record<string, unknown>) {
  const requested = Number(search.seats);
  const variant = DRAFT_VARIANTS.find((candidate) => candidate === search.variant);
  const scenario = SCENARIOS.find((candidate) => candidate === search.scenario);
  return {
    seats: isTableSeatCount(requested) ? requested : DEFAULT_TABLE_SEAT_COUNT,
    variant: variant as DraftVariant | undefined,
    scenario: scenario as Scenario | undefined,
  };
}
