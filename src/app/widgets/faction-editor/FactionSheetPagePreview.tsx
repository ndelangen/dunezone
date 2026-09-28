import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { Faction } from '@db/factions';
import { FactionSheetView } from '@app/print/sheet/FactionSheetView';

import styles from './FactionSheetPagePreview.module.css';

/**
 * The draft as the renderers parse it: a blank name is the editor's one blocking field they must still accept, so it is represented invisibly.
 * Phase declarations are left out entirely: no printed artifact shows them, and a half-filled row would otherwise refuse the whole parse.
 */
export function factionDraftForRenderer(faction: Faction): Faction {
  const { extraPhases: _phases, ...printed } = faction;
  return printed.name.trim().length > 0 ? printed : { ...printed, name: '\u200B' };
}

function preparePreviewDocument(document: Document) {
  const base = document.createElement('base');
  base.href = window.location.href;
  document.head.append(base);

  for (const stylesheet of window.document.head.querySelectorAll('link[rel="stylesheet"], style')) {
    document.head.append(stylesheet.cloneNode(true));
  }

  document.documentElement.style.overflow = 'hidden';
  document.body.style.margin = '0';
  document.body.style.overflow = 'hidden';
}

export function FactionSheetPagePreview({ faction, pageNumber }: { faction: Faction; pageNumber: 1 | 2 }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const renderFaction = useMemo(() => factionDraftForRenderer(faction), [faction]);

  return (
    <>
      <iframe
        ref={iframeRef}
        className={styles.frame}
        srcDoc="<!doctype html><html><head></head><body></body></html>"
        title={`Faction sheet page ${pageNumber}`}
        tabIndex={-1}
        scrolling="no"
        onLoad={() => {
          const document = iframeRef.current?.contentDocument;
          if (!document) {
            return;
          }
          preparePreviewDocument(document);
          setPortalRoot(document.body);
        }}
      />
      {portalRoot
        ? createPortal(
            <div className={pageNumber === 2 ? styles.steppedToPage2 : undefined}>
              <FactionSheetView faction={renderFaction} />
            </div>,
            portalRoot
          )
        : null}
    </>
  );
}
