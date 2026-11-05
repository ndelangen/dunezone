import { describe, expect, it } from 'vite-plus/test';

import { SECTORS_PART_KEY } from '../asset-publishing/componentGeometry';
import {
  composeRulebookAssetExplainerSvg,
  projectRulebookAssetExplainerAnnotations,
  rulebookAnnotationCanvas,
  RULEBOOK_ANNOTATION_MAX_IMAGE_BYTES,
  rulebookAnnotationShapes,
} from './assetExplainerAnnotations';
import { resolveRulebookBoardDefinition } from './boardDefinitions';
import { resolveRulebookBoardIllustration } from './boardIllustrations';
import type { RulebookRenderBlockV1 } from './renderDocument';

type Explainer = Extract<RulebookRenderBlockV1, { kind: 'asset-explainer' }>;
const reference = { kind: 'asset', assetId: 'card' } as const;
function block(): Explainer {
  return {
    id: 'EXPL',
    kind: 'asset-explainer',
    caption: '',
    numbering: 'automatic',
    colorMode: 'automatic',
    source: {
      status: 'ready',
      reference,
      name: 'A Card',
      imageUrl: '/card.jpg',
      geometry: {
        width: 900,
        height: 1263,
        parts: [{ key: 'name', label: 'Name', x: 0.1, y: 0.1, width: 0.8, height: 0.1 }],
      },
    },
    items: [
      {
        id: 'NAME',
        label: 'N',
        color: '#ffffff',
        text: 'Read the printed name.',
        target: { kind: 'named', key: 'name', source: reference },
      },
      {
        id: 'MARK',
        label: '!',
        color: '#000000',
        text: 'Look here.',
        target: { kind: 'position', x: 0, y: 1, source: reference },
      },
    ],
  };
}

describe('AssetExplainer annotation projection', () => {
  it('does not carry an emblem marker over to a sheet from the same faction', () => {
    const example = block();
    const emblem = { kind: 'faction', factionId: 'atreides' } as const;
    example.source = {
      status: 'ready',
      reference: { ...emblem, presentation: 'sheet' },
      name: 'Atreides sheet',
      imageUrl: '/vector/emblem/atreides.svg',
    };
    example.items = [
      { id: 'OLD', label: '1', text: 'Emblem label', target: { kind: 'position', x: 0.5, y: 0.5, source: emblem } },
    ];
    expect(projectRulebookAssetExplainerAnnotations(example).entries[0]?.status).toBe('source-replaced');
  });

  it('resolves current geometry and preserves positioned coordinates while numbers follow order', () => {
    const original = block();
    const before = projectRulebookAssetExplainerAnnotations(original);
    if (original.source.status !== 'ready') {
      throw new Error('Expected the ready source');
    }
    const moved = {
      ...original,
      items: [...original.items].reverse(),
      source: {
        ...original.source,
        geometry: {
          ...original.source.geometry!,
          parts: [{ key: 'name', label: 'Name', x: 0.1, y: 0.7, width: 0.8, height: 0.1 }],
        },
      },
    };
    const after = projectRulebookAssetExplainerAnnotations(moved);
    expect(before.entries[0]!.connector!.y).toBeCloseTo(0.15);
    expect(after.entries[1]!.connector!.y).toBeCloseTo(0.75);
    expect(after.entries[0]).toMatchObject({ id: 'MARK', label: '1', marker: { x: 0, y: 1 } });
    expect(after.entries[1]).toMatchObject({ id: 'NAME', label: '2', text: 'Read the printed name.' });
    const custom = projectRulebookAssetExplainerAnnotations({ ...moved, numbering: 'custom', colorMode: 'manual' });
    expect(custom.entries.map(({ label, color, foreground }) => ({ label, color, foreground }))).toEqual([
      { label: '!', color: '#000000', foreground: '#ffffff' },
      { label: 'N', color: '#ffffff', foreground: '#000000' },
    ]);
  });

  it('does not transfer a target to a new source or silently move a missing part', () => {
    const original = block();
    if (original.source.status !== 'ready') {
      throw new Error('Expected the ready source');
    }
    const missing = projectRulebookAssetExplainerAnnotations({
      ...original,
      source: { ...original.source, geometry: { ...original.source.geometry!, parts: [] } },
    });
    expect(missing.entries[0]).toMatchObject({ id: 'NAME', status: 'part-unavailable', text: original.items[0]!.text });
    expect(missing.entries[0]!.marker).toBeUndefined();
    expect(missing.entries[1]!.status).toBe('ready');
    const changed = projectRulebookAssetExplainerAnnotations({
      ...original,
      source: { ...original.source, reference: { kind: 'asset', assetId: 'another-card' } },
    });
    expect(changed.entries.every(({ status, marker }) => status === 'source-replaced' && marker === undefined)).toBe(
      true
    );
    const removed = projectRulebookAssetExplainerAnnotations({
      ...original,
      source: { status: 'unavailable', reference },
    });
    expect(removed.entries.every(({ status, marker }) => status === 'source-unavailable' && marker === undefined)).toBe(
      true
    );
  });

  it('names a source not yet chosen and leaves every entry unplaced on a default square', () => {
    const projection = projectRulebookAssetExplainerAnnotations({ ...block(), source: { status: 'unselected' } });
    expect(projection).toMatchObject({
      sourceStatus: 'unselected',
      sourceName: 'No source selected',
      width: 1000,
      height: 1000,
    });
    expect(projection.sourceKind).toBeUndefined();
    expect(projection.sourceShadow).toBeUndefined();
    expect(projection.entries.map(({ id, status, marker }) => ({ id, status, marker }))).toEqual([
      { id: 'NAME', status: 'unselected', marker: undefined },
      { id: 'MARK', status: 'unselected', marker: undefined },
    ]);
    const empty = projectRulebookAssetExplainerAnnotations({ ...block(), source: { status: 'unselected' }, items: [] });
    expect(empty.entries).toEqual([]);
    const svg = composeRulebookAssetExplainerSvg({ projection: empty, imageDataUrl: 'data:image/jpeg;base64,AAAA' });
    expect(svg).toContain('<title>No source selected</title>');
    expect(svg).not.toContain('<image');
  });

  it('rejects unsafe geometry without rendering its paths', () => {
    const original = block();
    if (original.source.status !== 'ready') {
      throw new Error('Expected the ready source');
    }
    original.source.geometry!.parts[0]!.highlight = { paths: [{ d: '<script>alert(1)</script>' }] };
    const projection = projectRulebookAssetExplainerAnnotations(original);
    expect(projection.entries[0]!.status).toBe('geometry-unavailable');
    expect(rulebookAnnotationShapes(projection).some(({ tag }) => tag === 'path')).toBe(false);
  });
});

