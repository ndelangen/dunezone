import { DEFAULT_TABLE_SEAT_COUNT, isTableSeatCount } from './tableSettings';

export function playSearch(search: Record<string, unknown>) {
  const requested = Number(search.seats);
  return { seats: isTableSeatCount(requested) ? requested : DEFAULT_TABLE_SEAT_COUNT };
}
