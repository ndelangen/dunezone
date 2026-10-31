import preview from '@sb/preview';
import { publishingRectangleTokenFace } from '@shared/assets/fixtures/publishingRectangleTokenFace';
import { expect, within } from 'storybook/test';

import { asset, db, ref } from '@db/storybook';

import { pageStoryMeta } from '../../storybookConfig';
import { creatable, creatableDatabase, chooseRuleset, typeCustomName } from './create.route.stories.fixture';

const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Play/Create',
  args: { path: '/play/create' },
});

/** A reserved address is advice, never a validation error. */
export const DuplicateName = meta.story({
  parameters: creatable,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await chooseRuleset(page);
    await typeCustomName(page, 'Arrakeen picnic');
    await expect(page.findByText(/You can keep the name/, {}, { timeout: 10_000 })).resolves.toBeVisible();
    await expect(page.getByLabelText('Custom name')).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('button', { name: 'Create game' })).toBeEnabled();
  },
});

/** A slotted bundle the table cannot take, as GF9's empty Homeworld Reserves was: the pass names it before Create game, not the table after. */
export const RulesetTheTableCannotTake = meta.story({
  parameters: {
    ...creatable,
    database: db((baseline) => {
      creatableDatabase(baseline);
      const reserves = asset({
        type: 'bundle',
        data: {
          name: 'Homeworld Reserves',
          about: 'Nothing in it yet.',
          band: { background: publishingRectangleTokenFace.background, label: 'RESERVES' },
        },
      });
      baseline.assets.push(reserves);
      baseline.ruleset_asset_slots.push({
        ruleset_id: ref(baseline.rulesets[0]!.$key!),
        asset_id: ref(reserves.$key!),
        slot: 'customTokens',
      });
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await chooseRuleset(page);
    /* Under the ruleset field, and on the option in its list. */
    const named = await page.findAllByText(
      'Custom token bundles: Homeworld Reserves: Add playable members before requesting this asset.'
    );
    await expect(named.find((element) => !element.closest('[role="listbox"]'))).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create game' })).toBeDisabled();
  },
});
