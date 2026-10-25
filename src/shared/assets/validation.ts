import { derive } from '../boards/geometry';
import { BoardAsset } from '../boards/schema';
import {
  BundleAssetInput,
  CustomCardAssetInput,
  LeaderSkillAssetInput,
  LeaderTokenAssetInput,
  NexusCardAssetInput,
  HomeworldCardAssetInput,
  DeckAssetInput,
  RectangleTokenAssetInput,
  SpiceAssetInput,
  StrongholdCardAssetInput,
  StormCardAssetInput,
  TokenAssetInput,
  TreacheryAssetInput,
} from './schema';

export function parseNexusCardInput(data: unknown) {
  const result = NexusCardAssetInput.safeParse(data);
  if (!result.success) {
    throw new Error('The Nexus card contains invalid fields');
  }
  return result.data;
}

/*
 * A write and its readiness trigger validate identical linework, as does a clone.
 * Keep only the last linework's territory keys, bounded by the board payload limit.
 * Saved fields are parsed on every call; changed points or edges require fresh geometry.
 */
let lastBoardBoundaries: { linework: string; territoryKeys: string[] } | undefined;

/** A board must have usable geometry as well as valid saved fields. */
export function parseBoardData(data: unknown) {
  const parsed = BoardAsset.parse(data);
  const linework = JSON.stringify([parsed.board.nodes, parsed.board.edges]);
  if (lastBoardBoundaries?.linework !== linework) {
    const geometry = derive(parsed.board);
    if (!geometry.faces.length || geometry.unrecoveredSegments) {
      throw new Error('The board needs closed, renderable territory boundaries');
    }
    lastBoardBoundaries = { linework, territoryKeys: geometry.faces.map((face) => face.key) };
  }
  if (lastBoardBoundaries.territoryKeys.some((key) => !parsed.board.properties[key])) {
    throw new Error('Every territory needs a name');
  }
  return parsed;
}

/**
 * Validates writable Asset data against the renderer-owned shape shared by the browser and server.
 */
export function parseAssetDataForWrite(type: string, data: unknown): { data: unknown; name: string } {
  switch (type) {
    case 'token-leader': {
      const parsed = LeaderTokenAssetInput.parse(data);
      return { data: parsed, name: parsed.name };
    }
    case 'board': {
      const parsed = parseBoardData(data);
      return { data: parsed, name: parsed.name };
    }
    case 'card-treachery': {
      const parsed = TreacheryAssetInput.parse(data);
      return { data: parsed, name: parsed.name };
    }
    case 'card-spice': {
      const parsed = SpiceAssetInput.parse(data);
      return { data: parsed, name: parsed.name };
    }
    case 'card-leaderability': {
      const parsed = LeaderSkillAssetInput.parse(data);
      return { data: parsed, name: parsed.name };
    }
    case 'card-homeworld': {
      const parsed = HomeworldCardAssetInput.parse(data);
      return { data: parsed, name: parsed.name };
    }
    case 'card-nexus': {
      const parsed = parseNexusCardInput(data);
      return { data: parsed, name: parsed.name };
    }
    case 'card-stronghold': {
      const result = StrongholdCardAssetInput.safeParse(data);
      if (!result.success) {
        throw new Error('The stronghold card contains invalid fields');
      }
      return { data: result.data, name: result.data.name };
    }
    case 'card-custom': {
      const parsed = CustomCardAssetInput.parse(data);
      return { data: parsed, name: parsed.name };
    }
    case 'card-storm': {
      const parsed = StormCardAssetInput.parse(data);
      return { data: parsed, name: parsed.name };
    }
    case 'deck': {
      const parsed = DeckAssetInput.parse(data);
      return { data: parsed, name: parsed.name };
    }
    /* A container of tokens. It publishes nothing, so nothing downstream of this branch enqueues. */
    case 'bundle': {
      const parsed = BundleAssetInput.parse(data);
      return { data: parsed, name: parsed.name };
    }
    /* The three shapes share one schema: shape is the Asset type, never a field, so only the clip differs downstream. */
    case 'token-disc':
    case 'token-tech':
    case 'token-pointer':
    case 'token-plate': {
      const parsed = TokenAssetInput.parse(data);
      return { data: parsed, name: parsed.name };
    }
    /* The rectangle is a token by category and by backside rules, and its own schema by face: a free composition rather than a symbol in a fixed slot. */
    case 'token-enhance': {
      const parsed = RectangleTokenAssetInput.parse(data);
      return { data: parsed, name: parsed.name };
    }
    default:
      throw new Error(`Asset type ${type} cannot be written yet`);
  }
}