describe('AssetExplainer highlight drawing', () => {
  it('fills closed territory paths and strokes open sector lines, a pixel-sized dash however the geometry is scaled', () => {
    const original = block();
    if (original.source.status !== 'ready') {
      throw new Error('Expected the ready source');
    }
    const board = { kind: 'board', boardId: 'arrakis-official' } as const;
    original.source.reference = board;
    original.items[0]!.target = { kind: 'named', key: 'name', source: board };
    original.source.geometry = {
      width: 1000,
      height: 1000,
      parts: [
        {
          key: 'name',
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          highlight: {
            paths: [
              { d: 'M0 0L100 0L100 100Z', transform: [0.01, 0, 0, 0.01, 0, 0] },
              { d: 'M50 50L100 0', transform: [0.01, 0, 0, 0.01, 0, 0] },
            ],
          },
        },
      ],
    };
    const projection = projectRulebookAssetExplainerAnnotations(original);
    const color = projection.entries[0]!.color;
    const paths = rulebookAnnotationShapes(projection).filter(({ tag }) => tag === 'path');
    expect(paths.map(({ attributes }) => attributes.fill)).toEqual([color, 'none']);
    expect(paths[0]!.attributes.stroke).toBe('none');
    expect(paths[1]!.attributes.stroke).toBe(color);
    /* 0.6% of the 1000 px image is 6 px, which is 0.6 units once the image scale (1000) and the matrix (0.01) apply. */
    expect(Number(paths[1]!.attributes['stroke-width'])).toBeCloseTo(0.6);
    expect(paths[1]!.attributes['stroke-dasharray']).toBe('1.6 1');
  });
});

