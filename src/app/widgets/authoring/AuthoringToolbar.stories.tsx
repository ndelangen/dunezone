import preview from '@sb/preview';
import { StatusMark } from '@ui/content/StatusMark';
import { TopicIcon } from '@ui/content/TopicIcon';
import { FileText, History, MessageCircleWarning } from 'lucide-react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

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
};

const cleanToolbar = {
  status: cleanStatus,
  copy: factionCopy,
  actions: toolbarActions,
};

const SCHEDULED =
  'A new faction sheet capture is scheduled. The current PDF remains available. Last published Aug 4, 2026, 6:30 PM';
const GROUP_ACCESS = 'Group access: Arrakeen Rules Council';

/* A faction mid-edit: an unsaved change, its name cleared, a capture queued by the last save, and a Group with access. */
const everyStatus = {
  ...cleanToolbar,
  status: { ...cleanStatus, isDirty: true, isNameBlank: true },
  context: (
    <>
      <StatusMark tone="pending" icon={<History size={16} aria-hidden />} label={SCHEDULED} />
      <StatusMark icon={<TopicIcon topic="groups" size={16} />} label={GROUP_ACCESS} />
    </>
  ),
};

const EVERY_STATUS_WORDING = ['Unsaved changes', factionCopy.nameBlankMessage, SCHEDULED, GROUP_ACCESS];

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

/**
 * Every status the faction editor can show at once, each its own glyph beside Back.
 * A glyph's accessible name is its full wording, and hovering it shows the same words.
 * The words also sit in a live region, which is what a screen reader announces when a status changes.
 */
export const EveryStatus = meta.story({
  args: everyStatus,
  globals: { viewport: { value: 'appLarge' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const statuses = within(page.getByRole('group', { name: 'Status' }));
    for (const wording of EVERY_STATUS_WORDING) {
      const mark = statuses.getByRole('img', { name: wording });
      await userEvent.hover(mark);
      const tooltip = await page.findByRole('tooltip', { name: wording });
      /* The tooltip mounts transparent and fades in, so visibility is waited for rather than read once. */
      await waitFor(() => expect(tooltip).toBeVisible());
      await userEvent.unhover(mark);
    }
    const live = page.getByRole('status');
    for (const wording of EVERY_STATUS_WORDING) {
      await expect(live).toHaveTextContent(wording);
    }
    await expect(page.getByRole('button', { name: 'Save faction' })).toBeDisabled();
  },
});

/**
 * Below 32rem of toolbar the glyphs fold into one, wearing the status that blocks a save.
 * The folded glyph's tooltip and its accessible description both list every status.
 */
export const EveryStatusFolded = meta.story({
  args: everyStatus,
  globals: { viewport: { value: 'appMobile' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    expect(page.queryByRole('group', { name: 'Status' })).toBeNull();
    const folded = page.getByRole('img', { name: `Status: ${factionCopy.nameBlankMessage}` });
    await expect(folded).toHaveAccessibleDescription(EVERY_STATUS_WORDING.join(' '));
    await userEvent.hover(folded);
    const tooltip = await page.findByRole('tooltip');
    for (const wording of EVERY_STATUS_WORDING) {
      await expect(tooltip).toHaveTextContent(wording);
    }
    await expect(page.getByRole('button', { name: 'Save faction' })).toBeDisabled();
  },
});

/** The ruleset editor after the server refused a rename: the save state says it failed, and the page's own mark says why. */
export const SaveFailed = meta.story({
  args: {
    ...cleanToolbar,
    status: { ...cleanStatus, isDirty: true, saveState: 'error' },
    copy: {
      saveLabel: 'Save ruleset',
      nameBlankMessage: 'Add a ruleset name before saving; it determines the ruleset URL.',
    },
    context: (
      <StatusMark
        tone="negative"
        icon={<MessageCircleWarning size={16} aria-hidden />}
        label="Ruleset name already exists"
      />
    ),
  },
});

export const PublishedAndCurrent = meta.story({
  args: {
    ...cleanToolbar,
    status: { ...cleanStatus, saveState: 'saved' },
    context: (
      <StatusMark
        icon={<FileText size={16} aria-hidden />}
        label="Public assets are current. Last published Aug 4, 2026, 6:30 PM"
      />
    ),
  },
});

export const WithReviewAction = meta.story({
  args: {
    ...cleanToolbar,
    review: { label: 'Review faction sheet', onOpen: () => undefined },
  },
});
