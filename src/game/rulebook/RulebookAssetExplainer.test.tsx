// @vitest-environment jsdom

import {
  projectRulebookAssetExplainerAnnotations,
  rulebookAnnotationShapes,
} from '@shared/rulebooks/assetExplainerAnnotations';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RulebookAssetExplainer } from './RulebookAssetExplainer';
import { incompleteExplainerFixture, leaderExplainerFixture } from './RulebookAssetExplainer.stories.fixture';

describe('Rulebook AssetExplainer rendering', () => {
  it('uses shared marker positions with one complete legend and keeps annotation lines separate from token outlines', () => {
    const block = leaderExplainerFixture();
    const { container } = render(<RulebookAssetExplainer block={block} />);
    const projected = rulebookAnnotationShapes(projectRulebookAssetExplainerAnnotations(block)).filter(
      ({ tag }) => tag === 'circle'
    );
    const rendered = [...container.querySelectorAll('[data-rulebook-marker]')];
    expect(rendered).toHaveLength(4);
    expect(rendered.map((circle) => [Number(circle.getAttribute('cx')), Number(circle.getAttribute('cy'))])).toEqual(
      projected.map(({ attributes }) => [attributes.cx, attributes.cy])
    );
    expect(new Set(rendered.map((circle) => `${circle.getAttribute('cx')},${circle.getAttribute('cy')}`)).size).toBe(4);
    expect(container.querySelectorAll('line')).toHaveLength(4);
    expect(container.querySelectorAll('path')).toHaveLength(0);
    expect(container.querySelector('image')?.getAttribute('clip-path')).toBe('circle(50%)');
    expect(container.querySelectorAll('ol')).toHaveLength(1);
    expect(container.querySelectorAll('li')).toHaveLength(4);
    expect(container.querySelectorAll('h2')).toHaveLength(0);
  });

  it('keeps unavailable explanations and custom label contrast alongside the remaining markers', () => {
    const block = incompleteExplainerFixture();
    const { container } = render(<RulebookAssetExplainer block={block} />);
    expect(container.querySelectorAll('[data-rulebook-marker]')).toHaveLength(2);
    expect(container.querySelectorAll('li')).toHaveLength(4);
    expect(container.querySelector('[data-target-status="part-unavailable"]')?.textContent).toContain('Add this value');
    expect(container.querySelector('[data-target-status="source-replaced"]')?.textContent).toContain('another Leader');
    const badge = container.querySelector<HTMLElement>('[data-rulebook-item-id="MARK"] .rulebookExplainerBadge')!;
    expect(badge.style.color).toBe('rgb(0, 0, 0)');
  });

  it('measures intrinsic artwork before positioning markers and measures again when its URL changes', () => {
    const original = leaderExplainerFixture();
    const reference = { kind: 'stock' as const, artworkId: 'illustration.png' };
    const block = {
      ...original,
      source: { status: 'ready' as const, reference, name: 'Artwork', imageUrl: '/illustration.png' },
      items: [{ ...original.items[0]!, target: { kind: 'position' as const, x: 0.75, y: 0.25, source: reference } }],
    };
    const { container, rerender } = render(<RulebookAssetExplainer block={block} />);
    const loadArtwork = (width: number, height: number) => {
      const image = container.querySelector('img')!;
      Object.defineProperties(image, { naturalWidth: { value: width }, naturalHeight: { value: height } });
      fireEvent.load(image);
    };
    expect(container.querySelector('svg')).toBeNull();
    loadArtwork(800, 400);
    expect(container.querySelector('image')?.getAttribute('width')).toBe('800');
    expect(container.querySelector('image')?.getAttribute('height')).toBe('400');
    expect(container.querySelector('[data-rulebook-marker]')?.getAttribute('cx')).toBe('600');
    expect(container.querySelector('[data-rulebook-marker]')?.getAttribute('cy')).toBe('100');
    rerender(<RulebookAssetExplainer block={{ ...block, source: { ...block.source, imageUrl: '/updated.png' } }} />);
    expect(container.querySelector('svg')).toBeNull();
    loadArtwork(300, 900);
    expect(container.querySelector('[data-rulebook-marker]')?.getAttribute('cx')).toBe('225');
    expect(container.querySelector('[data-rulebook-marker]')?.getAttribute('cy')).toBe('225');
  });

  it('uses the stable exported illustration URL while keeping the full captured explanation text', () => {
    const block = leaderExplainerFixture();
    const { container } = render(
      <RulebookAssetExplainer
        block={{
          ...block,
          illustrationUrl: '/published/rulebooks/book/editions/1/pages/PAGE/blocks/EXPL/illustration.svg',
        }}
      />
    );
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('img')?.getAttribute('src')).toContain(
      '/editions/1/pages/PAGE/blocks/EXPL/illustration.svg'
    );
    expect(container.querySelectorAll('li')).toHaveLength(4);
    expect(container.textContent).toContain(block.items[0]!.text);
  });
});
