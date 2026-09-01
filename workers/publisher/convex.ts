import { parseTakeWorkResponse } from '../../src/shared/asset-publishing/publication';
import type { TakeWorkResult } from '../../src/shared/asset-publishing/publication';
import { publisherErrorMessage } from '../../src/shared/asset-publishing/publisher-diagnostics';
import type { RulebookHtmlRoute, RulebookPdfRoute } from '../../src/shared/rulebooks/editionArtifacts';
import {
  resolveRulebookHtmlDeliveryResponseSchema,
  rulebookHtmlWorkOutcomeSchema,
  takeRulebookHtmlWorkResponseSchema,
} from '../../src/shared/rulebooks/htmlPublication';
import type {
  AssignedRulebookHtmlJob,
  RulebookHtmlDeliveryResolution,
} from '../../src/shared/rulebooks/htmlPublication';
import {
  resolveRulebookPdfDeliveryResponseSchema,
  rulebookPdfWorkOutcomeSchema,
  takeRulebookPdfWorkResponseSchema,
} from '../../src/shared/rulebooks/pdfPublication';
import type { AssignedRulebookPdfJob, RulebookPdfDeliveryResolution } from '../../src/shared/rulebooks/pdfPublication';

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

  async takeRulebookHtmlWork(deadlineAt?: number): Promise<AssignedRulebookHtmlJob[]> {
    const response = await this.postExecutor('rulebook-html/take-work', { schemaVersion: 1 }, deadlineAt, 8_000_000);
    return takeRulebookHtmlWorkResponseSchema.parse(response).items;
  }

  async completeRulebookHtml(artifactId: string, deadlineAt?: number): Promise<'ready' | 'failed' | 'missing'> {
    const response = await this.postExecutor(
      'rulebook-html/complete-work',
      { schemaVersion: 1, artifactId },
      deadlineAt
    );
    return rulebookHtmlWorkOutcomeSchema.parse(response).status;
  }

  async failRulebookHtml(
    artifactId: string,
    error: unknown,
    deadlineAt?: number
  ): Promise<'ready' | 'failed' | 'missing'> {
    const response = await this.postExecutor(
      'rulebook-html/fail-work',
      { schemaVersion: 1, artifactId, error: truncatedError(error) },
      deadlineAt
    );
    return rulebookHtmlWorkOutcomeSchema.parse(response).status;
  }

  async resolveRulebookHtmlDelivery(route: RulebookHtmlRoute): Promise<RulebookHtmlDeliveryResolution> {
    const response = await this.postExecutor('rulebook-html/resolve-delivery', {
      schemaVersion: 1,
      ...route,
    });
    return resolveRulebookHtmlDeliveryResponseSchema.parse(response);
  }

  async takeRulebookPdfWork(deadlineAt?: number): Promise<AssignedRulebookPdfJob[]> {
    const response = await this.postExecutor('rulebook-pdf/take-work', { schemaVersion: 1 }, deadlineAt, 8_000_000);
    return takeRulebookPdfWorkResponseSchema.parse(response).items;
  }

  async completeRulebookPdf(artifactId: string, deadlineAt?: number): Promise<'ready' | 'failed' | 'missing'> {
    const response = await this.postExecutor(
      'rulebook-pdf/complete-work',
      { schemaVersion: 1, artifactId },
      deadlineAt
    );
    return rulebookPdfWorkOutcomeSchema.parse(response).status;
  }

  async failRulebookPdf(
    artifactId: string,
    error: unknown,
    deadlineAt?: number
  ): Promise<'ready' | 'failed' | 'missing'> {
    const response = await this.postExecutor(
      'rulebook-pdf/fail-work',
      { schemaVersion: 1, artifactId, error: truncatedError(error) },
      deadlineAt
    );
    return rulebookPdfWorkOutcomeSchema.parse(response).status;
  }

  async resolveRulebookPdfDelivery(route: RulebookPdfRoute): Promise<RulebookPdfDeliveryResolution> {
    const response = await this.postExecutor('rulebook-pdf/resolve-delivery', {
      schemaVersion: 1,
      ...route,
    });
    return resolveRulebookPdfDeliveryResponseSchema.parse(response);
  }

  private async postExecutor(
    operation: string,
    body: unknown,
    deadlineAt?: number,
    maximumResponseBytes?: number
  ): Promise<unknown> {
    return await postJson(`${this.options.executorBaseUrl}/${operation}`, this.options.executorToken, body, {
      deadlineAt,
      fetcher: this.options.fetcher,
      maximumResponseBytes,
      now: this.options.now,
    });
  }
}
