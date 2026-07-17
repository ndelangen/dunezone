import { publisherErrorMessage } from '../../src/app/capture/publisher-diagnostics';
import { MAX_ASSIGNED_ITEMS } from './config';
import { PublisherHttpError, postJson } from './http';

export type ExactItemClaim = {
  targetId: string;
  claimToken: string;
  generation: number;
  rendererVersion: string;
};

export type AssignedItem = ExactItemClaim & {
  factionId: string;
  assetType: 'faction_sheet';
  leaseExpiresAt: number;
  workLane?: 'foreground' | 'rollout';
};
export type ClaimedTarget = AssignedItem;

export type TakeWorkResult =
  | {
      status: 'empty';
      reason: 'disabled' | 'busy' | 'no_eligible_work';
      leaseExpiresAt: number | null;
      items: [];
    }
  | {
      status: 'assigned';
      leaseExpiresAt: number;
      items: AssignedItem[];
    };

type CompleteItemResult =
  | { status: 'stale' }
  | {
      status: 'completed';
      replay: boolean;
      cacheToken: string;
      publishedAt: number;
    };

type FailItemResult =
  | { status: 'stale' }
  | { status: 'retained'; leaseExpiresAt: number }
  | { status: 'failed' | 'blocked'; consecutiveFailures: number };

type RecordValue = Record<string, unknown>;

