import { COMPONENT_PART_LABELS, componentGeometrySchema } from '../asset-publishing/componentGeometry';
import type { ComponentGeometry } from '../asset-publishing/componentGeometry';
import { rulebookAssetExplainerColorSchema } from './contents';
import type { RulebookRenderBlockV1 } from './renderDocument';
import type { RulebookDesign } from './settings';
import type { RulebookSourceReference } from './sources';

type Explainer = Extract<RulebookRenderBlockV1, { kind: 'asset-explainer' }>;
type Point = Readonly<{ x: number; y: number }>;
type Part = ComponentGeometry['parts'][number];

export const RULEBOOK_ANNOTATION_COMPOSITOR_REVISION = 'asset-explainer-1';
const RULEBOOK_ANNOTATION_MAX_BYTES = 4_000_000;
export const RULEBOOK_ANNOTATION_COLORS = ['#9c2920', '#76500c', '#565d16', '#265e3a', '#244d7c', '#663182'] as const;

/** The same projected points and colors feed the live drawing and the exported illustration. */
type RulebookAnnotationEntry = Readonly<{
  id: string;
  label: string;
  color: string;
  foreground: '#000000' | '#ffffff';
  title: string;
  text: string;
  status:
    | 'ready'
    | 'unselected'
    | 'source-unavailable'
    | 'source-replaced'
    | 'part-unavailable'
    | 'geometry-unavailable';
  marker?: Point;
  connector?: Point;
  highlight?: Part['highlight'];
}>;

export type RulebookAnnotationProjection = Readonly<{
  sourceStatus: Explainer['source']['status'];
  sourceKind?: RulebookSourceReference['kind'];
  sourceName: string;
  width: number;
  height: number;
  design: RulebookDesign;
  entries: readonly RulebookAnnotationEntry[];
}>;

function sameSource(left: RulebookSourceReference | undefined, right: RulebookSourceReference): boolean {
  if (!left || left.kind !== right.kind) {
    return false;
  }
  switch (left.kind) {
    case 'asset':
      return right.kind === 'asset' && left.assetId === right.assetId;
    case 'board':
      return right.kind === 'board' && left.boardId === right.boardId;
    case 'stock':
      return right.kind === 'stock' && left.artworkId === right.artworkId;
    case 'faction':
      return right.kind === 'faction' && left.factionId === right.factionId;
    case 'faction-member':
      return right.kind === 'faction-member' && left.factionId === right.factionId && left.memberId === right.memberId;
  }
}

/** Chooses black or white by measured relative luminance, including manually selected colors. */
function rulebookAnnotationForeground(color: string): '#000000' | '#ffffff' {
  const channels = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
  return luminance > 0.179 ? '#000000' : '#ffffff';
}

function namedMarker(part: Part, kind: RulebookSourceReference['kind']): { marker: Point; connector?: Point } {
  const center = { x: part.x + part.width / 2, y: part.y + part.height / 2 };
  if (kind === 'board') {
    return { marker: center };
  }
  const placements: Record<string, Point> =
    kind === 'faction-member'
      ? {
          portrait: { x: 0.1, y: 0.28 },
          strength: { x: 0.96, y: 0.44 },
          'faction-emblem': { x: 0.94, y: 0.78 },
          name: { x: 0.13, y: 0.9 },
        }
      : {
          head: { x: 0.08, y: 0.08 },
          name: { x: 0.94, y: 0.15 },
          type: { x: 0.94, y: 0.32 },
          icon: { x: 0.94, y: 0.52 },
          decals: { x: 0.94, y: 0.75 },
          body: { x: 0.08, y: 0.72 },
          symbol: { x: 0.94, y: 0.5 },
          'top-text': { x: 0.13, y: 0.15 },
          'bottom-text': { x: 0.13, y: 0.85 },
          ring: { x: 0.9, y: 0.85 },
        };
  const placement = placements[part.key];
  if (placement) {
    return { marker: placement, connector: center };
  }
  const dx = center.x - 0.5;
  const dy = center.y - 0.5;
  const length = Math.hypot(dx, dy);
  const marker =
    length < 0.05 ? { x: 0.08, y: 0.22 } : { x: 0.5 + (dx / length) * 0.44, y: 0.5 + (dy / length) * 0.44 };
  return { marker, connector: center };
}

