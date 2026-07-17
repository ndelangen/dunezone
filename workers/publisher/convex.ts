import { publisherErrorMessage } from '../../src/app/capture/publisher-diagnostics';
import type { PublisherWakeUp } from './dispatch';
import { postJson } from './http';
import { isRenderCapability } from './render-capability';

export type AcquireResult =
  | { status: 'empty'; reason: 'disabled' | 'no_eligible_work' | 'browser_quota' }
  | { status: 'busy'; leaseExpiresAt?: number; reason?: 'browser_reservation' }
  | {
      status: 'acquired';
      replay: boolean;
      batchToken: string;
      leaseExpiresAt: number;
      browserReservationMs: number;
      dailyBrowserMs: number;
    };

export type ExactClaim = {
  targetId: string;
  batchToken: string;
  claimToken: string;
  generation: number;
  rendererVersion: string;
};

export type ClaimedTarget = ExactClaim & {
  status: 'claimed';
  replay: boolean;
  factionId: string;
  assetType: 'faction_sheet';
  leaseExpiresAt: number;
  payloadHash: string;
  renderCapability: string;
  renderCapabilityExpiresAt: number;
  workLane?: 'foreground' | 'rollout';
};

export type ClaimResult = ClaimedTarget | { status: 'empty' | 'stale' | 'conflict' };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function positiveInteger(value: unknown): value is number {
  return finite(value) && Number.isSafeInteger(value) && value > 0;
}

function token(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 16 && value.length <= 256;
}

function okRecord(value: unknown): Record<string, unknown> {
  if (!record(value) || value.ok !== true) throw new Error('Convex publisher response is invalid');
  return value;
}

export function parsePoll(value: unknown, wakeUp: PublisherWakeUp): 'empty' | 'eligible' {
  const body = okRecord(value);
  if (
    (body.eligibility !== 'empty' && body.eligibility !== 'eligible') ||
    body.schemaVersion !== wakeUp.schemaVersion ||
    body.scheduledCutoff !== wakeUp.scheduledCutoff ||
    body.triggerId !== wakeUp.triggerId
  ) {
    throw new Error('Convex poll response is invalid or mismatched');
  }
  return body.eligibility;
}

export function parseAcquire(value: unknown): AcquireResult {
  const body = okRecord(value);
  if (body.schemaVersion !== 1) throw new Error('Convex acquire response schema is invalid');
  if (body.status === 'empty') {
    if (
      body.reason !== 'disabled' &&
      body.reason !== 'no_eligible_work' &&
      body.reason !== 'browser_quota'
    ) {
      throw new Error('Convex empty acquisition reason is invalid');
    }
    return { status: 'empty', reason: body.reason };
  }
  if (body.status === 'busy') {
    if (body.leaseExpiresAt !== undefined && !finite(body.leaseExpiresAt)) {
      throw new Error('Convex busy lease is invalid');
    }
    if (body.reason !== undefined && body.reason !== 'browser_reservation') {
      throw new Error('Convex busy reason is invalid');
    }
    return {
      status: 'busy',
      ...(finite(body.leaseExpiresAt) ? { leaseExpiresAt: body.leaseExpiresAt } : {}),
      ...(body.reason === 'browser_reservation' ? { reason: body.reason } : {}),
    };
  }
  if (
    body.status !== 'acquired' ||
    typeof body.replay !== 'boolean' ||
    !token(body.batchToken) ||
    !finite(body.leaseExpiresAt) ||
    !positiveInteger(body.browserReservationMs) ||
    !finite(body.dailyBrowserMs)
  ) {
    throw new Error('Convex acquired batch response is invalid');
  }
  return {
    status: 'acquired',
    replay: body.replay,
    batchToken: body.batchToken,
    leaseExpiresAt: body.leaseExpiresAt,
    browserReservationMs: body.browserReservationMs,
    dailyBrowserMs: body.dailyBrowserMs,
  };
}

export function parseClaim(value: unknown): ClaimResult {
  const body = okRecord(value);
  if (body.status === 'empty' || body.status === 'stale' || body.status === 'conflict') {
    return { status: body.status };
  }
  if (
    body.status !== 'claimed' ||
    typeof body.replay !== 'boolean' ||
    typeof body.targetId !== 'string' ||
    typeof body.factionId !== 'string' ||
    body.assetType !== 'faction_sheet' ||
    !token(body.batchToken) ||
    !token(body.claimToken) ||
    !positiveInteger(body.generation) ||
    typeof body.rendererVersion !== 'string' ||
    !finite(body.leaseExpiresAt) ||
    typeof body.payloadHash !== 'string' ||
    !/^[0-9a-f]{64}$/.test(body.payloadHash) ||
    !isRenderCapability(body.renderCapability) ||
    !finite(body.renderCapabilityExpiresAt) ||
    (body.workLane !== undefined && body.workLane !== 'foreground' && body.workLane !== 'rollout')
  ) {
    throw new Error('Convex claimed target response is invalid');
  }
  return {
    status: 'claimed',
    replay: body.replay,
    targetId: body.targetId,
    factionId: body.factionId,
    assetType: 'faction_sheet',
    batchToken: body.batchToken,
    claimToken: body.claimToken,
    generation: body.generation,
    rendererVersion: body.rendererVersion,
    leaseExpiresAt: body.leaseExpiresAt,
    payloadHash: body.payloadHash,
    renderCapability: body.renderCapability,
    renderCapabilityExpiresAt: body.renderCapabilityExpiresAt,
    ...(body.workLane === 'rollout' || body.workLane === 'foreground'
      ? { workLane: body.workLane }
      : {}),
  };
}

