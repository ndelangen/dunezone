import { Badge, Button, Group, Stack, Text } from '@mantine/core';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
import { IconAction } from '@ui/control/IconAction';
import { Toolbar } from '@ui/surface/Toolbar';
import { ArrowLeft, Eye, RotateCcw, Save } from 'lucide-react';
import type { ReactNode } from 'react';

import styles from './AuthoringToolbar.module.css';

function formatPublishedAt(timestamp: number): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}

function statusPresentation(saveState: AuthoringSaveState, isDirty: boolean): { label: string; color: string } {
  switch (true) {
    case saveState === 'saving':
      return { label: 'Saving', color: 'blue' };
    case saveState === 'error':
      return { label: 'Save failed', color: 'red' };
    case isDirty:
      return { label: 'Unsaved changes', color: 'orange' };
    case saveState === 'saved':
      return { label: 'Saved', color: 'green' };
    default:
      return { label: 'No unsaved changes', color: 'gray' };
  }
}

export interface AuthoringStatus {
  isDirty: boolean;
  isNameBlank: boolean;
  saveState: AuthoringSaveState;
  lastPublishedAt?: number | null;
}

/** The words only the page knows: what it saves, why a blank name blocks it, where the save leads. */
export interface AuthoringCopy {
  /** The save button's label, e.g. "Save faction". */
  saveLabel: string;
  /** Shown while the name is blank; explain that the name determines the URL. */
  nameBlankMessage: string;
  /**
   * Live state a reader cannot get anywhere else on the page, such as where a publication has got to.
   * Optional, and omitted by every asset editor: theirs were standing explanations of what saving does, which is not status and which Norbert struck out on 2026-08-20.
   * The faction editor keeps one because `factionAuthoringStatusMessage` reports real capture progress.
   */
  statusMessage?: string;
}

export interface AuthoringToolbarActions {
  onSave: () => void;
  onReset: () => void;
  onBack: () => void;
}

/**
 * The edit-page toolbar every authoring surface installs identically: back, save-cycle badge, reset, and the confirm-green save, with slots for whatever one editor adds around them.
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
  /** An optional artifact-review action (the eye); absent editors simply have no review. */
  review?: { label: string; onOpen: (trigger: HTMLButtonElement) => void };
  auxiliaryActions?: ReactNode;
  context?: ReactNode;
  destructiveActions?: ReactNode;
  centerIndicator?: ReactNode;
}) {
  const { isDirty, isNameBlank, saveState, lastPublishedAt } = status;
  const { onSave, onReset, onBack } = actions;
  const { label: statusLabel, color: statusColor } = statusPresentation(saveState, isDirty);

  return (
    <div className={styles.sticky}>
      <Toolbar>
        <Toolbar.Left>
          <Group gap="sm" wrap="nowrap" className={styles.leading}>
            <IconAction
              label="Back"
              variant="light"
              color="gray"
              size="lg"
              onClick={onBack}
              icon={<ArrowLeft size={17} aria-hidden />}
            />
            <Stack gap="sm" className={styles.status}>
              <Group gap="xs" wrap="nowrap">
                <Badge color={statusColor} variant="light">
                  {statusLabel}
                </Badge>
                {lastPublishedAt != null ? (
                  <Text
                    className={styles.statusDetails}
                    component="time"
                    dateTime={new Date(lastPublishedAt).toISOString()}
                    size="xs"
                    c="dimmed"
                  >
                    Last published {formatPublishedAt(lastPublishedAt)}
                  </Text>
                ) : null}
              </Group>
              <div className={styles.statusDetails}>
                {isNameBlank || copy.statusMessage ? (
                  <Text size="xs" c={saveState === 'error' ? 'red' : 'dimmed'} role="status">
                    {isNameBlank ? copy.nameBlankMessage : copy.statusMessage}
                  </Text>
                ) : null}
                {context}
              </div>
            </Stack>
          </Group>
        </Toolbar.Left>

        <Toolbar.Center>{centerIndicator}</Toolbar.Center>

        <Toolbar.Right>
          <Group gap="xs" wrap="nowrap" className={styles.actions}>
            <div className={styles.auxiliarySlot}>{auxiliaryActions}</div>
            <IconAction
              label="Reset unsaved edits"
              variant="light"
              color="gray"
              size="lg"
              disabled={!isDirty || saveState === 'saving'}
              onClick={onReset}
              icon={<RotateCcw size={17} aria-hidden />}
            />
            {review ? (
              <IconAction
                className={styles.reviewAction}
                label={review.label}
                variant="light"
                color="gray"
                size="lg"
                onClick={(event) => review.onOpen(event.currentTarget)}
                icon={<Eye size={17} aria-hidden />}
              />
            ) : null}
            <div className={styles.destructiveSlot}>{destructiveActions}</div>
            <Button
              type="button"
              color="confirm"
              leftSection={<Save size={17} aria-hidden />}
              disabled={isNameBlank || saveState === 'saving'}
              loading={saveState === 'saving'}
              onClick={onSave}
            >
              {copy.saveLabel}
            </Button>
          </Group>
        </Toolbar.Right>
      </Toolbar>
    </div>
  );
}
