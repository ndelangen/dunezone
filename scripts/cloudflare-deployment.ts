import { z } from 'zod';

import { describeError } from './retry-transient';

const jsonObject = z.record(z.string(), z.unknown());
type JsonObject = z.infer<typeof jsonObject>;
const requiredValue = z.string().regex(/\S/u, 'Value is required');
const controlPlaneEnvironment = z.object({
  CLOUDFLARE_ACCOUNT_ID: requiredValue,
  CLOUDFLARE_API_TOKEN: requiredValue,
});
const deploymentsResponse = z.object({
  deployments: z.array(z.unknown()).min(1, 'No deployments exist for the Worker'),
});
const activeDeployment = z.object({
  versions: z.tuple([
    z.object({
      version_id: z.string().min(1, 'Active version id is missing'),
      percentage: z.literal(100),
    }),
  ]),
});
const versionsResponse = z.union([z.array(jsonObject), z.object({ items: z.array(jsonObject) })]);

class CloudflareApiError extends Error {
  readonly status: number;

  constructor(failure: { message: string; status: number; cause?: unknown }) {
    super(failure.message, { cause: failure.cause });
    this.status = failure.status;
    this.name = 'CloudflareApiError';
  }
}

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type ControlPlane = { scriptApi: URL; apiToken: string; fetcher: Fetcher };
type DeploymentTarget = { workerName: string; gitSha: string };

async function responseBody(response: Response): Promise<JsonObject | undefined> {
  const payload: unknown = await response.json().catch(() => undefined);
  const parsed = jsonObject.safeParse(payload);
  return parsed.success ? parsed.data : undefined;
}

/** One authenticated GET of the control plane; a transport failure carries status 0. */
async function requestControlPlane(url: URL, plane: ControlPlane): Promise<Response> {
  try {
    return await plane.fetcher(url, {
      headers: { Authorization: `Bearer ${plane.apiToken}`, Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new CloudflareApiError({
      message: `Cloudflare API request failed for ${url.pathname}: ${describeError(error)}`,
      status: 0,
      cause: error,
    });
  }
}

async function cloudflareApiResult(url: URL, plane: ControlPlane): Promise<unknown> {
  const response = await requestControlPlane(url, plane);
  const body = await responseBody(response);
  const successful = response.status === 200 && body?.success === true;
  if (!successful) {
    throw new CloudflareApiError({
      message: `Cloudflare API request failed for ${url.pathname} (HTTP ${response.status}): ${
        body === undefined ? 'unreadable body' : JSON.stringify(body.errors ?? [])
      }`,
      status: response.status,
    });
  }
  return body!.result;
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
async function readActiveDeployment(plane: ControlPlane): Promise<ActiveDeployment> {
  const result = deploymentsResponse.parse(await cloudflareApiResult(new URL('deployments', plane.scriptApi), plane));
  /* Documented ordering: the first deployment is the latest actively serving traffic. */
  const active = activeDeployment.parse(result.deployments[0]);
  const versionId = active.versions[0].version_id;

  /*
   * The versions list result shape is under-documented (bare array vs {items});
   * both are accepted, each fully validated. Newest-first and unpaginated for
   * our volume; the active version is expected on the first page.
   */
  const versions = versionsResponse.parse(await cloudflareApiResult(new URL('versions', plane.scriptApi), plane));
  const versionItems = Array.isArray(versions) ? versions : versions.items;
  const activeItem = versionItems.find((item) => item.id === versionId);
  if (!activeItem) {
    return { versionId, tag: undefined, listed: false };
  }
  const tag = z
    .string()
    .optional()
    .safeParse(jsonObject.parse(activeItem.annotations ?? {})['workers/tag']);
  if (!tag.success) {
    throw new Error('Active version workers/tag annotation is malformed');
  }
  return { versionId, tag: tag.data, listed: true };
}

type Observation = { versionId: string } | { waitingOn: string };

function describeActiveDeployment(active: ActiveDeployment): string {
  if (!active.listed) {
    return `version ${active.versionId} not yet in the versions list`;
  }
  return `tag ${active.tag ?? '(unset)'} (version ${active.versionId})`;
}

async function observeActiveDeployment(plane: ControlPlane, target: DeploymentTarget): Promise<Observation> {
  let active: ActiveDeployment;
  try {
    active = await readActiveDeployment(plane);
  } catch (error) {
    if (isTransientApiFailure(error)) {
      return { waitingOn: describeError(error) };
    }
    throw error;
  }
  if (active.tag === target.gitSha) {
    return { versionId: active.versionId };
  }
  return { waitingOn: describeActiveDeployment(active) };
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
  target: DeploymentTarget,
  environment: NodeJS.ProcessEnv,
  dependencies: ControlPlaneDependencies = {}
): Promise<string> {
  const { workerName, gitSha: githubSha } = target;
  const { CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: apiToken } =
    controlPlaneEnvironment.parse(environment);
  const plane = {
    scriptApi: new URL(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${encodeURIComponent(workerName)}/`
    ),
    apiToken,
    fetcher: dependencies.fetcher ?? fetch,
  };
  const sleep = dependencies.sleep ?? pause;
  const now = dependencies.now ?? Date.now;
  const log = dependencies.log ?? console.log;
  const deadline = now() + ACTIVE_DEPLOYMENT_DEADLINE_MS;
  for (;;) {
    const observed = await observeActiveDeployment(plane, target);
    if ('versionId' in observed) {
      log(JSON.stringify({ event: 'cloudflare_active_deployment', versionId: observed.versionId, gitSha: githubSha }));
      return observed.versionId;
    }
    const remainingMs = deadline - now();
    if (remainingMs <= 0) {
      throw new Error(
        `Active deployment did not become GITHUB_SHA ${githubSha} within ${ACTIVE_DEPLOYMENT_DEADLINE_MS / 60_000} min; last observation: ${observed.waitingOn}`
      );
    }
    log(
      JSON.stringify({
        event: 'cloudflare_deployment_pending',
        observation: observed.waitingOn,
        gitSha: githubSha,
        secondsLeft: Math.ceil(remainingMs / 1000),
      })
    );
    await sleep(Math.min(ACTIVE_DEPLOYMENT_INTERVAL_MS, remainingMs));
  }
}
