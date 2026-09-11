import { DRAFT_VARIANTS } from './drafting-prototype/fixture';
import type { DraftVariant } from './drafting-prototype/fixture';
import { DEFAULT_TABLE_SEAT_COUNT, isTableSeatCount } from './tableSettings';

/* PROTOTYPE (#1142): ?variant=A|B|C mounts a drafting overlay variant; absent means the plain demo. */
export function playSearch(search: Record<string, unknown>) {
  const requested = Number(search.seats);
  const variant = DRAFT_VARIANTS.find((candidate) => candidate === search.variant);
  return {
    seats: isTableSeatCount(requested) ? requested : DEFAULT_TABLE_SEAT_COUNT,
    variant: variant as DraftVariant | undefined,
  };
}
