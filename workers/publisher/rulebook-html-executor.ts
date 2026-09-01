import type { AssignedRulebookHtmlJob } from '../../src/shared/rulebooks/htmlPublication';
import type { ConvexPublisherClient } from './convex';
import { generateRulebookHtml, RulebookHtmlGenerationError } from './rulebook-html';
import { putImmutableRulebookHtml } from './rulebook-html-r2';
import type { RulebookHtmlBucket } from './rulebook-html-r2';

type RulebookHtmlClient = Pick<ConvexPublisherClient, 'completeRulebookHtml' | 'failRulebookHtml'>;

export type RulebookHtmlExecution = {
  assigned: number;
  completed: number;
  failed: number;
  missing: number;
  reused: number;
};

/** Generates and stores each HTML artifact without opening a Browser session. */
export async function executeRulebookHtmlWork(
  items: AssignedRulebookHtmlJob[],
  dependencies: {
    bucket: RulebookHtmlBucket;
    client: RulebookHtmlClient;
    publicBaseUrl: string;
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
      const stored = await putImmutableRulebookHtml(dependencies.bucket, item, bytes);
      if (!stored.created) {
        result.reused += 1;
      }
      const status = await dependencies.client.completeRulebookHtml(item.artifactId);
      if (status === 'ready') {
        result.completed += 1;
      } else {
        result.missing += 1;
      }
    } catch (error) {
      if (!(error instanceof RulebookHtmlGenerationError)) {
        throw error;
      }
      const status = await dependencies.client.failRulebookHtml(item.artifactId, error);
      if (status === 'failed') {
        result.failed += 1;
      } else {
        result.missing += 1;
      }
    }
  }
  return result;
}
