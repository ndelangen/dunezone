import { z } from 'zod';

import { NexusCardAssetInput, StrongholdCardAssetInput } from '../assets/schema';
import { parseAssetDataForWrite } from '../assets/validation';
import { FactionWriteSchema } from '../factions/schema';
import { rulebookContentsV1Schema } from '../rulebooks/contents';
import { RULEBOOK_PDF_MAX_PAGES } from '../rulebooks/pdfOptimization';
import { rulebookSettingsSchema } from '../rulebooks/settings';

export const RAW_AUTHORING_MAX_BYTES = 512 * 1024;
const RAW_AUTHORING_MAX_DEPTH = 64;
const RAW_AUTHORING_MAX_NODES = 50_000;

/** Bounds untrusted text before schema or reference validation. */
export function readRawAuthoringJson(text: string): unknown {
  if (new TextEncoder().encode(text).byteLength > RAW_AUTHORING_MAX_BYTES) {
    throw new Error('JSON must be at most 512 KiB.');
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('Enter valid JSON.');
  }
  const pending = [{ value, depth: 0, path: '$' }];
  let nodes = 0;
  while (pending.length) {
    const item = pending.pop()!;
    if (++nodes > RAW_AUTHORING_MAX_NODES) {
      throw new Error('JSON must contain at most 50,000 values.');
    }
    if (item.depth > RAW_AUTHORING_MAX_DEPTH) {
      throw new Error(`${item.path}: JSON must be at most 64 levels deep.`);
    }
    if (item.value !== null && typeof item.value === 'object') {
      for (const [key, child] of Object.entries(item.value)) {
        if (['__proto__', 'prototype', 'constructor'].includes(key)) {
          throw new Error(`${item.path}.${key}: This key is not allowed.`);
        }
        pending.push({ value: child, depth: item.depth + 1, path: `${item.path}.${key}` });
      }
    }
  }
  return value;
}

/** Every incoming key must survive the writable decoder, even where a legacy decoder strips keys. */
function assertNoDiscardedFields(input: unknown, output: unknown, path = '$') {
  if (input === null || typeof input !== 'object') {
    return;
  }
  for (const [key, value] of Object.entries(input)) {
    if (output === null || typeof output !== 'object' || !Object.hasOwn(output, key)) {
      throw new Error(`${path}.${key}: Unknown or protected field.`);
    }
    assertNoDiscardedFields(value, (output as Record<string, unknown>)[key], `${path}.${key}`);
  }
}

export const rawRulebookSchema = z.strictObject({
  settings: rulebookSettingsSchema,
  contents: rulebookContentsV1Schema.refine(
    (contents) => contents.pageOrder.length > 0 && contents.pageOrder.length <= RULEBOOK_PDF_MAX_PAGES,
    { message: `Use between 1 and ${RULEBOOK_PDF_MAX_PAGES} Pages.` }
  ),
});

export function parseRawAsset(type: string, value: unknown) {
  const data =
    type === 'card-nexus'
      ? NexusCardAssetInput.parse(value)
      : type === 'card-stronghold'
        ? StrongholdCardAssetInput.parse(value)
        : undefined;
  const parsed = data ? { data, name: data.name } : parseAssetDataForWrite(type, value);
  assertNoDiscardedFields(value, parsed.data);
  const back = (parsed.data as { back?: { mode?: string; asset_id?: string } }).back;
  if (back?.mode === 'reference' && !back.asset_id) {
    throw new Error('$.back.asset_id: Choose a token back.');
  }
  return parsed;
}

export function parseRawFaction(value: unknown) {
  const faction = FactionWriteSchema.parse(value);
  assertNoDiscardedFields(value, faction);
  if (!faction.factionLeader.memberId) {
    throw new Error('$.factionLeader.memberId: A persistent component ID is required.');
  }
  faction.leaders.forEach((leader, index) => {
    if (!leader.memberId) {
      throw new Error(`$.leaders.${index}.memberId: A persistent component ID is required.`);
    }
  });
  faction.troops.forEach((troop, index) => {
    if (!troop.troopId) {
      throw new Error(`$.troops.${index}.troopId: A persistent component ID is required.`);
    }
  });
  return faction;
}

export function rawAuthoringError(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues.map((issue) => `$.${issue.path.join('.')}: ${issue.message}`).join('\n');
  }
  return error instanceof Error ? error.message : 'The JSON could not be loaded.';
}
