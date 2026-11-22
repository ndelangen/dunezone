import type { ConversationMessage } from '@shared/play/conversations';
import type { TablePing } from '@shared/play/protocol';
import { useEffect, useState } from 'react';

import type { TableSession } from '../../../../db/tabletop/TableSession';
import { createCameraLook } from '../../../../widgets/tabletop/cameraLook';
import type { CameraLook } from '../../../../widgets/tabletop/cameraLook';

/* What is kept while nobody listens: the newest few, and only for a few seconds, so a listener that comes late hears what it just missed and nothing stale. */
const KEPT = 20;
const KEPT_MS = 5000;

/** Events heard as they happen, kept for a moment while nothing listens, then handed to the next listener. */
export type BufferedSource<Args extends unknown[]> = Readonly<{
  push: (...args: Args) => void;
  subscribe: (listener: (...args: Args) => void) => () => void;
}>;

/**
 * A source that keeps what it hears until its first listener subscribes, for at most a few seconds, and hands that over.
 * Once a listener has come, what arrives while none listens is dropped: a listener that left, as chat notices turned off, wants none of it later.
 */
export function bufferedSource<Args extends unknown[]>(
  now: () => number = () => performance.now()
): BufferedSource<Args> {
  const listeners = new Set<(...args: Args) => void>();
  let kept: { at: number; args: Args }[] = [];
  let heardOnce = false;
  return {
    push: (...args) => {
      if (listeners.size > 0) {
        listeners.forEach((listener) => listener(...args));
        return;
      }
      if (!heardOnce) {
        kept = [...kept, { at: now(), args }].slice(-KEPT);
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      heardOnce = true;
      const missed = kept.filter((entry) => now() - entry.at <= KEPT_MS);
      kept = [];
      missed.forEach((entry) => listener(...entry.args));
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type NoticeFeeds = Readonly<{
  messages: BufferedSource<[peerId: string, message: ConversationMessage]>;
  pings: BufferedSource<[ping: TablePing]>;
  /** The table's camera look, which a notice about a spot asks to look there. */
  cameraLook: CameraLook;
}>;

/**
 * What the soft notices hear from the live table: chat messages and pings, heard from when the table shows rather than from when the notices' lazily loaded code arrives, so nothing in between is lost.
 * The camera look is the one a story or an outer page provides, else the table's own.
 */
export function useNoticeFeeds(client: TableSession, outerLook: CameraLook | null): NoticeFeeds {
  const [feeds] = useState(() => ({
    messages: bufferedSource<[string, ConversationMessage]>(),
    pings: bufferedSource<[TablePing]>(),
    cameraLook: createCameraLook(),
  }));
  useEffect(() => {
    const stop = client.conversations.subscribeMessages(feeds.messages.push);
    return () => {
      stop();
    };
  }, [client, feeds]);
  useEffect(() => {
    const stop = client.subscribePings(feeds.pings.push);
    return () => {
      stop();
    };
  }, [client, feeds]);
  return outerLook ? { ...feeds, cameraLook: outerLook } : feeds;
}
