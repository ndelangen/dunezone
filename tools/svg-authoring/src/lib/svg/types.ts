export type ViewBox = [number, number, number, number];

export interface SvgMeta {
  viewBox: ViewBox | null;
  width: number | null;
  height: number | null;
  aspectRatio: number | null;
}

export interface SvgDocument {
  id: string;
  name: string;
  /** Immutable source as originally ingested. */
  original: string;
  /** Working copy mutated by pipeline steps. */
  current: string;
  /** Whether this doc is included in batch operations. */
  selected: boolean;
  /** Per-file manual mirror flags (applied by the mirrorFlip step). */
  flip: { x: boolean; y: boolean };
  meta: SvgMeta;
}

export function createSvgDocument(
  name: string,
  source: string,
  id?: string,
): SvgDocument {
  return {
    id: id ?? crypto.randomUUID(),
    name,
    original: source,
    current: source,
    selected: true,
    flip: { x: false, y: false },
    meta: { viewBox: null, width: null, height: null, aspectRatio: null },
  };
}