export class ConvexPublisherClient {
  constructor(
    private readonly options: {
      pollUrl: string;
      executorBaseUrl: string;
      pollToken: string;
      executorToken: string;
      fetcher?: typeof fetch;
      now?: () => number;
    }
  ) {}

  async poll(wakeUp: PublisherWakeUp, deadlineAt?: number): Promise<'empty' | 'eligible'> {
    return parsePoll(
      await postJson(this.options.pollUrl, this.options.pollToken, wakeUp, {
        deadlineAt,
        fetcher: this.options.fetcher,
        now: this.options.now,
      }),
      wakeUp
    );
  }

  async acquire(batchToken: string, deadlineAt?: number): Promise<AcquireResult> {
    return parseAcquire(
      await this.postExecutor('acquire', { schemaVersion: 1, batchToken }, deadlineAt)
    );
  }

  async claim(batchToken: string, deadlineAt?: number): Promise<ClaimResult> {
    return parseClaim(
      await this.postExecutor('claim', { schemaVersion: 1, batchToken }, deadlineAt)
    );
  }

  async settleBrowser(
    batchToken: string,
    measuredBrowserMs: number,
    deadlineAt?: number
  ): Promise<'settled' | 'stale'> {
    const body = okRecord(
      await this.postExecutor(
        'settle-browser',
        {
          schemaVersion: 1,
          batchToken,
          measuredBrowserMs,
        },
        deadlineAt
      )
    );
    if (body.status !== 'settled' && body.status !== 'stale') {
      throw new Error('Convex browser settlement response is invalid');
    }
    return body.status;
  }

  async releaseBatch(
    batchToken: string,
    mode: 'no_browser' | 'after_settlement',
    deadlineAt?: number
  ): Promise<'released' | 'stale'> {
    const body = okRecord(
      await this.postExecutor('release-batch', { schemaVersion: 1, batchToken, mode }, deadlineAt)
    );
    if (body.status !== 'released' && body.status !== 'stale') {
      throw new Error('Convex batch release response is invalid');
    }
    return body.status;
  }

  async revalidate(
    claim: ExactClaim,
    deadlineAt?: number
  ): Promise<
    | { status: 'stale' }
    | { status: 'insufficient_lease'; leaseExpiresAt: number }
    | { status: 'storage_guard' | 'storage_limit' }
    | {
        status: 'valid';
        leaseExpiresAt: number;
        factionId: string;
        assetType: 'faction_sheet';
        payloadHash: string;
      }
  > {
    const body = okRecord(
      await this.postExecutor('revalidate', { schemaVersion: 1, ...claim }, deadlineAt)
    );
    if (body.status === 'stale') return { status: 'stale' };
    if (body.status === 'storage_guard' || body.status === 'storage_limit') {
      return { status: body.status };
    }
    if (body.status === 'insufficient_lease' && finite(body.leaseExpiresAt)) {
      return { status: 'insufficient_lease', leaseExpiresAt: body.leaseExpiresAt };
    }
    if (
      body.status !== 'valid' ||
      !finite(body.leaseExpiresAt) ||
      typeof body.factionId !== 'string' ||
      body.assetType !== 'faction_sheet' ||
      typeof body.payloadHash !== 'string' ||
      !/^[0-9a-f]{64}$/.test(body.payloadHash)
    ) {
      throw new Error('Convex revalidation response is invalid');
    }
    return {
      status: 'valid',
      leaseExpiresAt: body.leaseExpiresAt,
      factionId: body.factionId,
      assetType: 'faction_sheet',
      payloadHash: body.payloadHash,
    };
  }

  async complete(
    claim: ExactClaim,
    r2Etag: string,
    bytes: number,
    deadlineAt?: number,
    retainBatch = false
  ): Promise<'completed' | 'stale'> {
    const body = okRecord(
      await this.postExecutor(
        'complete',
        {
          schemaVersion: 1,
          ...claim,
          r2Etag,
          bytes,
          ...(retainBatch ? { retainBatch: true } : {}),
        },
        deadlineAt
      )
    );
    if (body.status !== 'completed' && body.status !== 'stale') {
      throw new Error('Convex completion response is invalid');
    }
    return body.status;
  }

  async fail(
    claim: ExactClaim,
    error: string,
    deadlineAt?: number,
    retainBatch = false
  ): Promise<'failed' | 'stale'> {
    const body = okRecord(
      await this.postExecutor(
        'fail',
        {
          schemaVersion: 1,
          ...claim,
          error: publisherErrorMessage(error).slice(0, 2_000),
          ...(retainBatch ? { retainBatch: true } : {}),
        },
        deadlineAt
      )
    );
    if (body.status !== 'failed' && body.status !== 'stale') {
      throw new Error('Convex failure response is invalid');
    }
    return body.status;
  }

  async release(
    claim: ExactClaim,
    deadlineAt?: number,
    retainBatch = false
  ): Promise<'released' | 'stale'> {
    const body = okRecord(
      await this.postExecutor(
        'release',
        { schemaVersion: 1, ...claim, ...(retainBatch ? { retainBatch: true } : {}) },
        deadlineAt
      )
    );
    if (body.status !== 'released' && body.status !== 'stale') {
      throw new Error('Convex exact release response is invalid');
    }
    return body.status;
  }

  private async postExecutor(
    operation: string,
    body: unknown,
    deadlineAt?: number
  ): Promise<unknown> {
    return await postJson(
      `${this.options.executorBaseUrl}/${operation}`,
      this.options.executorToken,
      body,
      { deadlineAt, fetcher: this.options.fetcher, now: this.options.now }
    );
  }
}
