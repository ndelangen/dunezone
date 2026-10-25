import type { PublicationAssetType } from '../../src/shared/asset-publishing/publicationTargets';
import { publisherFailureFields } from '../../src/shared/asset-publishing/publisher-diagnostics';
import { boundedPublisherTelemetryEvent } from './telemetry';

type DeliveryFailure = {
  operation:
    | 'r2_head'
    | 'r2_get'
    | 'cache_match'
    | 'cache_range_match'
    | 'cache_put'
    | 'resolve_component'
    | 'read_component_envelope';
  result: 'unavailable' | 'fallback' | 'cache_not_stored';
  reason:
    | 'exception'
    | 'missing_object'
    | 'missing_body'
    | 'etag_mismatch'
    | 'pending_publication'
    | 'missing_envelope';
  httpStatus?: number;
  startedAt: number;
  error?: unknown;
  expectedEtag?: string;
  actualEtag?: string | null;
};

export type ReportDeliveryFailure = (failure: DeliveryFailure) => void;

export function deliveryReporter(
  request: Request,
  assetType: PublicationAssetType,
  assetId: string
): ReportDeliveryFailure {
  const ray = request.headers.get('CF-Ray');
  const rayId = ray && /^[a-f\d]{16}(?:-[A-Z]{3})?$/iu.test(ray) ? ray : undefined;
  return ({ error, startedAt, ...failure }) => {
    const details = error === undefined ? undefined : publisherFailureFields(error);
    const provider = details?.errors.find((detail) => detail.code !== undefined);
    const context = {
      event: 'asset_delivery_failure',
      assetType,
      assetId,
      method: request.method,
      rayId,
      ...failure,
      elapsedMs: Math.max(0, Date.now() - startedAt),
      providerCode: provider?.code,
      providerAction: provider?.action,
    };
    emitDeliveryFailure(context, details);
  };
}

function emitDeliveryFailure(
  context: Record<string, unknown>,
  details: ReturnType<typeof publisherFailureFields> | undefined
): void {
  let event = boundedPublisherTelemetryEvent({ ...context, ...details });
  if (event.result === 'telemetry_truncated') {
    /* Keep the failed operation and request when a large error graph exceeds the log budget. */
    event = boundedPublisherTelemetryEvent({
      ...context,
      error: details?.error.slice(0, 128),
      errors: details?.errors.map(({ name, message, code, action }) => ({
        name: name.slice(0, 64),
        message: message.slice(0, 128),
        code,
        action,
      })),
      errorsTruncated: true,
    });
  }
  console.error(JSON.stringify(event));
}
