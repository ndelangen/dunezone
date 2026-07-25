import { publisherErrorMessage } from '../../src/app/capture/publisher-diagnostics';
import { PUBLICATION_MAX_PICKUP } from '../../src/shared/asset-publishing/publication';
import { postJson } from './http';

export type AssignedPublicationJob = {
  jobId: string;
  assetType: 'faction_sheet';
  assetId: string;
  expiresAt: number;
};

export type TakeWorkResult =
  | {
      status: 'empty';
      reason: 'disabled' | 'no_pending_work';
      recovered: number;
      items: [];
    }
  | {
      status: 'assigned';
      recovered: number;
      items: AssignedPublicationJob[];
    };

type RecordValue = Record<string, unknown>;

function record(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function okRecord(value: unknown): RecordValue {
  if (!record(value) || value.ok !== true)
    throw new Error('Convex Publication response is invalid');
  return value;
}

function parseAssignedJob(value: unknown): AssignedPublicationJob {
  if (
    !record(value) ||
    typeof value.jobId !== 'string' ||
    value.assetType !== 'faction_sheet' ||
    typeof value.assetId !== 'string' ||
    !finite(value.expiresAt)
  ) {
    throw new Error('Convex assigned Publication job is invalid');
  }
  return {
    jobId: value.jobId,
    assetType: 'faction_sheet',
    assetId: value.assetId,
    expiresAt: value.expiresAt,
  };
}

export function parseTakeWork(value: unknown): TakeWorkResult {
  const body = okRecord(value);
  if (body.schemaVersion !== 1 || !finite(body.recovered) || !Array.isArray(body.items)) {
    throw new Error('Convex take-work response is invalid');
  }
  if (body.status === 'empty') {
    if (
      (body.reason !== 'disabled' && body.reason !== 'no_pending_work') ||
      body.items.length !== 0
    ) {
      throw new Error('Convex empty take-work response is invalid');
    }
    return {
      status: 'empty',
      reason: body.reason,
      recovered: body.recovered,
      items: [],
    };
  }
  if (
    body.status !== 'assigned' ||
    body.items.length < 1 ||
    body.items.length > PUBLICATION_MAX_PICKUP
  ) {
    throw new Error('Convex assigned take-work response is invalid');
  }
  return {
    status: 'assigned',
    recovered: body.recovered,
    items: body.items.map(parseAssignedJob),
  };
}

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

  async complete(
    jobId: string,
    cacheToken: string,
    deadlineAt?: number
  ): Promise<'completed' | 'missing'> {
    const body = okRecord(
      await this.postExecutor('complete-job', { schemaVersion: 1, jobId, cacheToken }, deadlineAt)
    );
    if (body.status !== 'completed' && body.status !== 'missing') {
      throw new Error('Convex complete-job response is invalid');
    }
    return body.status;
  }

  async fail(
    jobId: string,
    error: unknown,
    deadlineAt?: number
  ): Promise<'pending' | 'error' | 'missing'> {
    const body = okRecord(
      await this.postExecutor(
        'fail-job',
        { schemaVersion: 1, jobId, error: truncatedError(error) },
        deadlineAt
      )
    );
    if (body.status !== 'pending' && body.status !== 'error' && body.status !== 'missing') {
      throw new Error('Convex fail-job response is invalid');
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
