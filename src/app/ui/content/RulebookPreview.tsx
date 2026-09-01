import { AspectRatio, Center, Image, Tooltip } from '@mantine/core';
import { useState } from 'react';

import styles from './RulebookPreview.module.css';
import { TopicIcon } from './TopicIcon';

export type RulebookPreviewStatus = 'scheduled' | 'in_progress' | 'failed' | null;

function unavailableLabel(name: string, status: RulebookPreviewStatus, failed: boolean) {
  if (failed || status === 'failed') {
    return `First-page preview failed for ${name}`;
  }
  if (status === 'scheduled' || status === 'in_progress') {
    return `First-page preview preparing for ${name}`;
  }
  return `First-page preview unavailable for ${name}`;
}

/** A published first page, or its explicit publication state, at the document's A4 ratio. */
export function RulebookPreview({
  name,
  imageUrl,
  status = null,
}: {
  name: string;
  imageUrl?: string | null;
  status?: RulebookPreviewStatus;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const available = imageUrl && imageUrl !== failedUrl;
  const placeholderLabel = unavailableLabel(name, status, Boolean(imageUrl && imageUrl === failedUrl));
  return (
    <AspectRatio ratio={210 / 297} className={styles.preview}>
      {available ? (
        <Image
          src={imageUrl}
          alt={`First page of ${name}`}
          fit="contain"
          loading="lazy"
          onError={() => setFailedUrl(imageUrl)}
        />
      ) : (
        <Tooltip label={placeholderLabel}>
          <Center className={styles.placeholder} role="img" aria-label={placeholderLabel}>
            <TopicIcon topic="rules" size={28} />
          </Center>
        </Tooltip>
      )}
    </AspectRatio>
  );
}
