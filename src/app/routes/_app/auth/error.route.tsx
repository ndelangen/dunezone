import { createFileRoute } from '@tanstack/react-router';

import { pageHead } from '@app/routes/pageTitle';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

export const Route = createFileRoute('/_app/auth/error')({
  head: () => pageHead('Sign-in error'),
  component: AuthErrorPage,
  validateSearch: (params) => {
    if (params.error && typeof params.error === 'string') {
      return { error: params.error };
    }
    return null;
  },
});

function AuthErrorPage() {
  const params = Route.useSearch();
  const detail = params?.error ? ` Error code: ${params.error}.` : '';

  return (
    <PageMessage
      title="Sign-in error"
      lede={`Sorry, something went wrong while signing you in.${detail}`}
      back={<PageMessage.Home />}
      card={{ name: 'Sign-in failed', code: params?.error ? `Error: ${params.error}` : 'Sign-in error' }}
    />
  );
}
