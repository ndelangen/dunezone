import { testingPreview } from '@sb/preview';
import { expect, userEvent } from 'storybook/test';

import {
  alliancesPanelMeta,
  alliancesProps,
  alliedSnapshot,
  everyActionSnapshot,
  seatFaction as seat,
} from './AlliancesPanel.stories.fixture';

const meta = testingPreview.meta({ ...alliancesPanelMeta, title: 'Play/Panels/Alliances' });

/** Each row's action sends its command for that row's faction: accept seat 1's offer, take back the offer to seat 3, offer seat 6 one. */
export const SendsEachAction = meta.story({
  args: alliancesProps(everyActionSnapshot()),
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Accept alliance' }));
    await expect(args.onAction).toHaveBeenCalledWith(seat('seat-1'), 'alliance-accept');
    await userEvent.click(canvas.getByRole('button', { name: 'Withdraw alliance offer' }));
    await expect(args.onAction).toHaveBeenCalledWith(seat('seat-3'), 'alliance-withdraw');
    await userEvent.click(canvas.getByRole('button', { name: 'Offer alliance' }));
    await expect(args.onAction).toHaveBeenCalledWith(seat('seat-6'), 'alliance-offer');
  },
});

/** The alliance is broken from the ally's row. */
export const BreaksTheAlliance = meta.story({
  args: alliancesProps(alliedSnapshot()),
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Break alliance' }));
    await expect(args.onAction).toHaveBeenCalledWith(seat('seat-4'), 'alliance-break');
  },
});
