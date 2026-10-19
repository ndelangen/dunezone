import type { ContentImportItem, ContentImportPackage, ContentImportTarget } from '@shared/contentImports/package';
import type { FunctionReturnType } from 'convex/server';

import { db } from '@db/core';

import { api } from '../../../convex/_generated/api';

export type ContentImportPreview = FunctionReturnType<typeof api.contentImports.preview>;
export type ContentImportResult = FunctionReturnType<typeof api.contentImports.applyItem>;

export async function previewContentImport(bundle: ContentImportPackage, target: ContentImportTarget) {
  return await db.mutation(api.contentImports.preview, { package: bundle, target });
}

export async function applyContentImportItem(
  packageKey: string,
  item: ContentImportItem,
  target: ContentImportTarget,
  expectedHash: string | null
) {
  return await db.mutation(api.contentImports.applyItem, { packageKey, item, target, expectedHash });
}

export async function exportContentRecord(
  target: ContentImportTarget,
  kind: 'rulebook' | 'faction' | 'asset',
  slug: string,
  type?: string
) {
  return await db.mutation(api.contentImports.exportRecord, { target, kind, slug, ...(type ? { type } : {}) });
}
