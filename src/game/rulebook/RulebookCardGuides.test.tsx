// @vitest-environment jsdom

import { projectRulebookDraftRenderBlock } from '@shared/rulebooks/projectRenderDocument';
import type { RulebookRenderBlockV1 } from '@shared/rulebooks/renderDocument';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RulebookBlockCanvas } from './RulebookBlockRenderer';
import { cardEntryFixture, cardGroupFixture, cardGuideAssets } from './RulebookCardGuides.stories.fixture';

describe('Rulebook Card guides', () => {
  it('keeps member headings at Block depth when the group heading is empty', () => {
    const block = projectRulebookDraftRenderBlock({ ...cardGroupFixture(), title: '' }, cardGuideAssets);
    const { container } = render(<RulebookBlockCanvas block={block} />);
    expect([...container.querySelectorAll('h3')].map((heading) => heading.textContent)).toEqual([
      'Supplies!',
      'Ernoc Seed!',
      'Trishula!',
    ]);
    expect(container.querySelector('h4')).toBeNull();
  });

  it('updates the referenced Card heading and image while keeping the authored guidance and anchor', () => {
    const draft = cardEntryFixture();
    const block = projectRulebookDraftRenderBlock(draft, cardGuideAssets);
    if (block.kind !== 'card-entry' || block.source.status !== 'ready') {
      throw new Error('Expected a ready Card entry');
    }
    const { container, rerender } = render(<RulebookBlockCanvas block={block} />);
    expect(container.querySelector('#supplies-card h3')?.textContent).toBe('Supplies!');
    const updated = {
      ...block,
      source: { ...block.source, name: 'Updated Supplies!', imageUrl: '/published/cards/updated/card.jpg' },
    } satisfies RulebookRenderBlockV1;
    rerender(<RulebookBlockCanvas block={updated} />);
    expect(container.querySelector('#supplies-card h3')?.textContent).toBe('Updated Supplies!');
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/published/cards/updated/card.jpg');
    expect(container.textContent).toContain(draft.text);
    expect(container.textContent).toContain('Quantity: 1');
  });

  it('renders each member once in authored order and follows the featured identity through reorder and removal', () => {
    const block = projectRulebookDraftRenderBlock(cardGroupFixture('featured-member'), cardGuideAssets);
    if (block.kind !== 'card-group') {
      throw new Error('Expected a Card group');
    }
    const { container, rerender } = render(<RulebookBlockCanvas block={block} />);
    const itemIds = () =>
      [...container.querySelectorAll('[data-rulebook-item-id]')].map((item) =>
        item.getAttribute('data-rulebook-item-id')
      );
    expect(itemIds()).toEqual(['SUPL', 'SEED', 'TRSH']);
    rerender(<RulebookBlockCanvas block={{ ...block, items: [...block.items].reverse() }} />);
    expect(itemIds()).toEqual(['TRSH', 'SEED', 'SUPL']);
    expect(container.querySelector('[data-card-featured]')?.getAttribute('data-rulebook-item-id')).toBe('SUPL');
    expect(container.querySelectorAll('h4')).toHaveLength(3);
    const removed = block.items.filter((item) => item.id !== 'SUPL');
    rerender(<RulebookBlockCanvas block={{ ...block, items: removed, featuredItemId: undefined }} />);
    expect(itemIds()).toEqual(['SEED', 'TRSH']);
    expect(container.querySelector('[data-card-featured]')).toBeNull();
    expect(container.querySelectorAll('h4')).toHaveLength(2);
  });

  it('keeps unavailable and unselected members, their guidance and zero quantities visible', () => {
    const block = projectRulebookDraftRenderBlock(cardGroupFixture('gallery'), {});
    if (block.kind !== 'card-group') {
      throw new Error('Expected a Card group');
    }
    block.items[0]!.quantity = 0;
    block.items[1]!.source = { status: 'unselected' };
    const { container, rerender } = render(<RulebookBlockCanvas block={block} />);
    expect(container.querySelectorAll('[data-rulebook-item-id]')).toHaveLength(3);
    expect(container.querySelector('[data-rulebook-item-id="SUPL"]')?.textContent).toContain('Quantity: 0');
    expect(container.querySelector('[data-rulebook-item-id="SUPL"]')?.textContent).toContain(block.items[0]!.text);
    expect(container.querySelector('[data-rulebook-item-id="SEED"]')?.textContent).toContain('No source selected');
    expect(container.querySelector('[data-rulebook-item-id="TRSH"]')?.textContent).toContain('Source unavailable');
    rerender(<RulebookBlockCanvas block={{ ...block, items: [], featuredItemId: undefined }} />);
    expect(container.querySelector('ul')).toBeNull();
    expect(container.textContent).toContain(block.title);
    expect(container.textContent).toContain(block.text);
  });
});