function record(value: unknown): value is RecordValue {
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

function okRecord(value: unknown): RecordValue {
  if (!record(value) || value.ok !== true) throw new Error('Convex publisher response is invalid');
  return value;
}

function parseAssignedItem(value: unknown): AssignedItem {
  if (
    !record(value) ||
    typeof value.targetId !== 'string' ||
    typeof value.factionId !== 'string' ||
    value.assetType !== 'faction_sheet' ||
    !token(value.claimToken) ||
    !positiveInteger(value.generation) ||
    typeof value.rendererVersion !== 'string' ||
    !finite(value.leaseExpiresAt) ||
    (value.workLane !== undefined &&
      value.workLane !== 'foreground' &&
      value.workLane !== 'rollout')
  ) {
    throw new Error('Convex assigned item response is invalid');
  }
  return {
    targetId: value.targetId,
    factionId: value.factionId,
    assetType: 'faction_sheet',
    claimToken: value.claimToken,
    generation: value.generation,
    rendererVersion: value.rendererVersion,
    leaseExpiresAt: value.leaseExpiresAt,
    ...(value.workLane === 'foreground' || value.workLane === 'rollout'
      ? { workLane: value.workLane }
      : {}),
  };
}

export function parseTakeWork(value: unknown): TakeWorkResult {
  const body = okRecord(value);
  if (body.schemaVersion !== 1) throw new Error('Convex take-work response schema is invalid');
  if (body.status === 'empty') {
    if (
      body.reason !== 'disabled' &&
      body.reason !== 'busy' &&
      body.reason !== 'no_eligible_work'
    ) {
      throw new Error('Convex empty take-work reason is invalid');
    }
    if (
      body.leaseExpiresAt !== null &&
      body.leaseExpiresAt !== undefined &&
      !finite(body.leaseExpiresAt)
    ) {
      throw new Error('Convex busy lease is invalid');
    }
    if (!Array.isArray(body.items) || body.items.length !== 0) {
      throw new Error('Convex empty take-work items are invalid');
    }
    return {
      status: 'empty',
      reason: body.reason,
      leaseExpiresAt: finite(body.leaseExpiresAt) ? body.leaseExpiresAt : null,
      items: [],
    };
  }
  if (
    !finite(body.leaseExpiresAt) ||
    body.status !== 'assigned' ||
    !Array.isArray(body.items) ||
    body.items.length < 1 ||
    body.items.length > MAX_ASSIGNED_ITEMS
  ) {
    throw new Error('Convex assigned take-work response is invalid');
  }
  const items = body.items.map(parseAssignedItem);
  if (
    items.some((item) => item.leaseExpiresAt !== body.leaseExpiresAt) ||
    new Set(items.map((item) => item.targetId)).size !== items.length ||
    new Set(items.map((item) => item.claimToken)).size !== items.length
  ) {
    throw new Error('Convex assigned item ownership is invalid');
  }
  return {
    status: 'assigned',
    leaseExpiresAt: body.leaseExpiresAt,
    items,
  };
}

export function parseRevalidateItem(value: unknown):
  | { status: 'stale' }
  | {
      status: 'valid';
      leaseExpiresAt: number;
      factionId: string;
      assetType: 'faction_sheet';
    } {
  const body = okRecord(value);
  if (body.status === 'stale') return { status: 'stale' };
  if (
    body.status !== 'valid' ||
    !finite(body.leaseExpiresAt) ||
    typeof body.factionId !== 'string' ||
    body.assetType !== 'faction_sheet'
  ) {
    throw new Error('Convex revalidate-item response is invalid');
  }
  return {
    status: 'valid',
    leaseExpiresAt: body.leaseExpiresAt,
    factionId: body.factionId,
    assetType: 'faction_sheet',
  };
}

function parseCompleteItem(value: unknown): CompleteItemResult {
  const body = okRecord(value);
  if (body.status === 'stale') return { status: 'stale' };
  if (
    body.status !== 'completed' ||
    typeof body.replay !== 'boolean' ||
    typeof body.cacheToken !== 'string' ||
    !finite(body.publishedAt)
  ) {
    throw new Error('Convex complete-item response is invalid');
  }
  return {
    status: 'completed',
    replay: body.replay,
    cacheToken: body.cacheToken,
    publishedAt: body.publishedAt,
  };
}

function parseFailItem(value: unknown): FailItemResult {
  const body = okRecord(value);
  if (body.status === 'stale') return { status: 'stale' };
  if (body.status === 'retained' && finite(body.leaseExpiresAt)) {
    return { status: 'retained', leaseExpiresAt: body.leaseExpiresAt };
  }
  if (
    (body.status === 'failed' || body.status === 'blocked') &&
    positiveInteger(body.consecutiveFailures)
  ) {
    return {
      status: body.status,
      consecutiveFailures: body.consecutiveFailures,
    };
  }
  throw new Error('Convex fail-item response is invalid');
}

export type PublicationMetadata = {
  r2Etag: string;
  bytes: number;
  cacheToken: string;
};

function truncatedError(error: unknown): string {
  return publisherErrorMessage(error).slice(0, 2_000);
}

export class ConvexPublisherClient {
  constructor(
    private readonly options: {
      executorBaseUrl: string;
      executorToken: string;
      fetcher?: typeof fetch;
      now?: () => number;
    }
  ) {}

  async takeWork(deadlineAt?: number): Promise<TakeWorkResult> {
    return parseTakeWork(await this.postExecutor('take-work', { schemaVersion: 1 }, deadlineAt));
  }

  async revalidateItem(
    claim: ExactItemClaim,
    deadlineAt?: number
  ): Promise<ReturnType<typeof parseRevalidateItem>> {
    return parseRevalidateItem(
      await this.postExecutor('revalidate-item', { schemaVersion: 1, ...claim }, deadlineAt)
    );
  }

  async revalidate(
    claim: ExactItemClaim,
    deadlineAt?: number
  ): Promise<ReturnType<typeof parseRevalidateItem>> {
    return await this.revalidateItem(claim, deadlineAt);
  }

  async completeItem(
    claim: ExactItemClaim,
    r2Etag: string,
    bytes: number,
    cacheToken: string,
    deadlineAt?: number
  ): Promise<CompleteItemResult> {
    return parseCompleteItem(
      await this.postExecutor(
        'complete-item',
        { schemaVersion: 1, ...claim, r2Etag, bytes, cacheToken },
        deadlineAt
      )
    );
  }

  async complete(
    claim: ExactItemClaim,
    publication: PublicationMetadata,
    deadlineAt?: number
  ): Promise<'completed' | 'stale'> {
    const result = await this.completeItem(
      claim,
      publication.r2Etag,
      publication.bytes,
      publication.cacheToken,
      deadlineAt
    );
    if (result.status === 'completed' && result.cacheToken !== publication.cacheToken) {
      throw new Error('Convex completed item with a different cache token');
    }
    return result.status;
  }

  async failItem(
    claim: ExactItemClaim,
    attribution: 'target' | 'infrastructure',
    error: unknown,
    deadlineAt?: number
  ): Promise<FailItemResult> {
    return parseFailItem(
      await this.postExecutor(
        'fail-item',
        { schemaVersion: 1, ...claim, attribution, error: truncatedError(error) },
        deadlineAt
      )
    );
  }

  async fail(
    claim: ExactItemClaim,
    attribution: 'target' | 'infrastructure',
    error: unknown,
    deadlineAt?: number
  ): Promise<FailItemResult['status']> {
    const result = await this.failItem(claim, attribution, error, deadlineAt);
    return result.status;
  }

  isRetryable(error: unknown): boolean {
    return error instanceof PublisherHttpError && error.transient;
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