/** A source replacement preserves the saved target as unavailable until the author explicitly binds it again. */
export function projectRulebookAssetExplainerAnnotations(
  block: Pick<Explainer, 'source' | 'numbering' | 'colorMode' | 'items'>,
  design: RulebookDesign = 'illustrated'
): RulebookAnnotationProjection {
  if (block.items.length > 128) {
    throw new Error('Too many AssetExplainer entries');
  }
  const { source } = block;
  const parsedGeometry = source.status === 'ready' ? componentGeometrySchema.safeParse(source.geometry) : null;
  const geometry = parsedGeometry?.success ? parsedGeometry.data : undefined;
  const width = geometry?.width ?? (source.status === 'ready' ? source.width : undefined) ?? 1000;
  const height = geometry?.height ?? (source.status === 'ready' ? source.height : undefined) ?? 1000;
  const entries = block.items.map((item, index): RulebookAnnotationEntry => {
    const color =
      block.colorMode === 'manual' && item.color && rulebookAssetExplainerColorSchema.safeParse(item.color).success
        ? item.color
        : RULEBOOK_ANNOTATION_COLORS[index % RULEBOOK_ANNOTATION_COLORS.length]!;
    const base = {
      id: item.id,
      label: block.numbering === 'automatic' ? String(index + 1) : item.label,
      color,
      foreground: rulebookAnnotationForeground(color),
      text: item.text,
      title:
        item.target.kind === 'position'
          ? 'Positioned marker'
          : (COMPONENT_PART_LABELS[item.target.key] ??
            (item.target.key ? item.target.key.replaceAll('-', ' ') : 'Choose a part')),
    };
    if (source.status !== 'ready') {
      return { ...base, status: source.status === 'unselected' ? 'unselected' : 'source-unavailable' };
    }
    if (item.target.kind === 'named' && !item.target.key) {
      return { ...base, status: 'unselected' };
    }
    if (!sameSource(item.target.source, source.reference)) {
      return { ...base, status: 'source-replaced' };
    }
    if (item.target.kind === 'position') {
      return { ...base, status: 'ready', marker: { x: item.target.x, y: item.target.y } };
    }
    if (!geometry) {
      return { ...base, status: 'geometry-unavailable' };
    }
    const targetKey = item.target.key;
    const part = geometry.parts.find(({ key }) => key === targetKey);
    if (!part) {
      return { ...base, status: 'part-unavailable' };
    }
    const board = source.reference.kind === 'board';
    return {
      ...base,
      status: 'ready',
      title: part.label ?? COMPONENT_PART_LABELS[part.key] ?? base.title,
      ...namedMarker(part, source.reference.kind),
      ...(board && part.highlight ? { highlight: part.highlight } : {}),
    };
  });
  return {
    sourceStatus: source.status,
    sourceKind: source.status === 'unselected' ? undefined : source.reference.kind,
    sourceName:
      source.status === 'ready'
        ? source.name
        : source.status === 'unselected'
          ? 'No source selected'
          : 'Source unavailable',
    width: Number.isFinite(width) && width > 0 && width <= 20_000 ? width : 1000,
    height: Number.isFinite(height) && height > 0 && height <= 20_000 ? height : 1000,
    design,
    entries,
  };
}

export function rulebookAnnotationUnavailableText(status: RulebookAnnotationEntry['status']): string {
  switch (status) {
    case 'ready':
      return '';
    case 'unselected':
      return 'No target selected';
    case 'source-unavailable':
      return 'Source unavailable';
    case 'source-replaced':
      return 'Target belongs to another source';
    case 'part-unavailable':
      return 'Named part unavailable';
    case 'geometry-unavailable':
      return 'Named parts are not published yet';
  }
}

type SvgAttributes = Readonly<Record<string, string | number>>;
type RulebookAnnotationShape = Readonly<{
  tag: 'circle' | 'line' | 'path' | 'rect' | 'text';
  attributes: SvgAttributes;
  text?: string;
}>;

/** The compositor and React renderer draw this restricted set without recalculating positions. */
export function rulebookAnnotationCanvas(projection: RulebookAnnotationProjection) {
  const padding = Math.min(projection.width, projection.height) * 0.045;
  const footer =
    projection.sourceStatus === 'ready' && projection.entries.some(({ status }) => status !== 'ready')
      ? Math.min(projection.width, projection.height) * 0.1
      : 0;
  return {
    width: projection.width + padding * 2,
    height: projection.height + padding * 2 + footer,
    viewBox: `${-padding} ${-padding} ${projection.width + padding * 2} ${projection.height + padding * 2 + footer}`,
    padding,
    footer,
  };
}

