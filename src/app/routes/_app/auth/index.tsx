import { createFileRoute, Link } from '@tanstack/react-router';

import { PageLayout } from '@app/components/shell';

export const Route = createFileRoute('/_app/auth/')({
  component: AuthLandingPage,
});

function AuthLandingPage() {
  return (
    <PageLayout
      header={
        <h1>
          <span>TANSTACK</span> <span>AUTH</span>
        </h1>
      }
    >
      <p>The framework for next generation AI applications</p>
      <p>
        Full-stack framework powered by TanStack Router for React and Solid. Build modern
        applications with server functions, streaming, and type safety.
      </p>
      <div>
        <Link to="/auth/login">Sign in</Link>
        <a href="https://tanstack.com/start" target="_blank" rel="noopener noreferrer">
          Documentation
        </a>
        <p>
          Begin your TanStack Start journey by editing <code>/src/routes/index.tsx</code>
        </p>
      </div>
    </PageLayout>
  );
}
