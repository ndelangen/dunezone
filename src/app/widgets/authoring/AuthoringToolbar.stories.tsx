import preview from '@sb/preview';

import { AuthoringToolbar } from './AuthoringToolbar';

const toolbarActions = {
  onSave: () => undefined,
  onReset: () => undefined,
  onBack: () => undefined,
};

const cleanStatus = {
  isDirty: false,
  isNameBlank: false,
  saveState: 'idle' as const,
};

const factionCopy = {
  saveLabel: 'Save faction',
  nameBlankMessage: 'Add a faction name before saving; it determines the faction URL.',
  statusMessage: 'Saving this faction schedules its public assets.',
};

const cleanToolbar = {
  status: cleanStatus,
  copy: factionCopy,
  actions: toolbarActions,
};

const meta = preview.meta({
  title: 'Authoring Toolbar',
  component: AuthoringToolbar,
  args: cleanToolbar,
  parameters: {
    layout: 'fullscreen',
  },
});

export const Clean = meta.story({
  args: cleanToolbar,
});

export const SaveFailed = meta.story({
  args: {
    ...cleanToolbar,
    status: { ...cleanStatus, isDirty: true, saveState: 'error' },
    copy: { ...factionCopy, statusMessage: 'Changes were not saved.' },
  },
});

export const PublishedAndCurrent = meta.story({
  args: {
    ...cleanToolbar,
    status: {
      ...cleanStatus,
      saveState: 'saved',
      lastPublishedAt: Date.parse('2026-08-04T18:30:00.000Z'),
    },
    copy: { ...factionCopy, statusMessage: 'Saved. Publication scheduled. Public assets are current.' },
  },
});

export const WithReviewAction = meta.story({
  args: {
    ...cleanToolbar,
    review: { label: 'Review faction sheet', onOpen: () => undefined },
  },
});
