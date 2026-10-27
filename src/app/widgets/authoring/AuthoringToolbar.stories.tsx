import preview from '@sb/preview';
import { IconAction } from '@ui/control/IconAction';
import { History, UserRoundMinus } from 'lucide-react';
import { expect, within } from 'storybook/test';

import { AuthoringToolbar, failureStatus } from './AuthoringToolbar';
import { cleanStatus, cleanToolbar } from './AuthoringToolbar.stories.fixture';
import { groupAccessStatus } from './groupAccessStatus';

const SCHEDULED =
  'A new faction sheet capture is scheduled. The current PDF remains available. Last published Aug 4, 2026, 6:30 PM';

const removeGroup = (
  <IconAction
    label="Remove group"
    tooltip="Remove group access (Arrakeen Rules Council)"
    emphasis="standard"
    intent="neutral"
    size="lg"
    icon={<UserRoundMinus size={17} aria-hidden />}
  />
);

const meta = preview.meta({
  title: 'Authoring Toolbar',
  component: AuthoringToolbar,
  args: cleanToolbar,
  parameters: {
    layout: 'fullscreen',
  },
});

/** Back, then the status action, then Reset, then Save last. No status marks in the row: Save says there is nothing to save. */
export const Clean = meta.story({
  args: cleanToolbar,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByRole('button', { name: 'Save faction' })).toHaveAccessibleDescription('No unsaved changes');
    await expect(page.queryByRole('img')).toBeNull();
  },
});

/** A faction mid-edit: Save wears a dot and says there are unsaved changes. */
export const Unsaved = meta.story({
  args: { ...cleanToolbar, status: { ...cleanStatus, isDirty: true } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByRole('button', { name: 'Save faction' })).toHaveAccessibleDescription('Unsaved changes');
    await expect(page.getByRole('status')).toHaveTextContent('Unsaved changes');
  },
});

/** A capture queued and a Group with access: the status action lists both, beside the save state. */
export const WithStatuses = meta.story({
  args: {
    ...cleanToolbar,
    statuses: [
      { tone: 'pending', icon: <History size={16} aria-hidden />, label: SCHEDULED },
      groupAccessStatus('Arrakeen Rules Council'),
    ],
  },
  globals: { viewport: { value: 'appLarge' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByRole('button', { name: 'Status' })).toHaveAccessibleDescription(
      expect.stringContaining(`${SCHEDULED} Group access: Arrakeen Rules Council`)
    );
  },
});

/** The ruleset editor after the server refused a rename: Save turns red, and its hover text and the status list say why. */
export const SaveFailed = meta.story({
  args: {
    ...cleanToolbar,
    status: { ...cleanStatus, isDirty: true, saveState: 'error' },
    copy: {
      saveLabel: 'Save ruleset',
      nameBlankMessage: 'Add a ruleset name before saving; it determines the ruleset URL.',
    },
    statuses: [failureStatus('Ruleset name already exists')],
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByRole('button', { name: 'Save ruleset' })).toHaveAccessibleDescription(
      'Save failed. Your changes are still here; press to try again. Ruleset name already exists'
    );
  },
});

/** Saved: Save shows a check, and its description and the live region say so. */
export const Saved = meta.story({
  args: { ...cleanToolbar, status: { ...cleanStatus, saveState: 'saved' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByRole('button', { name: 'Save faction' })).toHaveAccessibleDescription('Saved');
    await expect(page.getByRole('status')).toHaveTextContent('Saved');
  },
});

/**
 * Every kind of action at once, at a phone's width: the bar stays one row.
 * Reset, delete and the group action fold into More actions before Save, which never leaves.
 */
export const CrowdedPhone = meta.story({
  args: {
    ...cleanToolbar,
    status: { ...cleanStatus, isDirty: true },
    accessActions: removeGroup,
    review: { label: 'Review faction sheet', onOpen: () => undefined },
  },
  globals: { viewport: { value: 'appMobile' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const actions = page.getByRole('group', { name: 'Editing actions' });
    await expect(actions.getBoundingClientRect().height).toBeLessThanOrEqual(40);
    await expect(page.getByRole('button', { name: 'Save faction' })).toBeVisible();
  },
});
