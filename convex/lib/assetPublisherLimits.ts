export const FREE_BROWSER_ALLOWANCE_MS = 10 * 60 * 1_000;
// Temporary rollout-drain admission estimate. Exact settlement still replaces this reservation
// with measured Browser time, while the Worker lifecycle remains bounded independently at 240s.
export const BROWSER_RESERVATION_MS = 20 * 1_000;
