/** Why a Google or Discord sign-in sent the reader back to the sign-in page, carried as its `failed` search. */
export const signInFailures = {
  unfinished: 'The sign-in did not finish. It may have been cancelled, or the provider did not confirm your account.',
  inactive: 'This account cannot sign in while it is being deleted or merged.',
  failed: 'The sign-in could not be completed.',
} as const;

export type SignInFailure = keyof typeof signInFailures;

export function isSignInFailure(value: unknown): value is SignInFailure {
  return typeof value === 'string' && Object.hasOwn(signInFailures, value);
}
