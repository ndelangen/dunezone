import { createFileRoute, redirect } from '@tanstack/react-router';

/*
 * Nothing links here; the page it used to show was TanStack starter copy left over from
 * scaffolding. A typed /auth lands on the real sign-in page instead of a 404.
 */
export const Route = createFileRoute('/_app/auth/')({
  beforeLoad: () => {
    throw redirect({ to: '/auth/login' });
  },
});
