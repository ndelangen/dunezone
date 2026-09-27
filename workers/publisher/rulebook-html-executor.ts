import type { AssignedRulebookArtifactJob } from '../../src/shared/rulebooks/editionArtifactWork';
import type { ConvexPublisherClient } from './convex';
import { putImmutableRulebookArtifact } from './rulebook-artifact-r2';
import type { RulebookArtifactBucket } from './rulebook-artifact-r2';
import { generateRulebookHtml, RulebookHtmlGenerationError } from './rulebook-html';

type RulebookHtmlClient = Pick<ConvexPublisherClient, 'completeRulebookArtifact' | 'failRulebookArtifact'>;

export type RulebookHtmlExecution = {
  assigned: number;
  completed: number;
  failed: number;
  missing: number;
  reused: number;
};

/** Generates and stores each HTML artifact without opening a Browser session. */
export async function executeRulebookHtmlWork(
  items: AssignedRulebookArtifactJob<'html'>[],
  dependencies: {
    bucket: RulebookArtifactBucket;
    client: RulebookHtmlClient;
    publicBaseUrl: string;
    rendererIdentity: string;
  }
): Promise<RulebookHtmlExecution> {
  const result: RulebookHtmlExecution = {
    assigned: items.length,
    completed: 0,
    failed: 0,
    missing: 0,
    reused: 0,
  };

  for (const item of items) {
    try {
      const bytes = generateRulebookHtml(item, dependencies.publicBaseUrl);
      const stored = await putImmutableRulebookArtifact(
        dependencies.bucket,
        'html',
        item,
        bytes,
        dependencies.rendererIdentity
      );
      if (!stored.created) {
        result.reused += 1;
      }
      const status = await dependencies.client.completeRulebookArtifact('html', item.artifactId);
      if (status === 'ready') {
        result.completed += 1;
      } else {
        result.missing += 1;
      }
    } catch (error) {
      if (!(error instanceof RulebookHtmlGenerationError)) {
        throw error;
      }
      const status = await dependencies.client.failRulebookArtifact('html', item.artifactId, error);
      if (status === 'failed') {
        result.failed += 1;
      } else {
        result.missing += 1;
      }
    }
  }
  return result;
}
