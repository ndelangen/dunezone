import { publisherFailureFields } from '../../src/shared/asset-publishing/publisher-diagnostics';
import { boundedPublisherTelemetryEvent } from './telemetry';

const SUCCESS_SAMPLE_RATE = 0.01;
const SLOW_REQUEST_MS = 1000;

/* Only fixed route families enter logs; arbitrary paths can contain credentials or private names. */
const ROUTE_FAMILY =
  /^\/(auth|__play|__asset-publisher|publisher-capture|published|__user-images|user-images|__media|m|image|web|vector|public|social)(?:\/|$)/u;

type RequestIdentity = { GIT_SHA: string; CF_VERSION_METADATA: Env['CF_VERSION_METADATA'] };
type RequestOutcome = { response: Response } | { error: unknown };
type RequestReason = 'exception' | 'http_error' | 'slow' | 'sample';
type RequestPolicy = { reason: RequestReason; level: 'error' | 'warn' | 'log' };

function requestPolicy(outcome: RequestOutcome, elapsedMs: number): RequestPolicy {
  if ('error' in outcome) {
    return { reason: 'exception', level: 'error' };
  }
  if (outcome.response.status >= 500) {
    return { reason: 'http_error', level: 'error' };
  }
  if (outcome.response.status >= 400) {
    return { reason: 'http_error', level: 'warn' };
  }
  if (elapsedMs >= SLOW_REQUEST_MS) {
    return { reason: 'slow', level: 'warn' };
  }
  return { reason: 'sample', level: 'log' };
}

function requestEvent(
  request: Request,
  env: RequestIdentity,
  outcome: RequestOutcome,
  elapsedMs: number,
  reason: RequestReason
) {
  const ray = request.headers.get('CF-Ray');
  return {
    event: 'publisher_request',
    reason,
    method: request.method,
    route: ROUTE_FAMILY.exec(new URL(request.url).pathname)?.[1] ?? 'application',
    status: 'response' in outcome ? outcome.response.status : undefined,
    elapsedMs,
    sampleRate: reason === 'sample' ? SUCCESS_SAMPLE_RATE : 1,
    rayId: ray && /^[a-f\d]{16}(?:-[A-Z]{3})?$/iu.test(ray) ? ray : undefined,
    gitSha: env.GIT_SHA,
    workerVersionId: env.CF_VERSION_METADATA.id,
    ...('error' in outcome ? publisherFailureFields(outcome.error) : {}),
  };
}

function recordRequest(request: Request, env: RequestIdentity, startedAt: number, outcome: RequestOutcome): void {
  try {
    const elapsedMs = Math.max(0, Date.now() - startedAt);
    const policy = requestPolicy(outcome, elapsedMs);
    if (policy.reason === 'sample' && Math.random() >= SUCCESS_SAMPLE_RATE) {
      return;
    }
    const event = requestEvent(request, env, outcome, elapsedMs, policy.reason);
    let bounded = boundedPublisherTelemetryEvent(event);
    if (bounded.result === 'telemetry_truncated') {
      bounded = boundedPublisherTelemetryEvent({
        ...event,
        error: undefined,
        errors: undefined,
        errorsTruncated: true,
      });
    }
    console[policy.level](JSON.stringify(bounded));
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
