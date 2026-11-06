import { defaultGroupUnavailableRouteNoticeCode, isRouteNoticeCode } from '@shared/routeNotices';
import type { RouteNoticeCode } from '@shared/routeNotices';

export type RouteNotice = {
  code: RouteNoticeCode;
  tone: 'caution';
  title: string;
  message: string;
};

const routeNotices: Record<RouteNoticeCode, RouteNotice> = {
  [defaultGroupUnavailableRouteNoticeCode]: {
    code: defaultGroupUnavailableRouteNoticeCode,
    tone: 'caution',
    title: 'Saved without its default Group',
    message: 'The item was saved, but the default Group was no longer available and was not set.',
  },
};

/** URL input is untrusted; only an allowlisted code can resolve to fixed presentation. */
export function resolveRouteNotice(value: unknown): RouteNotice | null {
  return isRouteNoticeCode(value) ? routeNotices[value] : null;
}
