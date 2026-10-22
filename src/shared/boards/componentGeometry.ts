import type { ComponentGeometry } from '../asset-publishing/componentGeometry';
import { derive } from './geometry';
import type { Board, Face } from './geometry';
import { propertyId } from './schema';

/* A saved board draws in a square frame this wide, the same one its published image fills. */
const FRAME = 487.06;
const MAX_PARTS = 128;
const MAX_PATHS = 128;
const MAX_PATH_LENGTH = 20_000;
/* Component geometry labels are capped shorter than saved board territory names; a longer name is cut rather than failing the whole board. */
const MAX_LABEL_LENGTH = 120;

/* The maintained Arrakis geometry names its territory groups so; a saved board's groups take the same keys, so a Rulebook highlight authored on one draws on the other. */
const TYPE_GROUPS = { stronghold: 'strongholds', rock: 'rock', sand: 'sand', polar: 'polar' } as const;

/** The maintained Arrakis part key for a territory: Play's territory ID spelled with hyphens. */
const boardPartKey = (property: Parameters<typeof propertyId>[0]) => propertyId(property).replaceAll('_', '-');

const round = (value: number) => Math.round(value * 100) / 100;
const roundPath = (d: string) => d.replace(/-?\d+\.\d+(?:e-?\d+)?/g, (value) => String(round(Number(value))));
const clampUnit = (value: number) => Math.min(1, Math.max(0, value));

function bounds(faces: readonly Face[]) {
  const points = faces.flatMap((face) => face.rings.flat());
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const x = clampUnit(Math.min(...xs) / FRAME);
  const y = clampUnit(Math.min(...ys) / FRAME);
  return {
    x,
    y,
    width: Math.max(1e-6, clampUnit(Math.max(...xs) / FRAME) - x),
    height: Math.max(1e-6, clampUnit(Math.max(...ys) / FRAME) - y),
  };
}

function part(key: string, label: string, faces: readonly Face[]) {
  const transform: [number, number, number, number, number, number] = [1 / FRAME, 0, 0, 1 / FRAME, 0, 0];
  const paths = faces
    .map((face) => roundPath(face.path))
    .filter((d) => d.length <= MAX_PATH_LENGTH)
    .slice(0, MAX_PATHS)
    .map((d) => ({ d, transform }));
  return {
    key,
    label: label.slice(0, MAX_LABEL_LENGTH),
    ...bounds(faces),
    ...(paths.length ? { highlight: { paths } } : {}),
  };
}

/**
 * A saved board's territories as a Rulebook illustration's component geometry, in the frame of the board's published image.
 * Each territory is a part under its Arrakis-style key, and each territory type a group part, as the maintained Arrakis geometry has them;
 * a territory whose ID no key can spell is left out.
 */
export function boardComponentGeometry(board: Board, widthPx: number, heightPx: number): ComponentGeometry {
  const faces = derive(board).faces;
  const territories = faces
    .map((face) => {
      const property = board.properties[face.key];
      return { face, key: boardPartKey(property), name: property.name, type: property.type };
    })
    .filter(({ key }) => /^[a-z][a-z0-9-]*$/.test(key) && key.length <= 80);
  const parts = new Map<string, ReturnType<typeof part>>();
  for (const { key, name } of territories) {
    if (!parts.has(key)) {
      parts.set(
        key,
        part(
          key,
          name,
          territories.filter((other) => other.key === key).map((t) => t.face)
        )
      );
    }
  }
  for (const [type, key] of Object.entries(TYPE_GROUPS)) {
    const members = territories.filter((territory) => territory.type === type).map(({ face }) => face);
    if (members.length && !parts.has(key)) {
      parts.set(key, part(key, `All ${key}`, members));
    }
  }
  return { width: widthPx, height: heightPx, parts: [...parts.values()].slice(0, MAX_PARTS) };
}
