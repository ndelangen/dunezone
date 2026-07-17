import { serializePublisherLogEvent } from '../../src/app/capture/publisher-diagnostics';
import { rendererManifest } from './renderer-manifest.generated';

export const MAX_TELEMETRY_EVENT_BYTES = 8_192;

export type PublisherBuildIdentity = {
  workerVersionId: string;
  workerVersionTag: string;
  workerVersionTimestamp: string;
  rendererId: string;
  rendererManifestDigest: string;
  configuredRendererVersion: string;
  rendererConfigurationMatchesManifest: boolean;
};

export function publisherBuildIdentity(
  metadata: WorkerVersionMetadata,
  configuredRendererVersion: string
): PublisherBuildIdentity {
  return {
    workerVersionId: metadata.id,
    workerVersionTag: metadata.tag,
    workerVersionTimestamp: metadata.timestamp,
    rendererId: rendererManifest.rendererId,
    rendererManifestDigest: rendererManifest.digest,
    configuredRendererVersion,
    rendererConfigurationMatchesManifest:
      configuredRendererVersion === rendererManifest.rendererVersion,
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
