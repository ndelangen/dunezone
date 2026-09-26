import type { ComponentGeometry, ComponentAssetType } from '../../src/shared/asset-publishing/componentGeometry';
import { resolveComponentDeliveryResponseSchema } from '../../src/shared/asset-publishing/componentPublication';
import type { ComponentDeliveryResolution } from '../../src/shared/asset-publishing/componentPublication';
import { parseTakeWorkResponse } from '../../src/shared/asset-publishing/publication';
import type { TakeWorkResult } from '../../src/shared/asset-publishing/publication';
import { publisherErrorMessage } from '../../src/shared/asset-publishing/publisher-diagnostics';
import { resolveRulebookAnnotatedIllustrationResponseSchema } from '../../src/shared/rulebooks/annotatedIllustration';
import type {
  RulebookAnnotatedIllustrationIdentity,
  RulebookAnnotatedIllustrationResolution,
} from '../../src/shared/rulebooks/annotatedIllustration';
import type { RulebookEditionArtifactKind } from '../../src/shared/rulebooks/editionArtifacts';
import {
  resolveRulebookArtifactDeliveryResponseSchema,
  rulebookArtifactWorkOutcomeSchema,
  takeRulebookArtifactWorkResponseSchemas,
} from '../../src/shared/rulebooks/editionArtifactWork';
import type {
  AssignedRulebookArtifactJob,
  RulebookArtifactDeliveryResolution,
  RulebookArtifactRoute,
} from '../../src/shared/rulebooks/editionArtifactWork';

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

  async complete(
    jobId: string,
    cacheToken: string,
    deadlineAt?: number,
    payloadHash?: string,
    componentGeometry?: ComponentGeometry
  ): Promise<'completed' | 'missing'> {
    const body = okRecord(
      await this.postExecutor(
        'complete-job',
        {
          schemaVersion: 1,
          jobId,
          cacheToken,
          ...(payloadHash ? { payloadHash } : {}),
          ...(componentGeometry ? { componentGeometry } : {}),
        },
        deadlineAt
      )
    );
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

  async resolveRulebookAnnotatedIllustration(
    identity: RulebookAnnotatedIllustrationIdentity
  ): Promise<RulebookAnnotatedIllustrationResolution> {
    return resolveRulebookAnnotatedIllustrationResponseSchema.parse(
      await this.postExecutor('rulebook-illustration/resolve-delivery', { schemaVersion: 1, ...identity })
    );
  }

  async resolveComponentDelivery(
    assetId: string,
    assetType: ComponentAssetType = 'faction-leader'
  ): Promise<ComponentDeliveryResolution> {
    return resolveComponentDeliveryResponseSchema.parse(
      await this.postExecutor('component/resolve-delivery', { schemaVersion: 1, assetId, assetType })
    );
  }

  async takeRulebookArtifactWork<K extends RulebookEditionArtifactKind>(
    artifactKind: K,
    deadlineAt?: number
  ): Promise<AssignedRulebookArtifactJob<K>[]> {
    const response = await this.postExecutor(
      `rulebook-${artifactKind}/take-work`,
      { schemaVersion: 1 },
      deadlineAt,
      8_000_000
    );
    return takeRulebookArtifactWorkResponseSchemas[artifactKind].parse(response).items;
  }

  async completeRulebookArtifact(
    artifactKind: RulebookEditionArtifactKind,
    artifactId: string,
    deadlineAt?: number
  ): Promise<'ready' | 'failed' | 'missing'> {
    const response = await this.postExecutor(
      `rulebook-${artifactKind}/complete-work`,
      { schemaVersion: 1, artifactId },
      deadlineAt
    );
    return rulebookArtifactWorkOutcomeSchema.parse(response).status;
  }

  async failRulebookArtifact(
    artifactKind: RulebookEditionArtifactKind,
    artifactId: string,
    error: unknown,
    deadlineAt?: number
  ): Promise<'ready' | 'failed' | 'missing'> {
    const response = await this.postExecutor(
      `rulebook-${artifactKind}/fail-work`,
      { schemaVersion: 1, artifactId, error: truncatedError(error) },
      deadlineAt
    );
    return rulebookArtifactWorkOutcomeSchema.parse(response).status;
  }

  async resolveRulebookArtifactDelivery<K extends RulebookEditionArtifactKind>(
    artifactKind: K,
    route: RulebookArtifactRoute<K>
  ): Promise<RulebookArtifactDeliveryResolution> {
    const response = await this.postExecutor(`rulebook-${artifactKind}/resolve-delivery`, {
      schemaVersion: 1,
      ...route,
    });
    return resolveRulebookArtifactDeliveryResponseSchema.parse(response);
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
