import { defaultGroupUnavailableRouteNoticeCode } from '@shared/routeNotices';
import { describe, expect, test } from 'vitest';

import { resolveRouteNotice } from './-routeNotices';

describe('route notices', () => {
  test('resolves an approved code to its fixed presentation', () => {
    expect(resolveRouteNotice(defaultGroupUnavailableRouteNoticeCode)).toEqual({
      code: defaultGroupUnavailableRouteNoticeCode,
      color: 'yellow',
      title: 'Saved without its default Group',
      message: 'The item was saved, but the default Group was no longer available and was not set.',
    });
  });

  test('ignores unknown URL input', () => {
    expect(resolveRouteNotice('not-a-route-notice')).toBeNull();
    expect(resolveRouteNotice(['default-group-unavailable'])).toBeNull();
  });
});
