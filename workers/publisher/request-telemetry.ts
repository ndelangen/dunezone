import { publisherFailureFields } from '../../src/shared/asset-publishing/publisher-diagnostics';
import { boundedPublisherTelemetryEvent } from './telemetry';

export const SUCCESS_SAMPLE_RATE = 0.01;
export const SLOW_REQUEST_MS = 1000;

/* Only fixed route families enter logs; arbitrary paths can contain credentials or private names. */
const ROUTE_FAMILY =
  /^\/(auth|__play|__asset-publisher|publisher-capture|published|__user-images|user-images|__media|m|image|web|vector|public|social)(?:\/|$)/u;

type RequestIdentity = { GIT_SHA: string; CF_VERSION_METADATA: Env['CF_VERSION_METADATA'] };
type RequestOutcome = { response: Response } | { error: unknown };

function recordRequest(request: Request, env: RequestIdentity, startedAt: number, outcome: RequestOutcome): void {
  try {
    const elapsedMs = Math.max(0, Date.now() - startedAt);
    const status = 'response' in outcome ? outcome.response.status : undefined;
    const reason =
      'error' in outcome
        ? 'exception'
        : outcome.response.status >= 400
          ? 'http_error'
          : elapsedMs >= SLOW_REQUEST_MS
            ? 'slow'
            : 'sample';
    if (reason === 'sample' && Math.random() >= SUCCESS_SAMPLE_RATE) {
      return;
    }
    const ray = request.headers.get('CF-Ray');
    const event = {
      event: 'publisher_request',
      reason,
      method: request.method,
      route: ROUTE_FAMILY.exec(new URL(request.url).pathname)?.[1] ?? 'application',
      status,
      elapsedMs,
      sampleRate: reason === 'sample' ? SUCCESS_SAMPLE_RATE : 1,
      rayId: ray && /^[a-f\d]{16}(?:-[A-Z]{3})?$/iu.test(ray) ? ray : undefined,
      gitSha: env.GIT_SHA,
      workerVersionId: env.CF_VERSION_METADATA.id,
      ...('error' in outcome ? publisherFailureFields(outcome.error) : {}),
    };
    let bounded = boundedPublisherTelemetryEvent(event);
    if (bounded.result === 'telemetry_truncated') {
      bounded = boundedPublisherTelemetryEvent({
        ...event,
        error: undefined,
        errors: undefined,
        errorsTruncated: true,
      });
    }
    const message = JSON.stringify(bounded);
    if (reason === 'exception' || (status !== undefined && status >= 500)) {
      console.error(message);
    } else if (reason === 'http_error' || reason === 'slow') {
      console.warn(message);
    } else {
      console.log(message);
    }
  } catch {
    /* Logging must not change the response or replace the original exception. */
  }
}

/**
 * Measures runtime-clock response latency without consuming streams or changing WebSocket upgrades.
 * The deployed clock advances only after I/O, so CPU-only delays need Workers Metrics or profiling.
 */
export async function observePublisherRequest(
  request: Request,
  env: RequestIdentity,
  handle: () => Promise<Response>
): Promise<Response> {
  const startedAt = Date.now();
  let response: Response;
  try {
    response = await handle();
  } catch (error) {
    recordRequest(request, env, startedAt, { error });
    throw error;
  }
  recordRequest(request, env, startedAt, { response });
  return response;
}
