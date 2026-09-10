import { describe, expect, it } from 'vitest';

import {
  composeRulebookAssetExplainerSvg,
  projectRulebookAssetExplainerAnnotations,
  rulebookAnnotationCanvas,
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

describe('AssetExplainer SVG composition', () => {
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
