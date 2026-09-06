import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/groups/$groupSlug')({
  component: Outlet,
});
