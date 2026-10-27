import { testingPreview } from '@sb/preview';
import { finishTransitions, waitForFrame } from '@sb/storyWaits';
import { snapshotFactionLabels } from '@shared/play/factionLabels';
import { expect, userEvent, within } from 'storybook/test';

import type { TableProjection } from '../../../../db/tabletop/TableSession';
import { alliancesSnapshot, faction } from '../alliances.stories.fixture';
import { FactionTokenGroup } from './FactionTokenFace';

/* The group reads only the table's snapshot: its token faces and faction colours. */
const snapshot = alliancesSnapshot();
const table = { snapshot } as TableProjection;
const allies = [faction(snapshot, 'seat-4'), faction(snapshot, 'seat-5')];

const meta = testingPreview.meta({
  component: FactionTokenGroup,
  args: { table, factionIds: allies, names: snapshotFactionLabels(snapshot), size: 26 },
});

/** Hovering a token opens a tooltip with its faction's name. */
export const NamesOnHover = meta.story({
  play: async ({ canvasElement, args }) => {
    const page = within(canvasElement.ownerDocument.body);
    const name = args.names[allies[1]!]!;
    await userEvent.hover(within(canvasElement).getByRole('img', { name }));
    const tooltip = await waitForFrame(() => page.getByRole('tooltip', { name }));
    /* The tooltip mounts transparent and fades in, so the check finishes the fade rather than waiting for the frames that draw it. */
    await waitForFrame(() => expect(finishTransitions(tooltip)).toBeVisible());
  },
});
