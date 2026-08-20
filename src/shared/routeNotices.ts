/**
 * Codes safe to return from server mutations and carry through route search.
 * Presentation belongs to the browser route registry, never this shared contract.
 */
export const routeNoticeCodes = ['default-group-unavailable'] as const;

export type RouteNoticeCode = (typeof routeNoticeCodes)[number];

export const defaultGroupUnavailableRouteNoticeCode = routeNoticeCodes[0];

export function isRouteNoticeCode(value: unknown): value is RouteNoticeCode {
  return typeof value === 'string' && routeNoticeCodes.includes(value as RouteNoticeCode);
}
