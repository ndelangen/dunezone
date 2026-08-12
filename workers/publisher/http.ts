import { publisherErrorMessage } from '../../src/shared/asset-publishing/publisher-diagnostics';

const DEFAULT_MAX_JSON_BYTES = 1_000_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export class PublisherHttpError extends Error {
  constructor(
    message: string,
    readonly transient: boolean,
    readonly status?: number
  ) {
    super(publisherErrorMessage(message));
  }
}

function abortError(signal: AbortSignal): PublisherHttpError {
  const detail =
    signal.reason === undefined ? 'deadline exhausted' : publisherErrorMessage(signal.reason);
  return new PublisherHttpError(`Publisher request aborted: ${detail}`, true);
}

async function withAbort<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return await operation;
  }
  if (signal.aborted) {
    throw abortError(signal);
  }
  return await new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError(signal));
    signal.addEventListener('abort', onAbort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
}

async function boundedBytes(
  response: Response,
  maximum: number,
  signal?: AbortSignal
): Promise<Uint8Array> {
  const declared = response.headers.get('Content-Length');
  if (declared && /^\d+$/.test(declared) && Number(declared) > maximum) {
    throw new PublisherHttpError('Publisher response exceeded its size limit', false);
  }
  const reader = response.body?.getReader();
  if (!reader) {
    return new Uint8Array();
  }
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await withAbort(reader.read(), signal);
      if (done) {
        break;
      }
      length += value.byteLength;
      if (length > maximum) {
        void reader.cancel('Publisher response exceeded its size limit').catch(() => undefined);
        throw new PublisherHttpError('Publisher response exceeded its size limit', false);
      }
      chunks.push(value);
    }
  } catch (error) {
    void reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readBoundedJson(
  response: Response,
  maximum = DEFAULT_MAX_JSON_BYTES,
  signal?: AbortSignal
): Promise<unknown> {
  const bytes = await boundedBytes(response, maximum, signal);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new PublisherHttpError('Publisher response was not valid JSON', false, response.status);
  }
}

export type PublisherRequestOptions = {
  deadlineAt?: number;
  fetcher?: typeof fetch;
  now?: () => number;
};

function deadlineRemaining(deadlineAt: number, now: () => number): number {
  const value = deadlineAt - now();
  if (!Number.isFinite(deadlineAt) || value <= 0) {
    throw new PublisherHttpError('Publisher request deadline is already exhausted', true);
  }
  return value;
}

export async function runWithDeadline<T>(
  deadlineAt: number,
  operation: (signal: AbortSignal) => Promise<T>,
  now: () => number = Date.now
): Promise<T> {
  const remaining = deadlineRemaining(deadlineAt, now);
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error('absolute request deadline exhausted')),
    remaining
  );
  try {
    return await withAbort(operation(controller.signal), controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

export async function postJson(
  url: string,
  token: string,
  body: unknown,
  options: PublisherRequestOptions = {}
): Promise<unknown> {
  const now = options.now ?? Date.now;
  const deadlineAt = options.deadlineAt ?? now() + DEFAULT_REQUEST_TIMEOUT_MS;
  const remaining = deadlineRemaining(deadlineAt, now);
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error('absolute request deadline exhausted')),
    remaining
  );
  let response: Response;
  try {
    response = await withAbort(
      (options.fetcher ?? fetch)(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      }),
      controller.signal
    );
    deadlineRemaining(deadlineAt, now);
    if (!response.ok) {
      try {
        await readBoundedJson(response, 16_384, controller.signal);
      } catch {
        // Status controls retry classification; error bodies are diagnostic only.
      }
      throw new PublisherHttpError(
        `Publisher request returned HTTP ${response.status}`,
        response.status === 408 || response.status === 429 || response.status >= 500,
        response.status
      );
    }
    return await readBoundedJson(response, DEFAULT_MAX_JSON_BYTES, controller.signal);
  } catch (error) {
    if (error instanceof PublisherHttpError) {
      throw error;
    }
    throw new PublisherHttpError(`Publisher request failed: ${publisherErrorMessage(error)}`, true);
  } finally {
    clearTimeout(timeout);
  }
}