describe('AssetExplainer sector lines', () => {
  function boardBlock(sectorLines = false): Explainer {
    const original = block();
    const board = { kind: 'board', boardId: 'ns72fst9vtajbcc6066ejz92ph8fweez' } as const;
    original.source = {
      status: 'ready',
      reference: board,
      name: 'Arrakis',
      imageUrl: '/board.jpg',
      geometry: {
        width: 1948,
        height: 1948,
        parts: [
          { key: 'name', x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
          {
            key: 'sectors',
            x: 0,
            y: 0,
            width: 1,
            height: 1,
            highlight: { paths: [{ d: 'M243 243L485 243' }, { d: 'M243 243L243 1' }] },
          },
        ],
      },
    };
    original.items = [{ ...original.items[0]!, target: { kind: 'named', key: 'name', source: board } }];
    return sectorLines ? { ...original, sectorLines } : original;
  }
  const guides = (explainer: Explainer) =>
    rulebookAnnotationShapes(projectRulebookAssetExplainerAnnotations(explainer)).filter(
      ({ attributes }) => attributes['data-rulebook-guide'] === SECTORS_PART_KEY
    );

  it('draws faint dashed sector lines under every annotation when the block turns them on', () => {
    const lines = guides(boardBlock(true));
    expect(lines).toHaveLength(2);
    expect(lines[0]!.attributes).toMatchObject({ fill: 'none', stroke: '#000000', 'stroke-opacity': 0.3 });
    expect(lines[0]!.attributes['stroke-dasharray']).toMatch(/^[\d.]+ [\d.]+$/);
    const shapes = rulebookAnnotationShapes(projectRulebookAssetExplainerAnnotations(boardBlock(true)));
    expect(shapes.findIndex(({ attributes }) => 'data-rulebook-guide' in attributes)).toBe(0);
  });

  it('draws no sector lines unless the block turns them on', () => {
    expect(guides(boardBlock())).toEqual([]);
  });

  it('draws no sector lines over the built-in board, whose artwork prints its own', () => {
    const board = resolveRulebookBoardDefinition('arrakis')!;
    const reference = { kind: 'board', boardId: board.id } as const;
    const explainer = boardBlock(true);
    explainer.source = {
      status: 'ready',
      reference,
      name: board.name,
      imageUrl: board.imageUrl,
      geometry: board.geometry,
      publicationRevision: board.revision,
    };
    explainer.items = [{ ...explainer.items[0]!, target: { kind: 'named', key: 'arrakeen', source: reference } }];
    expect(board.geometry.parts.some(({ key }) => key === SECTORS_PART_KEY)).toBe(true);
    expect(guides(explainer)).toEqual([]);
  });

  it('never draws a territory the board names Sectors as sector lines', () => {
    const explainer = boardBlock(true);
    if (explainer.source.status !== 'ready' || !explainer.source.geometry) {
      throw new Error('Expected a ready board');
    }
    explainer.source.geometry.parts[1] = {
      key: SECTORS_PART_KEY,
      label: 'Sectors',
      x: 0.2,
      y: 0.2,
      width: 0.1,
      height: 0.1,
      highlight: { paths: [{ d: 'M400 400L600 400L600 600Z' }] },
    };
    expect(guides(explainer)).toEqual([]);
  });
});

describe('AssetExplainer SVG composition', () => {
  it('embeds the largest source image the delivery accepts', () => {
    const imageDataUrl = `data:image/jpeg;base64,${btoa('\0'.repeat(RULEBOOK_ANNOTATION_MAX_IMAGE_BYTES))}`;
    const svg = composeRulebookAssetExplainerSvg({
      projection: projectRulebookAssetExplainerAnnotations(block()),
      imageDataUrl,
    });
    expect(svg).toContain(imageDataUrl.slice(0, 64));
  });

  it('uses white on the reported brown badge and black on light badges in the legend and exported drawing', () => {
    const original = block();
    original.colorMode = 'manual';
    original.items[0]!.color = '#a87924';
    original.items[1]!.color = '#f8dc24';
    const projection = projectRulebookAssetExplainerAnnotations(original);
    expect(projection.entries.map(({ foreground }) => foreground)).toEqual(['#ffffff', '#000000']);
    const svg = composeRulebookAssetExplainerSvg({ projection, imageDataUrl: 'data:image/jpeg;base64,AAAA' });
    expect(svg).toMatch(/<text\b[^>]*fill="#ffffff"[^>]*>1<\/text>/);
    expect(svg).toMatch(/<text\b[^>]*fill="#000000"[^>]*>2<\/text>/);
  });

  it('escapes source text and labels and never embeds a supplied external image URL', () => {
    const original = block();
    original.numbering = 'custom';
    original.items[0]!.label = '<&"';
    if (original.source.status !== 'ready') {
      throw new Error('Expected the ready source');
    }
    original.source.name = '<script>bad</script>';
    const projection = projectRulebookAssetExplainerAnnotations(original);
    const svg = composeRulebookAssetExplainerSvg({ projection, imageDataUrl: 'data:image/jpeg;base64,AAAA' });
    expect(svg).toContain('&lt;script&gt;bad&lt;/script&gt;');
    expect(svg).toContain('&lt;&amp;&quot;');
    expect(svg).not.toContain('<script>');
    expect(() =>
      composeRulebookAssetExplainerSvg({ projection, imageDataUrl: 'https://outside.invalid/image.jpg' })
    ).toThrow('Invalid annotated source image');
  });

  it('embeds the maintained board with its bounded highlight geometry', () => {
    const board = resolveRulebookBoardDefinition('arrakis')!;
    const source = { kind: 'board', boardId: board.id } as const;
    const original = block();
    original.source = {
      status: 'ready',
      reference: source,
      name: board.name,
      imageUrl: board.imageUrl,
      geometry: board.geometry,
    };
    original.items = [{ ...original.items[0]!, target: { kind: 'named', key: 'arrakeen', source } }];
    const projection = projectRulebookAssetExplainerAnnotations(original);
    const svg = composeRulebookAssetExplainerSvg({
      projection,
      imageDataUrl: `data:image/svg+xml;base64,${btoa(resolveRulebookBoardIllustration(board.id)!.svg)}`,
    });
    expect(svg).toContain('data-rulebook-highlight="NAME"');
    expect(svg).toContain('matrix(');
    expect(svg).toContain('data:image/svg+xml;base64,');
    expect(() =>
      composeRulebookAssetExplainerSvg({
        /* This negative fixture proves script-bearing SVG input is rejected before rendering. */
        /* nosemgrep: javascript.lang.security.audit.unknown-value-with-script-tag.unknown-value-with-script-tag */
        projection,
        imageDataUrl: `data:image/svg+xml;base64,${btoa('<svg><script>alert(1)</script></svg>')}`,
      })
    ).toThrow('Unsafe annotated source image');
  });

  it('contains markers at image edges and puts missing-target notices outside the image', () => {
    const original = block();
    if (original.source.status !== 'ready') {
      throw new Error('Expected the ready source');
    }
    original.source.geometry!.parts = [];
    const projection = projectRulebookAssetExplainerAnnotations(original);
    const canvas = rulebookAnnotationCanvas(projection);
    const marker = rulebookAnnotationShapes(projection).find(({ tag }) => tag === 'circle')!;
    expect(Number(marker.attributes.cx) - Number(marker.attributes.r)).toBeGreaterThan(-canvas.padding);
    expect(Number(marker.attributes.cy) + Number(marker.attributes.r)).toBeLessThan(projection.height + canvas.padding);
    const notice = rulebookAnnotationShapes(projection).find(({ text }) => text === 'Unavailable markers: 1')!;
    expect(Number(notice.attributes.y)).toBeGreaterThan(projection.height + canvas.padding);
  });

  it('bounds repeated highlights before constructing an oversized SVG', () => {
    const original = block();
    const board = { kind: 'board', boardId: 'arrakis' } as const;
    const path = `M0 0 ${'L0.123456 0.123456 '.repeat(1000)}`;
    original.source = {
      status: 'ready',
      reference: board,
      name: 'Board',
      imageUrl: '/board.svg',
      geometry: {
        width: 600,
        height: 600,
        parts: [{ key: 'name', x: 0, y: 0, width: 1, height: 1, highlight: { paths: [{ d: path }, { d: path }] } }],
      },
    };
    original.items = Array.from({ length: 128 }, (_, index) => ({
      ...original.items[0]!,
      id: String(index),
      target: { kind: 'named', key: 'name', source: board },
    }));
    const projection = projectRulebookAssetExplainerAnnotations(original);
    expect(projection.entries[0]!.status).toBe('ready');
    expect(() => composeRulebookAssetExplainerSvg({ projection, imageDataUrl: 'data:image/jpeg;base64,AAAA' })).toThrow(
      'Annotated illustration exceeds the delivery limit'
    );
  });

  it('keeps retained image bytes hidden after removal and identifies unavailable targets', () => {
    const original = block();
    const projection = projectRulebookAssetExplainerAnnotations({
      ...original,
      source: { status: 'unavailable', reference },
    });
    const svg = composeRulebookAssetExplainerSvg({ projection, imageDataUrl: 'data:image/jpeg;base64,AAAA' });
    expect(svg).not.toContain('<image');
    expect(svg).not.toContain('data-rulebook-marker');
    expect(svg).toContain('Source unavailable');
  });
});
