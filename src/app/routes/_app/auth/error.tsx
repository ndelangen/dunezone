import { createFileRoute } from '@tanstack/react-router';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';

export const Route = createFileRoute('/_app/auth/error')({
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

  return (
    <PageLayout>
      <PageLayout.Header>
        <h1>Sign-in error</h1>
      </PageLayout.Header>
      <PageLayout.Content>
        <Surface padding="lg">
          <h2>Sorry, something went wrong.</h2>
          {params?.error ? <p>Code error: {params.error}</p> : <p>An unspecified error occurred.</p>}
        </Surface>
      </PageLayout.Content>
    </PageLayout>
  );
}
