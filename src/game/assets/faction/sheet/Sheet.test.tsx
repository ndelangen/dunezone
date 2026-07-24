// @vitest-environment jsdom

import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../components/block/MarkdownContent', () => ({
  MarkdownContent: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
vi.mock('../leader/Leader', () => ({
  LeaderToken: () => <div data-test-leader-token />,
}));
vi.mock('../token/Token', () => ({
  Token: () => <div data-test-faction-token />,
}));
vi.mock('../troop/Troop', () => ({
  TroopToken: () => <div data-test-troop-token />,
}));

import { assetPublishingFaction } from '../../../fixtures/assetPublishingFaction';
import { FactionRender } from '../../../schema/faction';
import { FactionSheetPage1, FactionSheetPage2 } from './Sheet';

function factionSheetProps() {
  return FactionRender.sheet.parse(structuredClone(assetPublishingFaction));
}

describe('FactionSheet', () => {
  it.each([
    1, 10, 99,
  ])('renders starting spice %i as structured At start information', (spiceCount) => {
    const props = factionSheetProps();
    props.rules.spiceCount = spiceCount;
    props.rules.startText = 'Keep this authored instruction separate.';
    props.rules.advantages = [];

    const { container } = render(<FactionSheetPage1 {...props} />);
    const startingSpice = container.querySelector('[data-faction-starting-spice]');
    const instructions = container.querySelector('[data-faction-start-instructions]');

    expect(startingSpice?.textContent).toBe(`Starting spice: ${spiceCount}`);
    expect(instructions?.textContent).toBe('Keep this authored instruction separate.');
  });

  it('renders one compact physical-supply count for each ordinary troop type', () => {
    const props = factionSheetProps();
    props.troops = [
      {
        ...props.troops[0],
        name: 'Regular troop',
        count: 20,
      },
      {
        ...props.troops[0],
        name: 'A deliberately long ceremonial household guard troop name',
        count: 5,
      },
    ];

    const { container } = render(<FactionSheetPage2 {...props} />);
    const supplies = [...container.querySelectorAll('[data-faction-troop-supply]')];

    expect(supplies.map((supply) => supply.textContent)).toEqual(['×20', '×5']);
  });

  it('renders a reversible troop supply once for its shared physical token', () => {
    const props = factionSheetProps();
    props.troops = [
      {
        ...props.troops[0],
        name: 'Front face',
        count: 7,
        back: {
          image: props.troops[0].image,
          name: 'Back face',
          description: 'The reverse side of the same seven tokens.',
        },
      },
    ];

    const { container } = render(<FactionSheetPage2 {...props} />);
    const supplies = [...container.querySelectorAll('[data-faction-troop-supply]')];

    expect(container.textContent).toContain('Front face');
    expect(container.textContent).toContain('Back face');
    expect(supplies).toHaveLength(1);
    expect(supplies[0]?.textContent).toBe('×7');
  });
});
