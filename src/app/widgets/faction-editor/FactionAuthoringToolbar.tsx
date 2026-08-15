import { Badge, Button, Group, Stack, Text } from '@mantine/core';
import { factionAssetPublishingCopy } from '@ui/content/assetPublishingStatus';
import type { FactionSaveState } from '@ui/content/assetPublishingStatus';
import { IconAction } from '@ui/control/IconAction';
import { Toolbar } from '@ui/surface/Toolbar';
import { ArrowLeft, Eye, RotateCcw, Save } from 'lucide-react';
import type { ReactNode } from 'react';

import type { PublicAssetPublishingStatusProjection } from '@db/factions';

import styles from './FactionAuthoringToolbar.module.css';

function formatPublishedAt(timestamp: number): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}

type ToolbarStatusPresentation = {
  label: string;
  color: string;
  publishingCopy: string;
};

function deriveToolbarStatus(
  saveState: FactionSaveState,
  isDirty: boolean,
  assetPublishing: PublicAssetPublishingStatusProjection | undefined
): ToolbarStatusPresentation {
  const publishingCopy = assetPublishing
    ? factionAssetPublishingCopy(assetPublishing.status, saveState, assetPublishing.captureStatus)
    : saveState === 'error'
      ? 'Changes were not saved.'
      : saveState === 'saved'
        ? 'Saved. Publication scheduled.'
        : 'Saving this faction schedules its public assets.';

  if (saveState === 'saving') {
    return { label: 'Saving', color: 'blue', publishingCopy };
  }
  if (saveState === 'error') {
    return { label: 'Save failed', color: 'red', publishingCopy };
  }
  if (isDirty) {
    return { label: 'Unsaved changes', color: 'orange', publishingCopy };
  }
  if (saveState === 'saved') {
    return { label: 'Saved', color: 'green', publishingCopy };
  }
  return { label: 'No unsaved changes', color: 'gray', publishingCopy };
}

export interface FactionAuthoringStatus {
  isDirty: boolean;
  isNameBlank: boolean;
  warningCount: number;
  saveState: FactionSaveState;
  assetPublishing?: PublicAssetPublishingStatusProjection;
}

export interface FactionAuthoringToolbarActions {
  onSave: () => void;
  onReviewWarnings: () => void;
  onReview: (trigger: HTMLButtonElement) => void;
  onReset: () => void;
  onBack: () => void;
}

export function FactionAuthoringToolbar({
  status,
  actions,
  auxiliaryActions,
  context,
  destructiveActions,
  centerIndicator,
}: {
  status: FactionAuthoringStatus;
  actions: FactionAuthoringToolbarActions;
  auxiliaryActions?: ReactNode;
  context?: ReactNode;
  destructiveActions?: ReactNode;
  centerIndicator?: ReactNode;
}) {
  const { isDirty, isNameBlank, warningCount, saveState, assetPublishing } = status;
  const { onSave, onReviewWarnings, onReview, onReset, onBack } = actions;
  const {
    label: statusLabel,
    color: statusColor,
    publishingCopy,
  } = deriveToolbarStatus(saveState, isDirty, assetPublishing);

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
                {warningCount > 0 ? (
                  <Button
                    type="button"
                    variant="subtle"
                    color="yellow"
                    size="compact-xs"
                    onClick={onReviewWarnings}
                  >
                    {warningCount} {warningCount === 1 ? 'field may' : 'fields may'} be incomplete
                  </Button>
                ) : null}
                {assetPublishing?.lastPublishedAt != null ? (
                  <Text
                    className={styles.statusDetails}
                    component="time"
                    dateTime={new Date(assetPublishing.lastPublishedAt).toISOString()}
                    size="xs"
                    c="dimmed"
                  >
                    Last published {formatPublishedAt(assetPublishing.lastPublishedAt)}
                  </Text>
                ) : null}
              </Group>
              <div className={styles.statusDetails}>
                <Text size="xs" c={saveState === 'error' ? 'red' : 'dimmed'} role="status">
                  {isNameBlank
                    ? 'Add a faction name before saving; it determines the faction URL.'
                    : publishingCopy}
                </Text>
                {context}
              </div>
            </Stack>
          </Group>
        </Toolbar.Left>

        {/* PROTOTYPE (wayfinder #404): currently carries the complexity indicator */}
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
            <Button
              className={styles.reviewAction}
              type="button"
              variant="default"
              leftSection={<Eye size={17} aria-hidden />}
              onClick={(event) => onReview(event.currentTarget)}
            >
              Review faction sheet
            </Button>
            <div className={styles.destructiveSlot}>{destructiveActions}</div>
            <Button
              type="button"
              color="confirm"
              leftSection={<Save size={17} aria-hidden />}
              disabled={isNameBlank || saveState === 'saving'}
              loading={saveState === 'saving'}
              onClick={onSave}
            >
              Save faction
            </Button>
          </Group>
        </Toolbar.Right>
      </Toolbar>
    </div>
  );
}
