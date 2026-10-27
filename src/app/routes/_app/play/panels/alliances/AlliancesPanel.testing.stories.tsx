import { testingPreview } from '@sb/preview';
import { expect, userEvent } from 'storybook/test';

import { alliancesSnapshot, faction } from '../../alliances.stories.fixture';
import {
  alliancesPanelMeta,
  alliancesProps,
  alliedSnapshot,
  finishedSnapshot,
  observerProps,
  offeringSnapshot,
} from './AlliancesPanel.stories.fixture';

const meta = testingPreview.meta({ ...alliancesPanelMeta, title: 'Play/Panels/Alliances' });

const seat = (name: string) => faction(alliancesSnapshot(), name);

/** The offer is accepted in its faction's row; there is no button to decline it. */
export const AcceptsAnOffer = meta.story({
  play: async ({ args, canvas }) => {
    await expect(canvas.getByText('Offers you an alliance')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Accept' }));
    await expect(args.onAction).toHaveBeenCalledWith(seat('seat-1'), 'alliance-accept');
    await expect(canvas.queryByRole('button', { name: 'Decline' })).toBeNull();
  },
});

/** The viewer's own faction has no row; only a faction outside any alliance can be offered one. */
export const OffersAnAlliance = meta.story({
  play: async ({ args, canvas }) => {
    await expect(canvas.queryByText(/House Harkonnen/)).toBeNull();
    await expect(canvas.getAllByText(/ · /)).toHaveLength(5);
    const offers = canvas.getAllByRole('button', { name: 'Offer alliance' });
    await expect(offers).toHaveLength(2);
    await userEvent.click(offers[0]!);
    await expect(args.onAction).toHaveBeenCalledWith(seat('seat-3'), 'alliance-offer');
  },
});

/** A waiting offer reads Offering…; clicking it again withdraws the offer. */
export const OfferingWithdrawsWhenClicked = meta.story({
  args: alliancesProps(offeringSnapshot()),
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Offering…' }));
    await expect(args.onAction).toHaveBeenCalledWith(seat('seat-3'), 'alliance-withdraw');
    await expect(canvas.getAllByRole('button', { name: 'Offer alliance' })).toHaveLength(1);
  },
});

/** An ally's token beside a faction's status is an image named after it, the name its tooltip shows. */
export const AlliesNamedByToken = meta.story({
  play: async ({ canvas }) => {
    const allied = canvas.getByText('Allied with Fremen').parentElement!;
    await expect(allied.querySelector('[role="img"][aria-label="Fremen"]')).not.toBeNull();
  },
});

/** The viewer breaks the alliance from their ally's row, and can offer no other alliance until they do. */
export const BreaksTheAlliance = meta.story({
  args: alliancesProps(alliedSnapshot()),
  play: async ({ args, canvas }) => {
    await expect(canvas.getByText('Your ally')).toBeVisible();
    await expect(canvas.queryByRole('button', { name: /Offer alliance|Accept/ })).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: 'Break alliance' }));
    await expect(args.onAction).toHaveBeenCalledWith(seat('seat-4'), 'alliance-break');
  },
});

/** For the moment the table reconnects, or while the viewer steps through the replay, every action is greyed out. */
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
    await expect(canvas.queryByRole('button', { name: /Offer alliance|Accept|Offering…|Break alliance/ })).toBeNull();
  },
});

/** An observer sees every alliance and no buttons at all, not even greyed-out ones. */
export const ObserverSeesNoActions = meta.story({
  args: observerProps(),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Allied with Fremen')).toBeVisible();
    await expect(canvas.queryByRole('button', { name: /Offer alliance|Accept|Offering…|Break alliance/ })).toBeNull();
    await expect(canvas.getAllByText(/ · /)).toHaveLength(6);
  },
});
