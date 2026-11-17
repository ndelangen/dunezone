import { useEffect } from 'react';

/* The conversations a chat panel shows right now, each counted by its open panels. */
const viewing = new Map<string, number>();

/** Whether a chat panel shows this conversation now: a message arriving there is already in view, so it makes no sound (#2982). */
export function isViewingConversation(peerId: string) {
  return (viewing.get(peerId) ?? 0) > 0;
}

/** Marks the conversation as in view while the calling panel is mounted. */
export function useViewingConversation(peerId: string) {
  useEffect(() => {
    viewing.set(peerId, (viewing.get(peerId) ?? 0) + 1);
    return () => {
      const left = (viewing.get(peerId) ?? 1) - 1;
      if (left > 0) {
        viewing.set(peerId, left);
      } else {
        viewing.delete(peerId);
      }
    };
  }, [peerId]);
}
