import { describe, expect, test } from 'vitest';

import { factionPublicationStatus } from './factionPublicationStatus';

describe('factionPublicationStatus', () => {
  test('tells the editor a failed replacement may have left the published sheet out of date', () => {
    const status = factionPublicationStatus({
      status: 'current',
      captureStatus: 'error',
      publicationHref: '/published/sheet.pdf',
      lastPublishedAt: null,
    });

    expect(status.label).toBe(
      'The published faction sheet may be out of date because the latest changes were not captured.'
    );
    /* The glyph reads as failed too, not only the words. */
    expect(status.tone).toBe('negative');
  });
});
