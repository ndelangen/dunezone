const ABSOLUTE_URL = /https?:\/\/(?:[^\s"'`<>\])}]|<redacted>)+/giu;
const NETWORK_PATH_URL = /(^|[^\p{L}\p{N}\p{M}_./:-])(\/\/(?:[^\s"'`<>\])}]|<redacted>)+)/giu;
const ROOT_RELATIVE_URL = /(^|[\s([{:])\/(?!\/)[^\s"'<>]+/gu;
const DIAGNOSTIC_BASE_URL = 'https://publisher.invalid';
const REDACTED_SUFFIX = /(?:<redacted>)+$/u;

export function redactPublisherResource(value: string, base?: string): string {
  try {
    const resource = new URL(value, base);
    if (resource.protocol !== 'http:' && resource.protocol !== 'https:') {
      return '<redacted-resource>';
    }
    return `${resource.origin}/<redacted>`;
  } catch {
    return '<redacted-resource>';
  }
}

function redactAbsoluteResource(value: string): string {
  const normalized = value.replace(REDACTED_SUFFIX, '<redacted>');
  const redacted = redactPublisherResource(normalized);
  return redacted === normalized ? normalized : redacted;
}

export function sanitizePublisherDiagnostic(value: string): string {
  return value
    .replace(ABSOLUTE_URL, (url) => redactAbsoluteResource(url))
    .replace(NETWORK_PATH_URL, (_match, prefix: string, url: string) => {
      return `${prefix}${redactPublisherResource(url, DIAGNOSTIC_BASE_URL)}`;
    })
    .replace(ROOT_RELATIVE_URL, (_url, prefix: string) => `${prefix}/<redacted>`);
}

export function publisherErrorMessage(error: unknown): string {
  return sanitizePublisherDiagnostic(error instanceof Error ? error.message : String(error));
}

export type PublisherErrorDetail = {
  name: string;
  message: string;
  stack?: string;
};

const MAX_ERROR_DETAILS = 6;
const MAX_ERROR_DETAIL_DEPTH = 6;
const MAX_ERROR_MESSAGE_LENGTH = 1_024;
const MAX_ERROR_STACK_LENGTH = 1_500;

/**
 * Flattens Error.cause and AggregateError.errors without allowing publisher secrets or an
 * unbounded exception graph into telemetry.
 */
export function publisherErrorDetails(error: unknown): PublisherErrorDetail[] {
  const details: PublisherErrorDetail[] = [];
  const visited = new Set<unknown>();

  function visit(value: unknown, depth: number): void {
    if (
      details.length >= MAX_ERROR_DETAILS ||
      depth >= MAX_ERROR_DETAIL_DEPTH ||
      visited.has(value)
    ) {
      return;
    }
    visited.add(value);

    const current = value instanceof Error ? value : new Error(String(value));
    const stack = current.stack
      ? sanitizePublisherDiagnostic(current.stack).slice(0, MAX_ERROR_STACK_LENGTH)
      : undefined;
    details.push({
      name: sanitizePublisherDiagnostic(current.name).slice(0, 128),
      message: publisherErrorMessage(current).slice(0, MAX_ERROR_MESSAGE_LENGTH),
      ...(stack ? { stack } : {}),
    });

    if (value instanceof AggregateError) {
      for (const nested of value.errors) visit(nested, depth + 1);
    }
    if (value instanceof Error && value.cause !== undefined) visit(value.cause, depth + 1);
  }

  visit(error, 0);
  return details;
}

export function serializePublisherLogEvent(event: Record<string, unknown>): string {
  return JSON.stringify(event, (_key, value: unknown) => {
    if (value instanceof Error) return publisherErrorMessage(value);
    return typeof value === 'string' ? sanitizePublisherDiagnostic(value) : value;
  });
}
