import { beforeEach, describe, expect, test, vi } from 'vitest';

import { createRulebookRenderDocumentFixture } from '../../src/shared/rulebooks/renderDocument.fixture';
import { TargetRenderError } from './browser';
import type { PublisherConfig } from './config';
import * as rulebookPdf from './rulebook-pdf';
import { removeRulebookPdfCapture, stageRulebookPdfCapture } from './rulebook-pdf-capture';
import { executeRulebookPdfWork } from './rulebook-pdf-executor';
import { putImmutableRulebookPdf } from './rulebook-pdf-r2';

vi.mock('./rulebook-pdf-capture', () => ({
  stageRulebookPdfCapture: vi.fn(),
  removeRulebookPdfCapture: vi.fn(),
}));
vi.mock('./rulebook-pdf', async (importOriginal) => {
  const original = await importOriginal<typeof rulebookPdf>();
  return { ...original, composeRulebookPdf: vi.fn() };
});
vi.mock('./rulebook-pdf-r2', () => ({ putImmutableRulebookPdf: vi.fn() }));

const config: PublisherConfig = {
  publicBaseUrl: 'https://dune.zone',
  captureBaseUrl: 'https://publisher.example.com',
  convexExecutorBaseUrl: 'https://convex.example.com',
  workWindowMs: 240_000,
  browserCaptureTimeoutMs: 45_000,
  browserCleanupGraceMs: 30_000,
  pdfMaxBytes: 8_000_000,
};

const document = createRulebookRenderDocumentFixture();
const job = {
  artifactId: 'artifact-one',
  editionId: 'edition-one',
  rulebookId: 'rulebook-one',
  editionNumber: 1,
  editionCreatedAt: '2026-09-01T12:00:00.000Z',
  rulebookName: 'Rulebook',
  document,
};
const snapshot = {
  ok: true as const,
  assetType: 'rulebook-pdf-batch' as const,
  payload: {
    schemaVersion: 1 as const,
    artifactId: job.artifactId,
    editionId: job.editionId,
    rulebookId: job.rulebookId,
    editionNumber: 1,
    batchIndex: 0,
    pageOffset: 0,
    document,
  },
  payloadHash: 'a'.repeat(64),
};

function dependencies(
  capture = vi.fn(async () => ({ bytes: new Uint8Array([1]), payloadHash: 'a'.repeat(64), output: 'pdf' as const }))
) {
  const close = vi.fn(async () => {});
  const completeRulebookPdf = vi.fn(async () => 'ready' as const);
  const failRulebookPdf = vi.fn(async () => 'failed' as const);
  return {
    dependencies: {
      bucket: {} as never,
      client: { completeRulebookPdf, failRulebookPdf },
      openBrowser: vi.fn(async () => ({ captureRulebookPdfBatch: capture, close, sessionId: () => 'session-one' })),
      rendererIdentity: 'renderer-one',
    },
    capture,
    close,
    completeRulebookPdf,
    failRulebookPdf,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(stageRulebookPdfCapture).mockResolvedValue({
    token: 'b'.repeat(64),
    bundle: { schemaVersion: 1, expiresAt: Date.now() + 300_000, batches: [snapshot] },
  });
  vi.mocked(removeRulebookPdfCapture).mockResolvedValue(undefined);
  vi.mocked(rulebookPdf.composeRulebookPdf).mockResolvedValue(new Uint8Array([1, 2, 3]));
  vi.mocked(putImmutableRulebookPdf).mockResolvedValue({ key: 'rulebook.pdf', created: true });
});

describe('Rulebook PDF executor', () => {
  test('captures, composes, completes, and closes one Browser session', async () => {
    const current = dependencies();
    await expect(executeRulebookPdfWork(config, [job], current.dependencies)).resolves.toMatchObject({
      assigned: 1,
      batches: 1,
      pages: 3,
      completed: 1,
      failed: 0,
      browserOpened: true,
      browserClosed: true,
    });
    expect(current.capture).toHaveBeenCalledOnce();
    expect(rulebookPdf.composeRulebookPdf).toHaveBeenCalledOnce();
    expect(putImmutableRulebookPdf).toHaveBeenCalledOnce();
    expect(current.completeRulebookPdf).toHaveBeenCalledOnce();
    expect(removeRulebookPdfCapture).toHaveBeenCalledWith(expect.anything(), 'b'.repeat(64));
    expect(current.close).toHaveBeenCalledOnce();
  });

  test.each([
    ['capture', new TargetRenderError('Page bounds are wrong')],
    ['merge', new rulebookPdf.RulebookPdfGenerationError('Batch merge failed')],
  ] as const)('settles a permanent %s failure without completing the artifact', async (phase, failure) => {
    const current = dependencies(
      phase === 'capture'
        ? vi.fn(async () => {
            throw failure;
          })
        : undefined
    );
    if (phase === 'merge') {
      vi.mocked(rulebookPdf.composeRulebookPdf).mockRejectedValueOnce(failure);
    }

    await expect(executeRulebookPdfWork(config, [job], current.dependencies)).resolves.toMatchObject({
      completed: 0,
      failed: 1,
      unprocessed: 0,
      browserClosed: true,
    });
    expect(current.failRulebookPdf).toHaveBeenCalledOnce();
    expect(current.completeRulebookPdf).not.toHaveBeenCalled();
    expect(putImmutableRulebookPdf).not.toHaveBeenCalled();
  });

  test('leaves infrastructure failure for expiry recovery but still cleans Browser and staging state', async () => {
    const current = dependencies(
      vi.fn(async () => {
        throw new Error('Browser provider unavailable');
      })
    );

    await expect(executeRulebookPdfWork(config, [job], current.dependencies)).rejects.toThrow(
      'Browser provider unavailable'
    );
    expect(current.failRulebookPdf).not.toHaveBeenCalled();
    expect(removeRulebookPdfCapture).toHaveBeenCalledOnce();
    expect(current.close).toHaveBeenCalledOnce();
  });
});
