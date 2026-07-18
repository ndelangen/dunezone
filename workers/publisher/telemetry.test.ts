import { describe, expect, test } from 'vitest';

import { publisherFailureFields } from '../../src/app/capture/publisher-diagnostics';
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

  test('retains a maximum-sized actionable error graph within the event budget', () => {
    let error: Error = new Error(`leaf ${'x'.repeat(1_000)}`);
    for (let index = 0; index < 3; index += 1) {
      error = new Error(`cause ${index} ${'x'.repeat(1_000)}`, { cause: error });
    }
    for (let current: unknown = error; current instanceof Error; current = current.cause) {
      current.stack = `Error: ${current.message}\n${'s'.repeat(2_000)}`;
    }

    const bounded = boundedPublisherTelemetryEvent({
      event: 'asset_publisher_cron',
      result: 'failed',
      ...publisherFailureFields(error),
    });
    const serialized = JSON.stringify(bounded);

    expect(new TextEncoder().encode(serialized).byteLength).toBeLessThanOrEqual(
      MAX_TELEMETRY_EVENT_BYTES
    );
    expect(bounded.result).toBe('failed');
    expect(serialized).toContain('leaf ');
  });
});
