import { testingPreview } from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { expect, userEvent, within } from 'storybook/test';

import { db } from '@db/storybook';

import { expectWithinWidth } from '../../pagePlay';
import { expectDenied } from './rulebooks-creation.stories.fixture';
import {
  replaceWithFinalContents,
  rulebooksMeta,
  withFailedRulebookPreview,
  withFinalRulebooks,
  withSizedRulebooks,
  withRulebooks,
} from './rulebooks.stories.fixture';

const meta = testingPreview.meta({
  ...rulebooksMeta,
  title: 'Rulesets/Rulebooks/Creation',
});

export const CreateTallRestrained = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/create' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.type(
      await page.findByRole('textbox', { name: 'Rulebook name' }, { timeout: 30_000 }),
      'Tall rules'
    );
    await userEvent.click(page.getByRole('radio', { name: 'Tall 105 × 297 mm' }));
    await userEvent.click(page.getByRole('radio', { name: 'Restrained expansion' }));
    await userEvent.click(page.getByRole('button', { name: 'Create Rulebook' }));
    await expect(page.findByRole('button', { name: 'Save' }, { timeout: 30_000 })).resolves.toBeDisabled();
    const preview = page.getByRole('article', { name: 'Rulebook page: Introduction' });
    await expect(preview).toHaveAttribute('data-rulebook-size', 'tall');
    await expect(preview).toHaveAttribute('data-rulebook-design', 'restrained');
    await expect(preview).toHaveAttribute('data-rulebook-page-number', '1');
    await expect(page.queryByRole('radiogroup', { name: 'Rulebook Size' })).not.toBeInTheDocument();
  },
});

export const CloneKeepsSize = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/create' },
  parameters: { database: db(withSizedRulebooks) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('radio', { name: 'Saved Rulebook' }, { timeout: 30_000 }));
    await userEvent.click(page.getByRole('combobox', { name: 'Rulebook to copy' }));
    await userEvent.click(await page.findByRole('option', { name: 'Quick reference' }));
    await expect(page.queryByRole('radiogroup', { name: 'Rulebook Size' })).not.toBeInTheDocument();
    await expect(page.getByText('This copy keeps the Tall size, 105 × 297 mm.')).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Restrained expansion' })).toBeChecked();
    await userEvent.click(page.getByRole('radio', { name: 'Illustrated classic' }));
    await userEvent.type(page.getByRole('textbox', { name: 'Rulebook name' }), 'Illustrated copy');
    await userEvent.click(page.getByRole('button', { name: 'Create Rulebook' }));
    await expect(page.findByRole('button', { name: 'Save' }, { timeout: 30_000 })).resolves.toBeDisabled();
    const preview = page.getByRole('article', { name: 'Rulebook page: Introduction' });
    await expect(preview).toHaveAttribute('data-rulebook-size', 'tall');
    await expect(preview).toHaveAttribute('data-rulebook-design', 'illustrated');
  },
});

export const CloneSavedSettings = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/create' },
  parameters: {
    database: db((baseline) => {
      withSizedRulebooks(baseline);
      const source = baseline.rulebooks.find((book) => book.$key === 'rulebook:1')!;
      source.settings = { size: 'gf9-core', design: 'illustrated' };
      return baseline;
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('radio', { name: 'Saved Rulebook' }, { timeout: 30_000 }));
    await userEvent.click(page.getByRole('combobox', { name: 'Rulebook to copy' }));
    const choice = await page.findByRole('option', { name: 'Quick reference' });
    const tile = within(choice).getByRole('img', {
      name: 'First page of Quick reference: preview unavailable',
      hidden: true,
    });
    const bounds = tile.getBoundingClientRect();
    await expect(bounds.height / bounds.width).toBeCloseTo(297 / 105, 1);
    await userEvent.click(choice);
    await expect(page.getByText('This copy keeps the GF9 core size, 254 × 254 mm.')).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Illustrated classic' })).toBeChecked();
    await userEvent.type(page.getByRole('textbox', { name: 'Rulebook name' }), 'Saved settings copy');
    await userEvent.click(page.getByRole('button', { name: 'Create Rulebook' }));
    await expect(page.findByRole('button', { name: 'Save' }, { timeout: 30_000 })).resolves.toBeDisabled();
    const preview = page.getByRole('article', { name: 'Rulebook page: Introduction' });
    await expect(preview).toHaveAttribute('data-rulebook-size', 'gf9-core');
    await expect(preview).toHaveAttribute('data-rulebook-design', 'illustrated');
  },
});

