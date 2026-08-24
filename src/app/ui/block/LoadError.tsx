import { Button, Stack, Text, Title } from '@mantine/core';

import { FormError } from './FormError';

export interface LoadErrorProps {
  /** What failed, as the reader would say it, "Faction could not be loaded". Ignored on the stale path, which has its own sentence. */
  title: string;
  /** The reason, off the caught error. Empty is expected and handled, since an error reaching a route need not carry a message. */
  children: string;
  /** The stale-tab signal: this tab is running an older bundle than the data it was sent, so the way forward is a reload rather than the reason. */
  stale?: boolean;
}

/**
 * Says that a page did not load, and either why or what to do about it.
 *
 * `FormError`'s sibling, and it composes it: an action that did not happen and a page that did not load are the same sentence with the same treatment, so the colour and the live region are stated once.
 * What this adds is the second case, because a page has a failure mode a form does not: the reader's tab can be running an older bundle than the data it was sent, and then the message is not the point and the reload is.
 *
 * Whether that is the case is the caller's to decide, not this component's: answering it needs `isStaleClientData` from the data layer, which the kit may not import, and a page has it to hand anyway.
 *
 * It exists because five routes overrode `errorComponent` and each rendered the failure as a red alert, so on those five the stale case arrived with its message and no way forward, telling the reader the data did not match this version of the app and leaving them to work out that reloading fixes it (#700).
 */
export function LoadError({ title, children, stale = false }: LoadErrorProps) {
  if (stale) {
    return (
      <Stack gap="sm" align="center" role="alert">
        <Title order={2}>This page changed</Title>
        <Text size="sm">The data no longer matches this version of the app.</Text>
        <Button onClick={() => window.location.reload()}>Refresh</Button>
      </Stack>
    );
  }
  return <FormError title={title}>{children || 'An unexpected error occurred.'}</FormError>;
}
