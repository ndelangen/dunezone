import { useEffect } from 'react';
import type { RefObject } from 'react';

/* Each conversation's newest-message markers that are on screen now, one per open chat panel showing it. */
const visibleEnds = new Map<string, Set<Element>>();

/** Whether the viewer can see this conversation's newest messages now: scrolled to the end in an open panel, page not hidden. Such a message makes no sound (#2982). */
export function isViewingConversation(peerId: string) {
  return document.visibilityState === 'visible' && (visibleEnds.get(peerId)?.size ?? 0) > 0;
}

function forget(peerId: string, target: Element) {
  const ends = visibleEnds.get(peerId);
  ends?.delete(target);
  if (ends?.size === 0) {
    visibleEnds.delete(peerId);
  }
}

/** Counts the conversation as in view while the marker after its newest message is on screen. */
export function useViewingConversation(peerId: string, end: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const target = end.current;
    if (!target || typeof IntersectionObserver === 'undefined') {
      return;
    }
    /* A viewport-root observer accounts for both a scrolled-back history and the panel itself being off screen. */
    const observer = new IntersectionObserver(
      (entries) => {
        /* Several crossings can queue up for this one marker; the last is where it is now. */
        const entry = entries.at(-1);
        if (entry?.isIntersecting && entry.intersectionRatio > 0) {
          visibleEnds.set(peerId, (visibleEnds.get(peerId) ?? new Set()).add(target));
        } else {
          forget(peerId, target);
        }
      },
      { threshold: 0 }
    );
    observer.observe(target);
    return () => {
      observer.disconnect();
      forget(peerId, target);
    };
  }, [peerId, end]);
}
