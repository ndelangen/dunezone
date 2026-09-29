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

/* Why an unready file cannot be opened, said on the action itself. */
const UNAVAILABLE: Record<EditionArtifactReadiness['status'], (kind: string) => string> = {
  preparing: (kind) => `The ${kind} is still being prepared.`,
  failed: (kind) => `The ${kind} could not be prepared.`,
  ready: (kind) => `The ${kind} has no link yet.`,
};

const GLYPH_SIZE = { sm: 15, md: 17, lg: 17 } as const;

/**
 * One Edition artifact as the reader meets it: a quiet link to its permanent file once ready, and its readiness as a status until then.
 * Callers own which Edition and which kind.
 * This owns that readiness stays secondary to the Edition data beside it, that a ready file opens in its own tab, and the words a status uses, so the reader and the Editions page say the same thing.
 * At `size="lg"` it is a toolbar action like any other, so an unready file is the same action, disabled, saying why on hover: a toolbar carries actions, never statuses (Norbert, 2026-09-29).
 */
export function EditionArtifactLink({
  kind,
  artifact,
  size = 'md',
}: {
  kind: EditionArtifactKind;
  artifact: EditionArtifactReadiness;
  size?: 'sm' | 'md' | 'lg';
}) {
  const label = `Open Edition ${kind.toUpperCase()}`;
  const href = artifact.status === 'ready' ? artifact.href : null;
  const Glyph = kind === 'html' ? FileText : FileDown;
  const glyph = <Glyph size={GLYPH_SIZE[size]} aria-hidden />;
  if (href) {
    return (
      <IconAction
        label={label}
        tooltip={label}
        emphasis={size === 'lg' ? 'standard' : 'quiet'}
        intent="neutral"
        size={size}
        icon={glyph}
        renderRoot={(props) => (
          <a {...props} href={href} target="_blank" rel="noreferrer">
            {props.children}
          </a>
        )}
      />
    );
  }
  const status = `${kind.toUpperCase()} ${artifact.status}`;
  if (size === 'lg') {
    return (
      <IconAction
        label={label}
        disabledReason={UNAVAILABLE[artifact.status](kind.toUpperCase())}
        emphasis="standard"
        intent="neutral"
        size={size}
        icon={glyph}
      />
    );
  }
  return <StatusBadge tone={TONE[artifact.status]}>{status}</StatusBadge>;
}
