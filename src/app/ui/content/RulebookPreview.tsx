import { AspectRatio, Center, Tooltip } from '@mantine/core';
import { getRulebookSize } from '@shared/rulebooks/settings';
import type { RulebookSize } from '@shared/rulebooks/settings';

import { PublishedImage } from './PublishedImage';
import styles from './RulebookPreview.module.css';
import { TopicIcon } from './TopicIcon';

export type RulebookPreviewStatus = 'scheduled' | 'in_progress' | 'failed' | null;

function captureLabel(name: string, status: NonNullable<RulebookPreviewStatus>) {
  switch (status) {
    case 'failed':
      return `First-page preview failed for ${name}`;
    case 'scheduled':
    case 'in_progress':
      return `First-page preview preparing for ${name}`;
  }
}

/**
 * A published first page, or its capture state, at the Rulebook's physical proportions.
 * With no page, a capture on its way or failed draws the rules icon with a tooltip that says so.
 * With neither a page nor a capture, it draws `PublishedImage`'s missing state.
 */
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
  if (imageUrl || status === null) {
    return (
      <PublishedImage
        src={imageUrl || null}
        name={`First page of ${name}`}
        aspect={dimensions.heightMm / dimensions.widthMm}
        radius="var(--mantine-radius-md)"
      />
    );
  }
  const placeholderLabel = captureLabel(name, status);
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
