import { describeError } from './retry-transient';

type JsonObject = Record<string, unknown>;

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function object(value: unknown, name: string): JsonObject {
  invariant(value !== null && typeof value === 'object' && !Array.isArray(value), `${name} must be an object`);
  return value as JsonObject;
}

function requiredEnvironment(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name];
  invariant(typeof value === 'string' && value.trim().length > 0, `${name} is required`);
  return value;
}

function jsonArray(value: unknown, name: string): unknown[] {
  invariant(Array.isArray(value), `${name} must be an array`);
  return value;
}

class CloudflareApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'CloudflareApiError';
  }
}

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/** One authenticated GET of the control plane; a transport failure carries status 0. */
async function cloudflareApiResult(url: string, apiToken: string, fetcher: Fetcher): Promise<unknown> {
  const pathname = new URL(url).pathname;
  let response: Response;
  try {
    response = await fetcher(url, {
      headers: { Authorization: `Bearer ${apiToken}`, Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new CloudflareApiError(`Cloudflare API request failed for ${pathname}: ${describeError(error)}`, 0, {
      cause: error,
    });
  }
  const payload: unknown = await response.json().catch(() => undefined);
  const body =
    payload !== null && typeof payload === 'object' && !Array.isArray(payload) ? (payload as JsonObject) : undefined;
  if (body === undefined || response.status !== 200 || body.success !== true) {
    throw new CloudflareApiError(
      `Cloudflare API request failed for ${pathname} (HTTP ${response.status}): ${
        body === undefined ? 'unreadable body' : JSON.stringify(body.errors ?? [])
      }`,
      response.status
    );
  }
  return body.result;
}

/*
 * A read is transient when the transport failed or the API answered 429 or 5xx; a 4xx is the
 * credentials or the request, and a malformed answer is a contract change, so both refuse at once.
 */
function isTransientApiFailure(error: unknown): boolean {
  return error instanceof CloudflareApiError && (error.status === 0 || error.status === 429 || error.status >= 500);
}

type ActiveDeployment = { versionId: string; tag: string | undefined; listed: boolean };

/** One read of the control plane: the version the first deployment serves, and the tag the versions list gives it. */
async function readActiveDeployment(scriptApi: string, apiToken: string, fetcher: Fetcher): Promise<ActiveDeployment> {
  const deploymentsResult = object(
    await cloudflareApiResult(`${scriptApi}/deployments`, apiToken, fetcher),
    'deployments result'
  );
  /* Documented ordering: the first deployment is the latest actively serving traffic. */
  const deployments = jsonArray(deploymentsResult.deployments, 'deployments');
  invariant(deployments.length > 0, 'No deployments exist for the Worker');
  const active = object(deployments[0], 'active deployment');
  const activeVersions = jsonArray(active.versions, 'active deployment versions');
  invariant(activeVersions.length === 1, 'Active deployment must serve exactly one version');
  const activeVersion = object(activeVersions[0], 'active deployment version');
  invariant(activeVersion.percentage === 100, 'Active version must serve 100% of traffic');
  const versionId = activeVersion.version_id;
  invariant(typeof versionId === 'string' && versionId.length > 0, 'Active version id is missing');

  /*
   * The versions list result shape is under-documented (bare array vs {items});
   * both are accepted, each fully validated. Newest-first and unpaginated for
   * our volume; the active version is expected on the first page.
   */
  const versionsResult = await cloudflareApiResult(`${scriptApi}/versions`, apiToken, fetcher);
  const versionItems = Array.isArray(versionsResult)
    ? versionsResult
    : jsonArray(object(versionsResult, 'versions result').items, 'version items');
  const activeItem = versionItems.map((item) => object(item, 'version item')).find((item) => item.id === versionId);
  if (!activeItem) {
    return { versionId, tag: undefined, listed: false };
  }
  const tag = object(activeItem.annotations ?? {}, 'version annotations')['workers/tag'];
  invariant(tag === undefined || typeof tag === 'string', 'Active version workers/tag annotation is malformed');
  return { versionId, tag, listed: true };
}

type Observation = { versionId: string } | { waitingOn: string };

async function observeActiveDeployment(
  scriptApi: string,
  apiToken: string,
  fetcher: Fetcher,
  githubSha: string
): Promise<Observation> {
  let active: ActiveDeployment;
  try {
    active = await readActiveDeployment(scriptApi, apiToken, fetcher);
  } catch (error) {
    if (isTransientApiFailure(error)) {
      return { waitingOn: describeError(error) };
    }
    throw error;
  }
  if (active.tag === githubSha) {
    return { versionId: active.versionId };
  }
  return {
    waitingOn: active.listed
      ? `tag ${active.tag ?? '(unset)'} (version ${active.versionId})`
      : `version ${active.versionId} not yet in the versions list`,
  };
}

export const ACTIVE_DEPLOYMENT_DEADLINE_MS = 20 * 60_000;
export const ACTIVE_DEPLOYMENT_INTERVAL_MS = 10_000;

export type ControlPlaneDependencies = {
  fetcher?: Fetcher;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  log?: (line: string) => void;
};

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/*
 * The authoritative deploy gate: Cloudflare's control plane must report the version tagged with
 * GITHUB_SHA as the active deployment.
 * Edge propagation is Cloudflare's promise and is deliberately not gated on (#330).
 * The list is read again every ACTIVE_DEPLOYMENT_INTERVAL_MS until it reports the tag or
 * ACTIVE_DEPLOYMENT_DEADLINE_MS passes.
 * On 2026-09-03 two consecutive deploys read it once, seconds after wrangler had deployed, saw the
 * previous release, and refused, and the Storybook deploy and the revision activation behind them
 * were skipped (#1054).
 * The list was fresh within two seconds on that day's other nineteen deploys and stale for at
 * least seven seconds and at most fifteen and a half minutes on those two, so the deadline covers
 * that bound.
 * Every observation is logged; a transport failure or a 429 or 5xx answer is one more observation,
 * and so is an active version without a tag, which is somebody else's deploy the list may still be
 * catching up on.
 * A 4xx or a malformed answer, a tag that is not a string among them, refuses at once.
 */
export async function assertActiveDeployment(
  workerName: string,
  githubSha: string,
  environment: NodeJS.ProcessEnv,
  dependencies: ControlPlaneDependencies = {}
): Promise<string> {
  const accountId = requiredEnvironment(environment, 'CLOUDFLARE_ACCOUNT_ID');
  const apiToken = requiredEnvironment(environment, 'CLOUDFLARE_API_TOKEN');
  const scriptApi = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${encodeURIComponent(workerName)}`;
  const fetcher = dependencies.fetcher ?? fetch;
  const sleep = dependencies.sleep ?? pause;
  const now = dependencies.now ?? Date.now;
  const log = dependencies.log ?? console.log;
  const deadline = now() + ACTIVE_DEPLOYMENT_DEADLINE_MS;
  for (;;) {
    const observed = await observeActiveDeployment(scriptApi, apiToken, fetcher, githubSha);
    if ('versionId' in observed) {
      log(`Cloudflare reports version ${observed.versionId} (tag ${githubSha}) as the active deployment.`);
      return observed.versionId;
    }
    const remainingMs = deadline - now();
    if (remainingMs <= 0) {
      throw new Error(
        `Active deployment did not become GITHUB_SHA ${githubSha} within ${ACTIVE_DEPLOYMENT_DEADLINE_MS / 60_000} min; last observation: ${observed.waitingOn}`
      );
    }
    log(
      `Deployments list reports ${observed.waitingOn}; waiting for GITHUB_SHA ${githubSha}, ${Math.ceil(remainingMs / 1000)} s left`
    );
    await sleep(Math.min(ACTIVE_DEPLOYMENT_INTERVAL_MS, remainingMs));
  }
}
