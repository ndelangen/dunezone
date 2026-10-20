import type { z } from 'zod';

import type { Board } from '../boards/schema';
import { compareCodeUnits } from '../compareText';
import { CustomCardAsset, StormCardAsset, SpiceAsset } from './schema';
import type { CustomCardTokens, CustomCardTokenResolution, SpiceBoardLink } from './schema';

type SpiceCardBoardResolution = { board: Board | null; tokens: z.infer<typeof CustomCardTokens>; error: string | null };

/** Leaves room for the publication envelope and Convex's encoded document overhead. */
export function customCardPublicationError(data: unknown, resolved: z.infer<typeof CustomCardTokenResolution>) {
  return (
    resolved.error ??
    (new TextEncoder().encode(JSON.stringify({ card: data, tokens: resolved.tokens })).length > 786_432
      ? 'The card and linked token artwork are too large to publish. Shorten text or remove layers.'
      : null)
  );
}

/** Repeated layers share one target read and one reverse reference. */
export function customCardTokenIds(data: unknown): string[] {
  const custom = CustomCardAsset.safeParse(data);
  const parsed = custom.success ? custom : StormCardAsset.safeParse(data);
  return parsed.success
    ? [...new Set(parsed.data.layers.flatMap((layer) => (layer.kind === 'token' ? [layer.asset_id] : [])))].sort(
        compareCodeUnits
      )
    : [];
}

/* The resolved board rides in the publication payload beside the card and its tokens. */
const MAX_PAYLOAD_BYTES = 786_432;

export function spiceCardBoardLink(data: unknown): z.infer<typeof SpiceBoardLink> | undefined {
  const parsed = SpiceAsset.safeParse(data);
  return parsed.success ? parsed.data.board : undefined;
}

/** Repeated instances of one token share one read and one reverse row. */
export function spiceCardTokenIds(data: unknown): string[] {
  const link = spiceCardBoardLink(data);
  return link ? [...new Set(link.tokens.map((token) => token.asset_id))].sort(compareCodeUnits) : [];
}

export function spiceCardPublicationError(data: unknown, resolved: SpiceCardBoardResolution) {
  return (
    resolved.error ??
    (new TextEncoder().encode(JSON.stringify({ card: data, board: resolved.board, tokens: resolved.tokens })).length >
    MAX_PAYLOAD_BYTES
      ? 'The card, its board and its tokens are too large to publish. Simplify the board or remove tokens.'
      : null)
  );
}
