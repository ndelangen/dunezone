import { testingPreview } from '@sb/preview';
import { snapshotFactionLabels } from '@shared/play/factionLabels';
import { expect, within } from 'storybook/test';

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

/** Each token is an image named after its faction, the name its tooltip shows on hover. */
export const NamedByFaction = meta.story({
  play: async ({ canvasElement, args }) => {
    for (const token of args.tokens) {
      await expect(within(canvasElement).getByRole('img', { name: token.name })).toBeVisible();
    }
  },
});
