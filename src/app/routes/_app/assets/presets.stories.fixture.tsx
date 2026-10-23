import { cardbackPresetSchema, INITIAL_CARDBACK_PRESETS } from '@shared/assets/cardbackPresets';
import {
  CARD_FRONT_PUBLICATION_REVISIONS,
  cardFrontPresetSchema,
  INITIAL_CARD_FRONT_PRESETS,
} from '@shared/assets/cardFrontPresets';
import { INITIAL_BACKGROUND_PRESETS } from '@shared/backgrounds/defaults';
import { discoveryPresetSchema } from '@shared/backgrounds/families';

import { db, storybookViewer } from '@db/storybook';
import type { StorybookDatabase } from '@db/storybook';

import snapshot from './presets-production.stories.fixture.json';

export function seedPresets(baseline: StorybookDatabase) {
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
export const administratorDatabase = db(seedPresets);
