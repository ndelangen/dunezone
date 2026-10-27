import { testingPreview } from '@sb/preview';
import { expect, userEvent } from 'storybook/test';

import { alliancesSnapshot, faction, VIEWER } from '../../alliances.stories.fixture';
import { alliancesPanelMeta, alliancesProps, alliedSnapshot, finishedSnapshot } from './AlliancesPanel.stories.fixture';

const meta = testingPreview.meta({ ...alliancesPanelMeta, title: 'Play/Panels/Alliances' });

const seat = (name: string) => faction(alliancesSnapshot(), name);

/** The offer is answered in its faction's row. */
export const AcceptsAnOffer = meta.story({
  play: async ({ args, canvas }) => {
    await expect(canvas.getByText('Offers you an alliance')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Accept' }));
    await expect(args.onAction).toHaveBeenCalledWith(seat('seat-1'), 'alliance-accept');
    await userEvent.click(canvas.getByRole('button', { name: 'Decline' }));
    await expect(args.onAction).toHaveBeenCalledWith(seat('seat-1'), 'alliance-decline');
  },
});

/** Any faction without an alliance can be offered one; the viewer's own row and the offering faction's row have none. */
export const OffersAnAlliance = meta.story({
  play: async ({ args, canvas }) => {
    await expect(canvas.getByText('Your faction')).toBeVisible();
    const offers = canvas.getAllByRole('button', { name: 'Offer alliance' });
    await expect(offers).toHaveLength(4);
    await userEvent.click(offers[0]!);
    await expect(args.onAction).toHaveBeenCalledWith(seat('seat-3'), 'alliance-offer');
  },
});

/** An ally's token beside a faction's status is an image named after it, the name its tooltip shows. */
export const AlliesNamedByToken = meta.story({
  play: async ({ canvas }) => {
    const allied = canvas.getByText('Allied with Fremen').parentElement!;
    await expect(allied.querySelector('[role="img"][aria-label="Fremen"]')).not.toBeNull();
  },
});

/** The viewer breaks their own alliance from their own row. */
export const BreaksTheAlliance = meta.story({
  args: alliancesProps(alliedSnapshot()),
  play: async ({ args, canvas }) => {
    await expect(canvas.getByText('Your ally')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Break alliance' }));
    await expect(args.onAction).toHaveBeenCalledWith(seat(VIEWER), 'alliance-break');
  },
});

/** While the viewer may not act, as while reconnecting, every action is greyed out. */
export const DisabledWhileTheViewerCannotAct = meta.story({
  args: { ...alliancesProps(), disabled: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Accept' })).toBeDisabled();
    for (const button of canvas.getAllByRole('button', { name: 'Offer alliance' })) {
      await expect(button).toBeDisabled();
    }
  },
});

/** Once the game is finished, nobody can change an alliance. */
export const FinishedIsReadOnly = meta.story({
  args: alliancesProps(finishedSnapshot()),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Offers you an alliance')).toBeVisible();
    await expect(
      canvas.queryByRole('button', { name: /Offer alliance|Accept|Withdraw offer|Break alliance/ })
    ).toBeNull();
  },
});
