import { createFileRoute, Outlet } from '@tanstack/react-router';

/* Server-rendered so the catalogue and the chapters below it render for crawlers; a child cannot render on the server unless this layout does. */
export const Route = createFileRoute('/_app/tutorial')({ ssr: true, component: Outlet });
