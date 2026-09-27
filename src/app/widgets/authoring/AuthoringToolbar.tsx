import { Button, Group, Loader } from '@mantine/core';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
import { StatusMark, StatusMarkList } from '@ui/content/StatusMark';
import type { StatusMarkProps } from '@ui/content/StatusMark';
import { TopicIcon } from '@ui/content/TopicIcon';
import { IconAction } from '@ui/control/IconAction';
import { Toolbar } from '@ui/surface/Toolbar';
import { ArrowLeft, CircleAlert, CircleCheck, CircleDashed, Eye, RotateCcw, Save } from 'lucide-react';
import type { ReactNode } from 'react';

import styles from './AuthoringToolbar.module.css';

type ToolbarStatus = Pick<StatusMarkProps, 'tone' | 'icon' | 'label'>;

/* The glyph size every status mark in this toolbar uses, callers' included, so the cluster reads as one row. */
const STATUS_GLYPH_SIZE = 16;

function saveStatus(saveState: AuthoringSaveState, isDirty: boolean): ToolbarStatus {
  switch (true) {
    case saveState === 'saving':
      return {
        tone: 'progress',
        icon: <Loader size={STATUS_GLYPH_SIZE - 2} color="currentColor" />,
        label: 'Saving',
      };
    case saveState === 'error':
      return { tone: 'negative', icon: <CircleAlert size={STATUS_GLYPH_SIZE} aria-hidden />, label: 'Save failed' };
    case isDirty:
      return { tone: 'caution', icon: <CircleDashed size={STATUS_GLYPH_SIZE} aria-hidden />, label: 'Unsaved changes' };
    case saveState === 'saved':
      return { tone: 'positive', icon: <CircleCheck size={STATUS_GLYPH_SIZE} aria-hidden />, label: 'Saved' };
    default:
      return {
        tone: 'neutral',
        icon: <CircleCheck size={STATUS_GLYPH_SIZE} aria-hidden />,
        label: 'No unsaved changes',
      };
  }
}

export interface AuthoringStatus {
  isDirty: boolean;
  isNameBlank: boolean;
  saveState: AuthoringSaveState;
}

/** The words only the page knows: what it saves, and why a blank name blocks it. */
export interface AuthoringCopy {
  /** The save button's label, e.g. "Save faction". */
  saveLabel: string;
  /** Stated while the name is blank; explain that the name determines the URL. */
  nameBlankMessage: string;
}

export interface AuthoringToolbarActions {
  onSave: () => void;
  onReset: () => void;
  onBack: () => void;
}

/**
 * The edit-page toolbar every authoring surface installs identically: back, the statuses, reset, and the confirm-green save, with slots for whatever one editor adds around them.
 *
 * Every status is a `StatusMark`, a glyph whose tooltip and accessible name carry the words, so the bar stays one line at every width instead of growing a line of prose (Norbert, #1423).
 * The toolbar states the save state and a blank name itself.
 * A page adds its own statuses as further marks in `context`, such as where a publication has got to or which Group has access.
 * Below 30rem of toolbar the marks fold into one, whose tooltip lists them all, and Save becomes an icon.
 *
 * It carries no warning count and no standing explanation of what saving does.
 * `ValidationHeader` is open whenever any warning exists and names the fields, so a count here repeated it less usefully, and a sentence that never changes is not status (Norbert, 2026-08-20).
 * The page owns all data and wording;
 * the toolbar owns the arrangement.
 */
export function AuthoringToolbar({
  status,
  copy,
  actions,
  review,
  auxiliaryActions,
  context,
  destructiveActions,
  centerIndicator,
}: {
  status: AuthoringStatus;
  copy: AuthoringCopy;
  actions: AuthoringToolbarActions;
  /** An optional artifact-review action (the eye); absent editors have no review. */
  review?: { label: string; onOpen: (trigger: HTMLButtonElement) => void };
  auxiliaryActions?: ReactNode;
  /** The page's own statuses, each a `StatusMark` with a 16px glyph, after the save state and the blank name. */
  context?: ReactNode;
  destructiveActions?: ReactNode;
  centerIndicator?: ReactNode;
}) {
  const { isDirty, isNameBlank, saveState } = status;
  const { onSave, onReset, onBack } = actions;
  const save = saveStatus(saveState, isDirty);
  const name: ToolbarStatus | null = isNameBlank
    ? { tone: 'negative', icon: <TopicIcon topic="identity" size={STATUS_GLYPH_SIZE} />, label: copy.nameBlankMessage }
    : null;
  /* The folded mark wears what stands between the reader and a save: a failure first, then a blank name. */
  const lead = name && saveState !== 'error' ? name : save;
  const statuses = (
    <>
      <StatusMark {...save} />
      {name ? <StatusMark {...name} /> : null}
      {context}
    </>
  );
  const saveDisabled = isNameBlank || saveState === 'saving';

  return (
    <div className={styles.sticky}>
      <Toolbar>
        <Toolbar.Left>
          <Group gap="sm" wrap="nowrap">
            <IconAction
              label="Back"
              emphasis="standard"
              intent="neutral"
              size="lg"
              onClick={onBack}
              icon={<ArrowLeft size={17} aria-hidden />}
            />
            <Group gap={6} wrap="nowrap" role="group" aria-label="Status" className={styles.statuses}>
              {statuses}
            </Group>
            <span className={styles.foldedStatus}>
              <StatusMark
                {...lead}
                label={`Status: ${lead.label}`}
                tooltip={<StatusMarkList>{statuses}</StatusMarkList>}
              />
            </span>
          </Group>
        </Toolbar.Left>

        <Toolbar.Center>{centerIndicator}</Toolbar.Center>

        <Toolbar.Right>
          <Group gap="xs" wrap="nowrap" className={styles.actions}>
            <div className={styles.auxiliarySlot}>{auxiliaryActions}</div>
            <IconAction
              label="Reset unsaved edits"
              emphasis="standard"
              intent="neutral"
              size="lg"
              disabled={!isDirty || saveState === 'saving'}
              onClick={onReset}
              icon={<RotateCcw size={17} aria-hidden />}
            />
            {review ? (
              <IconAction
                className={styles.reviewAction}
                label={review.label}
                emphasis="standard"
                intent="neutral"
                size="lg"
                onClick={(event) => review.onOpen(event.currentTarget)}
                icon={<Eye size={17} aria-hidden />}
              />
            ) : null}
            <div className={styles.destructiveSlot}>{destructiveActions}</div>
            <span className={styles.saveButton}>
              <Button
                type="button"
                color="confirm"
                leftSection={<Save size={17} aria-hidden />}
                disabled={saveDisabled}
                loading={saveState === 'saving'}
                onClick={onSave}
              >
                {copy.saveLabel}
              </Button>
            </span>
            <span className={styles.saveIcon}>
              <IconAction
                label={copy.saveLabel}
                intent="positive"
                emphasis="strong"
                size="lg"
                disabled={saveDisabled}
                loading={saveState === 'saving'}
                onClick={onSave}
                icon={<Save size={17} aria-hidden />}
              />
            </span>
          </Group>
        </Toolbar.Right>
      </Toolbar>
    </div>
  );
}
