import { Badge, Stack } from '@mantine/core';
import type { ReactNode } from 'react';

export interface ProposedContentProps {
  /** What is missing and why, e.g. `Proposed content · page query required`. */
  label: string;
  /** Prose describing what would appear here once the work lands. */
  children: ReactNode;
}

/**
 * Marks a shipped region as scaffolding rather than data.
 * 
 * The badge is the whole component: without it, prose describing a feature that does not exist reads as a factual statement about the record on screen.
 * It lives in the application rather than the interface kit because it describes our roadmap, not a way of presenting content — and because every use of it is a debt to be removed, `grep
 * ProposedContent` should list them all.
 */
export function ProposedContent({ label, children }: ProposedContentProps) {
  return (
    <Stack gap="sm">
      <Badge variant="default" w="fit-content">
        {label}
      </Badge>
      {children}
    </Stack>
  );
}
