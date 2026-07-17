import { describe, expect, test } from 'vitest';

import { boundedPublisherTelemetryEvent, MAX_TELEMETRY_EVENT_BYTES } from './telemetry';

describe('bounded publisher telemetry', () => {
  test('keeps ordinary item-list events intact', () => {
    expect(
      boundedPublisherTelemetryEvent({
        event: 'asset_publisher_cron',
        result: 'completed',
        assigned: 20,
        completed: 20,
      })
    ).toEqual({
      event: 'asset_publisher_cron',
      result: 'completed',
      assigned: 20,
      completed: 20,
    });
  });

  test('drops oversized diagnostics without retaining their contents', () => {
    const secret = 'Bearer SECRET_ITEM_CLAIM';
    const bounded = boundedPublisherTelemetryEvent({
      event: 'asset_publisher_cron',
      diagnostic: `${secret}${'x'.repeat(100_000)}`,
    });
    const serialized = JSON.stringify(bounded);
    expect(new TextEncoder().encode(serialized).byteLength).toBeLessThanOrEqual(
      MAX_TELEMETRY_EVENT_BYTES
    );
    expect(bounded).toEqual({
      event: 'asset_publisher_cron',
      result: 'telemetry_truncated',
    });
    expect(serialized).not.toContain(secret);
  });
});
