import { StatusBadge } from '@ui/content/StatusBadge';
import type { StatusBadgeTone } from '@ui/content/StatusBadge';
import { IconAction } from '@ui/control/IconAction';
import { FileDown, FileText } from 'lucide-react';

export type EditionArtifactKind = 'html' | 'pdf';

export type EditionArtifactReadiness = {
  status: 'preparing' | 'ready' | 'failed';
  href: string | null;
};

const TONE: Record<EditionArtifactReadiness['status'], StatusBadgeTone> = {
  preparing: 'progress',
  ready: 'positive',
  failed: 'negative',
};

/**
 * One Edition artifact as the reader meets it: a quiet link to its permanent file once ready, and its readiness as a status until then.
 * Callers own which Edition and which kind.
 * This owns that readiness stays secondary to the Edition data beside it, that a ready file opens in its own tab, and the words a status uses, so the reader and the Editions page say the same thing.
 */
export function EditionArtifactLink({
  kind,
  artifact,
  size = 'md',
}: {
  kind: EditionArtifactKind;
  artifact: EditionArtifactReadiness;
  size?: 'sm' | 'md';
}) {
  const label = `Open Edition ${kind.toUpperCase()}`;
  const href = artifact.status === 'ready' ? artifact.href : null;
  if (href) {
    return (
      <IconAction
        label={label}
        tooltip={label}
        emphasis="quiet"
        intent="neutral"
        size={size}
        icon={
          kind === 'html' ? (
            <FileText size={size === 'sm' ? 15 : 17} aria-hidden />
          ) : (
            <FileDown size={size === 'sm' ? 15 : 17} aria-hidden />
          )
        }
        renderRoot={(props) => (
          <a {...props} href={href} target="_blank" rel="noreferrer">
            {props.children}
          </a>
        )}
      />
    );
  }
  return <StatusBadge tone={TONE[artifact.status]}>{`${kind.toUpperCase()} ${artifact.status}`}</StatusBadge>;
}
