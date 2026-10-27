import { testingPreview } from '@sb/preview';
import { finishTransitions, waitForFrame } from '@sb/storyWaits';
import { snapshotFactionLabels } from '@shared/play/factionLabels';
import { expect, userEvent, within } from 'storybook/test';

import { alliancesSnapshot, faction } from '../alliances.stories.fixture';
import { tableOf } from '../panels/PanelWindow.stories.fixture';
import { factionToken, FactionTokenGroup } from './FactionTokenFace';

/* Two allies' tokens as the table has them: their faces, faction colours and names. */
const snapshot = alliancesSnapshot();
const names = snapshotFactionLabels(snapshot);
const tokens = [faction(snapshot, 'seat-4'), faction(snapshot, 'seat-5')].map((id) =>
  factionToken(tableOf(snapshot), id, names)
);

const meta = testingPreview.meta({ component: FactionTokenGroup, args: { tokens, size: 26 } });

/** Hovering a token opens a tooltip with its faction's name. */
export const NamesOnHover = meta.story({
  play: async ({ canvasElement, args }) => {
    const page = within(canvasElement.ownerDocument.body);
    const name = args.tokens[1]!.name;
    await userEvent.hover(within(canvasElement).getByRole('img', { name }));
    const tooltip = await waitForFrame(() => page.getByRole('tooltip', { name }));
    /* The tooltip mounts transparent and fades in, so the check finishes the fade rather than waiting for the frames that draw it. */
    await waitForFrame(() => expect(finishTransitions(tooltip)).toBeVisible());
  },
});