export const Clone = meta.story({
  parameters: { database: db(withFinalRulebooks) },
  args: { path: '/rulesets/classicrules/rulebooks/create' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('radio', { name: 'Saved Rulebook' }, { timeout: 30_000 }));
    await userEvent.click(page.getByRole('combobox', { name: 'Rulebook to copy' }));
    const rules = await page.findByRole('option', { name: 'Rules' });
    await expect(page.queryByRole('option', { name: 'Deleted Rulebook' })).toBeNull();
    /* The 32 px tile is too narrow for the missing state to print the name, so it names the Rulebook on hover. */
    const tile = within(rules).getByRole('img', { name: 'First page of Rules: preview unavailable', hidden: true });
    await userEvent.hover(tile);
    await waitForFrame(() => expect(page.getByRole('tooltip')).toHaveTextContent(/^Rules$/));
    await userEvent.unhover(tile);
    await waitForFrame(() => expect(page.queryByRole('tooltip')).toBeNull());
    await userEvent.click(rules);
    await userEvent.type(page.getByRole('textbox', { name: 'Rulebook name' }), 'Copied rules');
    await userEvent.click(page.getByRole('button', { name: 'Create Rulebook' }));
    const save = await page.findByRole('button', { name: 'Save' }, { timeout: 30_000 });
    await expect(save).toBeDisabled();
    /* The draft's revision is part of what Save says about the work, not a status of its own. */
    await expect(save).toHaveAccessibleDescription(expect.stringContaining('Draft revision 1'));
  },
});

/**
 * A failed capture's placeholder names the Rulebook in a tooltip of its own, so the chooser leaves its tooltip off that tile.
 * Hovering it opens one tooltip, not two.
 */
export const CloneFailedPreview = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/create' },
  parameters: {
    database: db((baseline) => {
      withFailedRulebookPreview(baseline);
      replaceWithFinalContents(baseline);
      return baseline;
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('radio', { name: 'Saved Rulebook' }, { timeout: 30_000 }));
    await userEvent.click(page.getByRole('combobox', { name: 'Rulebook to copy' }));
    const rules = await page.findByRole('option', { name: 'Rules' });
    const tile = await within(rules).findByRole(
      'img',
      { name: 'First-page preview failed for Rules', hidden: true },
      { timeout: 30_000 }
    );
    await userEvent.hover(tile);
    await waitForFrame(() =>
      expect(page.getAllByRole('tooltip').map((tooltip) => tooltip.textContent)).toEqual([
        'First-page preview failed for Rules',
      ])
    );
  },
});

export const MemberCreation = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/create' },
  parameters: { identity: { subjectKey: 'member', name: 'Member' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.type(
      await page.findByRole('textbox', { name: 'Rulebook name' }, { timeout: 30_000 }),
      'Member rules'
    );
    await userEvent.click(page.getByRole('button', { name: 'Create Rulebook' }));
    await expect(page.findByRole('button', { name: 'Save' }, { timeout: 30_000 })).resolves.toBeDisabled();
  },
});

export const SignedOut = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/create' },
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('link', { name: 'Log in' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.queryByRole('textbox', { name: 'Rulebook name' })).toBeNull();
  },
});

/** At 260 px the size and design choices stay inside the width. */
export const CreationNarrow = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/create' },
  globals: { viewport: { value: 'contentNarrow' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole('radio', { name: 'A4 210 × 297 mm' }, { timeout: 30_000 });
    const choices = page.getAllByRole('radio').map((radio) => radio.closest('label') ?? radio);
    await expectWithinWidth(canvasElement, choices);
  },
});

export const InactiveMember = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/create' },
  parameters: {
    identity: { subjectKey: 'member', name: 'Member' },
    database: db((baseline) => {
      withRulebooks(baseline);
      baseline.group_members[baseline.group_members.length - 1].status = 'removed';
    }),
  },
  play: async ({ canvasElement }) => expectDenied(canvasElement),
});
