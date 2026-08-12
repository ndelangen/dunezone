import { serializePublisherLogEvent } from '../../src/shared/asset-publishing/publisher-diagnostics';
import { rendererManifest } from './renderer-manifest.generated';

export const MAX_TELEMETRY_EVENT_BYTES = 8192;

export type PublisherBuildIdentity = {
  gitSha: string;
  workerVersionId: string;
  workerVersionTag: string;
  workerVersionTimestamp: string;
  rendererIdentity: string;
  rendererManifestDigest: string;
};

export function publisherBuildIdentity(
  metadata: WorkerVersionMetadata,
  gitSha: string
): PublisherBuildIdentity {
  return {
    gitSha,
    workerVersionId: metadata.id,
    workerVersionTag: metadata.tag,
    workerVersionTimestamp: metadata.timestamp,
    rendererIdentity: rendererManifest.rendererIdentity,
    rendererManifestDigest: rendererManifest.digest,
  };
}

export function boundedPublisherTelemetryEvent(
  event: Record<string, unknown>
): Record<string, unknown> {
  const sanitized = JSON.parse(serializePublisherLogEvent(event)) as Record<string, unknown>;
  if (new TextEncoder().encode(JSON.stringify(sanitized)).byteLength <= MAX_TELEMETRY_EVENT_BYTES) {
    return sanitized;
  }
  return {
    event: typeof event.event === 'string' ? event.event.slice(0, 128) : 'asset_publisher_event',
    result: 'telemetry_truncated',
  };
}
