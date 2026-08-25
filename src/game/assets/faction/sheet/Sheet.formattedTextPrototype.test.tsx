// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../leader/Leader', () => ({
  LeaderToken: () => <div data-test-leader-token />,
}));
vi.mock('../token/Token', () => ({
  Token: () => <div data-test-faction-token />,
}));
vi.mock('../troop/Troop', () => ({
  TroopToken: () => <div data-test-troop-token />,
}));

import { assetPublishingFaction } from '@shared/factions/fixtures/assetPublishingFaction';
import { FactionRender } from '@shared/factions/schema';

import { PrototypeFormattedTextProvider } from '../../../components/block/MarkdownContent';
import { FactionSheetPage1 } from './Sheet';

describe('FactionSheet formatted-text prototype', () => {
  it('renders setup and revival as marks-only inline fields', () => {
    const props = FactionRender.sheet.parse(structuredClone(assetPublishingFaction));
    props.rules.startText = 'Keep the first line\nflowing on the second with *bold words*.';
    props.rules.revivalText = '1 *free* revival.';

    const { container } = render(
      <PrototypeFormattedTextProvider mode="formatted-text">
        <FactionSheetPage1 {...props} />
      </PrototypeFormattedTextProvider>
    );

    const start = container.querySelector('[data-faction-start-instructions]');
    const revival = screen.getByText('Revival:').parentElement;

    expect(start?.textContent).toBe('Keep the first line flowing on the second with bold words.');
    expect(start?.querySelectorAll('p, ul, br')).toHaveLength(0);
    expect(screen.getAllByText('bold words')).toHaveLength(1);
    expect(revival?.textContent).toBe('Revival: 1 free revival.');
    expect(revival?.querySelectorAll('p, ul, br')).toHaveLength(0);
    expect(screen.getAllByText('free')).toHaveLength(1);
  });
});
