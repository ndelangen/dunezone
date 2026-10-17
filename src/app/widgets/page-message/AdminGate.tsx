import { LoadPending } from '@ui/block/LoadPending';
import { NotAvailable } from '@ui/block/NotAvailable';
import type { PageHeaderSize } from '@ui/layout/PageLayout';
import type { ReactNode } from 'react';

import type { SessionViewer } from '@db/profiles';

import { LoginGate } from './LoginGate';
import { PageMessage } from './PageMessage';

export interface AdminGateProps {
  /** Who is reading, from `useSessionViewer`. */
  viewer: SessionViewer;
  /** The page's own name, worn by every message the gate shows in its place. */
  title: string;
  size?: PageHeaderSize;
  /** What the page is for, finishing "Sign in to …": "view migration activity". */
  action: string;
  /** The loading message, shown while the session resolves; the page shows the same one while its own data loads. */
  loading: ReactNode;
  deniedTitle: string;
  deniedMessage: string;
  /** The admin page itself, mounted only for an administrator, so its admin-only query is never asked by anyone else. */
  children: ReactNode;
}

/*
 * Early returns rather than a ternary chain inside the content: each gate is the whole page rather than one region of it,
 * so a reader who may not see the dashboard does not get its header and description.
 */
export function AdminGate({
  viewer,
  title,
  size,
  action,
  loading,
  deniedTitle,
  deniedMessage,
  children,
}: AdminGateProps) {
  if (viewer.kind === 'pending') {
    return loading;
  }
  if (viewer.kind === 'signed-out') {
    return (
      <PageMessage size={size} title={title}>
        <LoginGate action={action} />
      </PageMessage>
    );
  }
  if (!viewer.isAdmin) {
    return (
      <PageMessage size={size} title={title}>
        <NotAvailable title={deniedTitle}>{deniedMessage}</NotAvailable>
      </PageMessage>
    );
  }
  return children;
}

/** An admin page's loading message, for the gate and for the page while its data arrives. */
export function AdminPageLoading({
  title,
  size,
  children,
}: {
  title: string;
  size?: PageHeaderSize;
  children: string;
}) {
  return (
    <PageMessage size={size} title={title}>
      <LoadPending title={`Loading ${title.toLowerCase()}`}>{children}</LoadPending>
    </PageMessage>
  );
}
