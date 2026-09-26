import { AspectRatio, Center, Tooltip } from '@mantine/core';
import { getRulebookSize } from '@shared/rulebooks/settings';
import type { RulebookSize } from '@shared/rulebooks/settings';

import { PublishedImage } from './PublishedImage';
import styles from './RulebookPreview.module.css';
import { TopicIcon } from './TopicIcon';

export type RulebookPreviewStatus = 'scheduled' | 'in_progress' | 'failed' | null;

function unavailableLabel(name: string, status: RulebookPreviewStatus) {
  if (status === 'failed') {
    return `First-page preview failed for ${name}`;
  }
  if (status === 'scheduled' || status === 'in_progress') {
    return `First-page preview preparing for ${name}`;
  }
  return `First-page preview unavailable for ${name}`;
}

/** A published first page, or its publication state, at the Rulebook's physical proportions. */
export function RulebookPreview({
  name,
  size = 'a4',
  imageUrl,
  status = null,
}: {
  name: string;
  size?: RulebookSize;
  imageUrl?: string | null;
  status?: RulebookPreviewStatus;
}) {
  const dimensions = getRulebookSize(size);
  if (imageUrl) {
    return (
      <PublishedImage
        src={imageUrl}
        name={`First page of ${name}`}
        aspect={dimensions.heightMm / dimensions.widthMm}
        radius="var(--mantine-radius-md)"
      />
    );
  }
  const placeholderLabel = unavailableLabel(name, status);
  return (
    <AspectRatio ratio={dimensions.widthMm / dimensions.heightMm} className={styles.preview}>
      <Tooltip label={placeholderLabel}>
        <Center className={styles.placeholder} role="img" aria-label={placeholderLabel}>
          <TopicIcon topic="rules" size={28} />
        </Center>
      </Tooltip>
    </AspectRatio>
  );
}
