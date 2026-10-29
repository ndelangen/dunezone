import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { expectDenied } from './rulebooks-creation.stories.fixture';
import { rulebooksMeta } from './rulebooks.stories.fixture';

const meta = preview.meta({
  ...rulebooksMeta,
  title: 'Rulesets/Rulebooks/Creation',
});

export const Creation = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/create' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('radio', { name: 'A4 210 × 297 mm' }, { timeout: 30_000 })).resolves.toBeChecked();
    await expect(page.getByRole('radio', { name: 'Illustrated classic' })).toBeChecked();
  },
});

export const Outsider = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/create' },
  parameters: { identity: { subjectKey: 'outsider', name: 'Outsider' } },
  play: async ({ canvasElement }) => expectDenied(canvasElement),
});
