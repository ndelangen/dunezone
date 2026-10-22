import preview from '@sb/preview';
import { cardbackPresetSchema, INITIAL_CARDBACK_PRESETS } from '@shared/assets/cardbackPresets';
import {
  CARD_FRONT_PUBLICATION_REVISIONS,
  cardFrontPresetSchema,
  INITIAL_CARD_FRONT_PRESETS,
} from '@shared/assets/cardFrontPresets';
import { INITIAL_BACKGROUND_PRESETS } from '@shared/backgrounds/defaults';
import { discoveryPresetSchema } from '@shared/backgrounds/families';
import { expect, userEvent, within } from 'storybook/test';

import { db, storybookViewer } from '@db/storybook';
import type { StorybookDatabase } from '@db/storybook';

import { pageStoryMeta } from '../../storybookConfig';
import snapshot from './presets-production.stories.fixture.json';

const meta = preview.meta({ ...pageStoryMeta, title: 'Assets/Card presets', args: { path: '/assets/__presets' } });
function seedPresets(baseline: StorybookDatabase) {
  baseline.users.find((user) => user.$key === storybookViewer.subjectKey)!.isAdmin = true;
  baseline.card_front_presets = INITIAL_CARD_FRONT_PRESETS.map((initial) => {
    const value = snapshot.fronts.find((p) => p.key === initial.key) ?? initial;
    const { key, style, revision } = cardFrontPresetSchema.parse(value);
    return { key, style, revision, updated_at: 0 };
  });
  baseline.cardback_presets = INITIAL_CARDBACK_PRESETS.map((initial) => {
    const value = snapshot.backs.find((p) => p.key === initial.key) ?? {
      ...initial,
      revision: 0,
      href: null,
      captureStatus: null,
    };
    const { key, cardback, revision } = cardbackPresetSchema.parse(value);
    return { key, cardback, revision, updated_at: 0 };
  });
  baseline.discovery_presets = snapshot.discovery.map((value) => ({
    ...discoveryPresetSchema.parse(value),
    updated_at: 0,
  }));
  baseline.background_presets = INITIAL_BACKGROUND_PRESETS.map((value) => ({ ...value, updated_at: 0 }));
  for (const settings of baseline.admin_settings) {
    if (settings.key === 'publication') {
      Object.assign(settings.renderer_revisions, CARD_FRONT_PUBLICATION_REVISIONS, { 'cardback-preset': 7 });
    }
  }
}
const administratorDatabase = db(seedPresets);
export const Setup = meta.story({
  parameters: {
    database: db((baseline) => {
      seedPresets(baseline);
      baseline.background_presets = [];
    }),
  },
  globals: { backgrounds: { value: 'app', grid: false } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const action = await page.findByRole('button', { name: 'Import DB designs and recapture' }, { timeout: 30_000 });
    await userEvent.click(action);
    await expect(page.findByRole('heading', { name: 'Leader skill' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.getByRole('heading', { name: 'Hiereg Discovery' })).toBeVisible();
  },
});
export const Families = meta.story({
  parameters: { database: administratorDatabase },
  globals: { backgrounds: { value: 'app', grid: false } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: 'Leader skill' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.getByRole('heading', { name: 'Stronghold' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Homeworld' })).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Edit Stronghold' }));
    const group = within(page.getByRole('region', { name: 'Stronghold' }));
    await userEvent.click(group.getAllByRole('button', { name: 'Edit shared background' })[0]!);
    const name = group.getByRole('textbox', { name: 'Shared background name' });
    await userEvent.clear(name);
    await userEvent.type(name, 'Stronghold standard header');
    await userEvent.click(group.getByRole('button', { name: 'Save and recapture' }));
    await expect(page.findByRole('status')).resolves.toHaveTextContent(
      'Preset saved. Linked artwork updates as captures finish.'
    );
    await userEvent.click(page.getByRole('button', { name: 'Edit Nexus' }));
    const nexus = within(page.getByRole('region', { name: 'Nexus' }));
    const icon = nexus.getByRole('combobox', { name: 'Nexus icon background' });
    await expect(icon).toHaveValue("Each card's faction");
    await userEvent.click(icon);
    await userEvent.click(page.getByRole('option', { name: /^Custom$/ }));
    await expect(nexus.getByRole('region', { name: 'Background builder' })).toBeVisible();
    await userEvent.click(icon);
    await userEvent.click(page.getByRole('option', { name: "Each card's faction" }));
    await expect(nexus.queryByRole('region', { name: 'Background builder' })).not.toBeInTheDocument();
  },
});
export const Library = meta.story({
  parameters: { database: administratorDatabase },
  globals: { backgrounds: { value: 'app', grid: false } },
});
export const Mobile = meta.story({
  parameters: { database: administratorDatabase },
  globals: { viewport: { value: 'appMobileNarrow' }, backgrounds: { value: 'app', grid: false } },
});
export const SignedOut = meta.story({
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement.ownerDocument.body).findByText('to edit presets.', { exact: false }, { timeout: 30_000 })
    ).resolves.toBeVisible();
  },
});
export const NotAdministrator = meta.story({
  parameters: {
    database: db((baseline) => {
      baseline.users.find((user) => user.$key === storybookViewer.subjectKey)!.isAdmin = false;
    }),
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement.ownerDocument.body).findByRole(
        'heading',
        { name: 'Administrator access required' },
        { timeout: 30_000 }
      )
    ).resolves.toBeVisible();
  },
});
