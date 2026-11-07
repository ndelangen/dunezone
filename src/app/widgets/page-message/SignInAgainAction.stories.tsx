import preview from '@sb/preview';
import { FormError } from '@ui/block/FormError';
import { expect, within } from 'storybook/test';

import { SignInAgainAction } from './SignInAgainAction';

const meta = preview.meta({
  component: SignInAgainAction,
  parameters: { layout: 'padded' },
  args: { returnTo: '/profiles/central/edit?tab=sign-in' },
});

/** The link names the sign-in page's re-sign-in mode and carries the page to come back to, search included. */
export const Default = meta.story({
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('link', { name: 'Sign in again' })).toHaveAttribute(
      'href',
      '/auth/login?redirect=%2Fprofiles%2Fcentral%2Fedit%3Ftab%3Dsign-in&reauthenticate=true'
    );
  },
});

/** Under the refusal it resolves, as the two account pages show it. */
export const UnderARefusal = meta.story({
  render: (args) => (
    <FormError title="Sign-in methods could not be changed" action={<SignInAgainAction {...args} />}>
      Sign in again to confirm it is you, then try again.
    </FormError>
  ),
});
