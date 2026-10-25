const toolbarActions = {
  onSave: () => undefined,
  onReset: () => undefined,
  onBack: () => undefined,
};

export const cleanStatus = {
  isDirty: false,
  isNameBlank: false,
  saveState: 'idle' as const,
};

export const factionCopy = {
  saveLabel: 'Save faction',
  nameBlankMessage: 'Add a faction name before saving; it determines the faction URL.',
};

export const cleanToolbar = {
  status: cleanStatus,
  copy: factionCopy,
  actions: toolbarActions,
};
