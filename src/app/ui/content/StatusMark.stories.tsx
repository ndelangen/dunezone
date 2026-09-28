import preview from '@sb/preview';
import { CircleAlert, CircleCheck, CircleDashed, FileText, History, RefreshCw, UsersRound } from 'lucide-react';
import { expect, userEvent, within } from 'storybook/test';

import { StatusMark, StatusMarkList } from './StatusMark';

const meta = preview.meta({
  component: StatusMark,
  parameters: { layout: 'centered' },
  args: {
    icon: <CircleCheck size={16} aria-hidden />,
    label: 'No unsaved changes',
  },
});

/**
 * A state with no charge: nothing to save.
 * Tabbing to the glyph opens its tooltip, which is how a keyboard reader gets the words a pointer gets on hover.
 */
export const Neutral = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.tab();
    await expect(page.getByRole('img', { name: 'No unsaved changes' })).toHaveFocus();
    await expect(page.findByRole('tooltip')).resolves.toHaveTextContent('No unsaved changes');
  },
});

/** Work that would be lost, which warns without failing. */
export const Caution = meta.story({
  args: { tone: 'caution', icon: <CircleDashed size={16} aria-hidden />, label: 'Unsaved changes' },
});

export const Negative = meta.story({
  args: { tone: 'negative', icon: <CircleAlert size={16} aria-hidden />, label: 'Save failed' },
});

export const Positive = meta.story({
  args: { tone: 'positive', label: 'Saved' },
});

/** Waiting on something else to start. */
export const Pending = meta.story({
  args: {
    tone: 'pending',
    icon: <History size={16} aria-hidden />,
    label: 'A new faction sheet capture is scheduled. The current PDF remains available.',
  },
});

/** Underway right now. */
export const Progress = meta.story({
  args: {
    tone: 'progress',
    icon: <RefreshCw size={16} aria-hidden />,
    label: 'A new faction sheet capture is in progress. The current PDF remains available.',
  },
});

/**
 * One mark standing in for several, for a bar too narrow to show each: its tooltip lists every status with its glyph.
 * The list is also the mark's description, so a screen reader hears every status and not only the one the glyph shows.
 */
export const StandsInForSeveral = meta.story({
  args: {
    tone: 'caution',
    icon: <CircleDashed size={16} aria-hidden />,
    label: 'Status: Unsaved changes',
    tooltip: (
      <StatusMarkList>
        <StatusMark tone="caution" icon={<CircleDashed size={16} aria-hidden />} label="Unsaved changes" />
        <StatusMark icon={<FileText size={16} aria-hidden />} label="Public assets are current." />
        <StatusMark icon={<UsersRound size={16} aria-hidden />} label="Group access: Arrakeen Rules Council" />
      </StatusMarkList>
    ),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const mark = page.getByRole('img', { name: 'Status: Unsaved changes' });
    await expect(mark).toHaveAccessibleDescription(
      'Unsaved changes Public assets are current. Group access: Arrakeen Rules Council'
    );
    await userEvent.tab();
    const tooltip = await page.findByRole('tooltip');
    await expect(tooltip).toHaveTextContent('Unsaved changes');
    await expect(tooltip).toHaveTextContent('Public assets are current.');
    await expect(tooltip).toHaveTextContent('Group access: Arrakeen Rules Council');
  },
});