export function rulebookAnnotationShapes(projection: RulebookAnnotationProjection): RulebookAnnotationShape[] {
  const { width, height } = projection;
  const unit = Math.min(width, height);
  const radius = unit * 0.036;
  const shapes: RulebookAnnotationShape[] = [];
  for (const entry of projection.entries) {
    for (const path of entry.highlight?.paths ?? []) {
      shapes.push({
        tag: 'path',
        attributes: {
          'data-rulebook-highlight': entry.id,
          d: path.d,
          transform: `scale(${width} ${height})${path.transform ? ` matrix(${path.transform.join(' ')})` : ''}`,
          fill: entry.color,
          'fill-opacity': 0.48,
          stroke: 'none',
        },
      });
    }
    if (entry.marker && entry.connector) {
      shapes.push({
        tag: 'line',
        attributes: {
          x1: entry.connector.x * width,
          y1: entry.connector.y * height,
          x2: entry.marker.x * width,
          y2: entry.marker.y * height,
          stroke: entry.color,
          'stroke-width': unit * 0.007,
        },
      });
    }
  }
  for (const entry of projection.entries) {
    if (!entry.marker) {
      continue;
    }
    const x = entry.marker.x * width;
    const y = entry.marker.y * height;
    shapes.push({
      tag: 'circle',
      attributes: {
        'data-rulebook-marker': entry.id,
        cx: x,
        cy: y,
        r: radius,
        fill: entry.color,
        stroke: projection.design === 'illustrated' ? '#fff9eb' : '#ffffff',
        'stroke-width': unit * 0.006,
      },
    });
    shapes.push({
      tag: 'text',
      attributes: {
        x,
        y,
        dy: '0.35em',
        fill: entry.foreground,
        'font-family': 'sans-serif',
        'font-size': unit * Math.min(0.046, 0.1 / Math.max(2, [...entry.label].length)),
        'font-weight': 700,
        'text-anchor': 'middle',
      },
      text: entry.label,
    });
  }
  const canvas = rulebookAnnotationCanvas(projection);
  if (canvas.footer) {
    const unavailable = projection.entries.filter(({ status }) => status !== 'ready');
    const missingLabels = unavailable.map(({ label }) => label || '?').join(', ');
    const notice =
      missingLabels.length <= 32
        ? `Unavailable markers: ${missingLabels}`
        : `${unavailable.length} targets unavailable`;
    shapes.push({
      tag: 'rect',
      attributes: {
        x: -canvas.padding,
        y: height + canvas.padding,
        width: canvas.width,
        height: canvas.footer,
        fill: projection.design === 'illustrated' ? '#fff9eb' : '#ffffff',
      },
    });
    shapes.push({
      tag: 'text',
      attributes: {
        x: width / 2,
        y: height + canvas.padding + canvas.footer * 0.65,
        'text-anchor': 'middle',
        fill: '#263e50',
        'font-family': 'sans-serif',
        'font-size': unit * 0.033,
      },
      text: notice,
    });
  }
  return shapes;
}

function escapeXml(value: string | number): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function embeddedImage(imageDataUrl: string, allowSvg: boolean): string {
  const match = /^data:(image\/(?:jpeg|png|webp|svg\+xml));base64,([A-Za-z0-9+/]+={0,2})$/.exec(imageDataUrl);
  if (!match || imageDataUrl.length > 3_600_000 || (match[1] === 'image/svg+xml' && !allowSvg)) {
    throw new Error('Invalid annotated source image');
  }
  if (match[1] === 'image/svg+xml') {
    const svg = atob(match[2]!);
    if (
      /<(?:[\w-]+:)?(?:script|foreignObject|iframe|style|animate\w*|set)\b|<!DOCTYPE|<!ENTITY|\bon\w+\s*=|(?:href|src)\s*=\s*["'](?!#)|url\(\s*["']?(?!#)/i.test(
        svg
      )
    ) {
      throw new Error('Unsafe annotated source image');
    }
  }
  return imageDataUrl;
}

/** Embeds one compatible image and its projected annotations without scripts, fonts, or external resources. */
export function composeRulebookAssetExplainerSvg({
  projection,
  imageDataUrl,
}: Readonly<{ projection: RulebookAnnotationProjection; imageDataUrl?: string }>): string {
  const { width, height } = projection;
  const canvas = rulebookAnnotationCanvas(projection);
  const title = projection.sourceName;
  const image =
    projection.sourceStatus === 'ready' && imageDataUrl
      ? `<image href="${escapeXml(embeddedImage(imageDataUrl, projection.sourceKind === 'board' || projection.sourceKind === 'stock' || projection.sourceKind === 'faction'))}" width="${width}" height="${height}" preserveAspectRatio="none"${projection.sourceKind === 'faction-member' ? ' clip-path="circle(50%)"' : ''}/>`
      : `<rect width="${width}" height="${height}" fill="#fff9eb"/><text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="#263e50" font-family="sans-serif" font-size="${Math.min(width, height) * 0.045}">${escapeXml(title)}</text>`;
  const shapes = projection.sourceStatus === 'ready' && imageDataUrl ? rulebookAnnotationShapes(projection) : [];
  const encoder = new TextEncoder();
  let usedBytes = encoder.encode(image).byteLength;
  const segments: string[] = [];
  for (const shape of shapes) {
    const segment = `<${shape.tag} ${Object.entries(shape.attributes)
      .map(([key, value]) => `${key}="${escapeXml(value)}"`)
      .join(' ')}>${escapeXml(shape.text ?? '')}</${shape.tag}>`;
    usedBytes += encoder.encode(segment).byteLength;
    if (usedBytes > RULEBOOK_ANNOTATION_MAX_BYTES) {
      throw new Error('Annotated illustration exceeds the delivery limit');
    }
    segments.push(segment);
  }
  const overlay = segments.join('');
  const unavailable = projection.entries.filter(({ status }) => status !== 'ready');
  const description = unavailable
    .map((entry) => `${entry.label} ${entry.title}: ${rulebookAnnotationUnavailableText(entry.status)}`)
    .join('; ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="${canvas.viewBox}" role="img"><title>${escapeXml(title)}</title><desc>${escapeXml(description)}</desc>${image}${overlay}</svg>`;
  if (new TextEncoder().encode(svg).byteLength > RULEBOOK_ANNOTATION_MAX_BYTES) {
    throw new Error('Annotated illustration exceeds the delivery limit');
  }
  return svg;
}
