import { parseTakeWorkResponse } from '../../src/shared/asset-publishing/publication';
import type { TakeWorkResult } from '../../src/shared/asset-publishing/publication';
import { publisherErrorMessage } from '../../src/shared/asset-publishing/publisher-diagnostics';

export type { AssignedPublicationJob, TakeWorkResult } from '../../src/shared/asset-publishing/publication';

type RecordValue = Record<string, unknown>;

function okRecord(value: unknown): RecordValue {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || (value as RecordValue).ok !== true) {
    throw new Error('Convex Publication response is invalid');
  }
  return value as RecordValue;
}
import { postJson } from './http';

function truncatedError(error: unknown): string {
  return publisherErrorMessage(error).slice(0, 2000);
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
    return parseTakeWorkResponse(await this.postExecutor('take-work', { schemaVersion: 1 }, deadlineAt));
  }

  async complete(jobId: string, cacheToken: string, deadlineAt?: number): Promise<'completed' | 'missing'> {
    const body = okRecord(await this.postExecutor('complete-job', { schemaVersion: 1, jobId, cacheToken }, deadlineAt));
    if (body.status !== 'completed' && body.status !== 'missing') {
      throw new Error('Convex complete-job response is invalid');
    }
    return body.status;
  }

  async fail(jobId: string, error: unknown, deadlineAt?: number): Promise<'pending' | 'error' | 'missing'> {
    const body = okRecord(
      await this.postExecutor('fail-job', { schemaVersion: 1, jobId, error: truncatedError(error) }, deadlineAt)
    );
    if (body.status !== 'pending' && body.status !== 'error' && body.status !== 'missing') {
      throw new Error('Convex fail-job response is invalid');
    }
    return body.status;
  }

  private async postExecutor(operation: string, body: unknown, deadlineAt?: number): Promise<unknown> {
    return await postJson(`${this.options.executorBaseUrl}/${operation}`, this.options.executorToken, body, {
      deadlineAt,
      fetcher: this.options.fetcher,
      now: this.options.now,
    });
  }
}
