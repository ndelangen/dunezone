import preview from '@sb/preview';
import { finishTransitions, waitForFrame } from '@sb/storyWaits';
import { IconAction } from '@ui/control/IconAction';
import { History, UserRoundMinus } from 'lucide-react';
import { expect, userEvent, within } from 'storybook/test';

import { AuthoringToolbar, failureStatus, groupAccessStatus } from './AuthoringToolbar';

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
};

const cleanToolbar = {
  status: cleanStatus,
  copy: factionCopy,
  actions: toolbarActions,
};

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

/**
 * A faction mid-edit with a capture queued: Save wears a dot and says there are unsaved changes.
 * The status action lists the save state, where the publication has got to, and which Group has access.
 */
export const UnsavedWithStatuses = meta.story({
  args: {
    ...cleanToolbar,
    status: { ...cleanStatus, isDirty: true },
    statuses: [
      { tone: 'pending', icon: <History size={16} aria-hidden />, label: SCHEDULED },
      groupAccessStatus('Arrakeen Rules Council'),
    ],
  },
  globals: { viewport: { value: 'appLarge' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const save = page.getByRole('button', { name: 'Save faction' });
    await userEvent.hover(save);
    const tooltip = await waitForFrame(() => page.getByRole('tooltip'));
    /* The tooltip mounts transparent and fades in, so the check finishes the fade rather than waiting for the frames that draw it. */
    await waitForFrame(() => expect(finishTransitions(tooltip)).toBeVisible());
    await expect(tooltip).toHaveTextContent('Unsaved changes');
    await expect(page.getByRole('status')).toHaveTextContent('Unsaved changes');
    const info = page.getByRole('button', { name: 'Status' });
    await expect(info).toHaveAccessibleDescription(`Unsaved changes ${SCHEDULED} Group access: Arrakeen Rules Council`);
    await userEvent.click(info);
    const list = await waitForFrame(() => page.getByRole('dialog', { name: 'Status' }));
    await expect(list).toHaveTextContent(SCHEDULED);
    await expect(list).toHaveTextContent('Group access: Arrakeen Rules Council');
  },
});

/** A blank name blocks Save: it looks disabled, says why on hover, and pressing it does nothing. */
export const NameBlank = meta.story({
  args: { ...cleanToolbar, status: { ...cleanStatus, isDirty: true, isNameBlank: true } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const save = page.getByRole('button', { name: 'Save faction' });
    await expect(save).toHaveAttribute('aria-disabled', 'true');
    await userEvent.hover(save);
    await expect(
      await waitForFrame(() => page.getByRole('tooltip', { name: factionCopy.nameBlankMessage }))
    ).toBeInTheDocument();
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

/** Saved: Save shows a check. */
export const Saved = meta.story({
  args: { ...cleanToolbar, status: { ...cleanStatus, saveState: 'saved' } },
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

export const WithReviewAction = meta.story({
  args: {
    ...cleanToolbar,
    review: { label: 'Review faction sheet', onOpen: () => undefined },
  },
});
