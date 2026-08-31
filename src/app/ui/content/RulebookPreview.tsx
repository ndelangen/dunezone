import { AspectRatio, Center, Image, Tooltip } from '@mantine/core';
import { useState } from 'react';

import styles from './RulebookPreview.module.css';
import { TopicIcon } from './TopicIcon';

/** A published first page, or an explicitly unavailable preview, at the document's A4 ratio. */
export function RulebookPreview({ name, imageUrl }: { name: string; imageUrl?: string | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const available = imageUrl && imageUrl !== failedUrl;
  return (
    <AspectRatio ratio={210 / 297}>
      {available ? (
        <Image
          src={imageUrl}
          alt={`First page of ${name}`}
          fit="contain"
          loading="lazy"
          onError={() => setFailedUrl(imageUrl)}
        />
      ) : (
        <Tooltip label="First-page preview unavailable">
          <Center className={styles.placeholder} role="img" aria-label={`First-page preview unavailable for ${name}`}>
            <TopicIcon topic="rules" size={28} />
          </Center>
        </Tooltip>
      )}
    </AspectRatio>
  );
}
