import type { ReactNode } from 'react';

import { card } from '../../data/sizes';

/** Cards side by side at a quarter of their 900px canvas, so a whole deck can be reviewed in one view. */
export function CardGallery({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, padding: 16 }}>{children}</div>;
}

/** One card in a gallery, named for the reader since the card itself draws its name as artwork. */
export function GalleryCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure aria-label={label} style={{ margin: 0, width: card.width, height: card.height, zoom: 0.25 }}>
      {children}
    </figure>
  );
}
