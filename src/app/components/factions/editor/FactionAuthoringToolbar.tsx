import { ActionIcon, Badge, Button, Group, Paper, Stack, Text, Tooltip } from '@mantine/core';
import { ArrowLeft, Eye, RotateCcw, Save } from 'lucide-react';
import type { ReactNode } from 'react';

import { factionAssetPublishingCopy } from '@app/factions/assetPublishingStatus';
import type { FactionSaveState } from '@app/factions/assetPublishingStatus';

import type { PublicAssetPublishingStatusProjection } from '../../../../../convex/assetPublishingStatus';
import styles from './FactionAuthoringToolbar.module.css';

function formatPublishedAt(timestamp: number): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}

export function FactionAuthoringToolbar({
  isDirty,
  isNameBlank,
  warningCount,
  saveState,
  assetPublishing,
  onSave,
  onReviewWarnings,
  onReview,
  onReset,
  onBack,
  auxiliaryActions,
  context,
  destructiveActions,
}: {
  isDirty: boolean;
  isNameBlank: boolean;
  warningCount: number;
  saveState: FactionSaveState;
  assetPublishing?: PublicAssetPublishingStatusProjection;
  onSave: () => void;
  onReviewWarnings: () => void;
  onReview: (trigger: HTMLButtonElement) => void;
  onReset: () => void;
  onBack: () => void;
  auxiliaryActions?: ReactNode;
  context?: ReactNode;
  destructiveActions?: ReactNode;
}) {
  const statusLabel =
    saveState === 'saving'
      ? 'Saving'
      : saveState === 'error'
        ? 'Save failed'
        : isDirty
          ? 'Unsaved changes'
          : saveState === 'saved'
            ? 'Saved'
            : 'No unsaved changes';
  const statusColor =
    saveState === 'error'
      ? 'red'
      : saveState === 'saving'
        ? 'blue'
        : isDirty
          ? 'orange'
          : saveState === 'saved'
            ? 'green'
            : 'gray';
  const publishingCopy = assetPublishing
    ? factionAssetPublishingCopy(assetPublishing.status, saveState, assetPublishing.captureStatus)
    : saveState === 'saved'
      ? 'Saved. Publication scheduled.'
      : 'Saving this faction schedules its public assets.';

  return (
    <Paper withBorder p="sm" radius="md" className={styles.toolbar}>
      <Group justify="space-between" gap="sm" wrap="nowrap" className={styles.toolbarRow}>
        <Group gap="sm" wrap="nowrap" className={styles.leading}>
          <Tooltip label="Back">
            <ActionIcon
              type="button"
              variant="light"
              color="gray"
              size="lg"
              aria-label="Back"
              onClick={onBack}
            >
              <ArrowLeft size={17} aria-hidden />
            </ActionIcon>
          </Tooltip>
          <Stack gap={3} className={styles.status}>
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

        <Group gap="xs" wrap="nowrap" className={styles.actions}>
          <div className={styles.auxiliarySlot}>{auxiliaryActions}</div>
          <Tooltip label="Reset unsaved edits">
            <ActionIcon
              type="button"
              variant="light"
              color="gray"
              size="lg"
              aria-label="Reset unsaved edits"
              disabled={!isDirty || saveState === 'saving'}
              onClick={onReset}
            >
              <RotateCcw size={17} aria-hidden />
            </ActionIcon>
          </Tooltip>
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
      </Group>
    </Paper>
  );
}
