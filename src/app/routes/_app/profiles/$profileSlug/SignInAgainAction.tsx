import { Group } from '@mantine/core';
import { signInReturnFrom } from '@shared/authDestination';
import { Link } from '@tanstack/react-router';
import { LabeledAction } from '@ui/control/LabeledAction';
import { LogIn } from 'lucide-react';

export interface SignInAgainActionProps {
  /** The page to come back to once signed in, as a same-site path with any search it needs: "/profiles/central/edit?tab=sign-in". */
  returnTo: string;
}

/**
 * The way through a refusal that asks for a fresh sign-in: a link to the sign-in page in its re-sign-in mode, which signs the session out when a provider is picked and returns here with a full reload.
 *
 * Changing sign-in methods and deleting the account are refused when the session signed in too long ago (`needsRecentSignIn` in `@db/accounts`), so the failure that carries this action is one the reader resolves on the spot.
 * The caller hands the page to return to, since only the page knows which of its tabs or states the reader was in.
 * It lives beside the two profile routes that install it, since it routes, which a widget may not.
 */
export function SignInAgainAction({ returnTo }: SignInAgainActionProps) {
  /* The group keeps the action at its own width under the words, as `FormError` shows its actions. */
  return (
    <Group>
      <LabeledAction
        icon={<LogIn size={16} aria-hidden />}
        renderRoot={(rootProps) => (
          <Link {...rootProps} to="/auth/login" search={{ ...signInReturnFrom(returnTo), reauthenticate: true }} />
        )}
      >
        Sign in again
      </LabeledAction>
    </Group>
  );
}
