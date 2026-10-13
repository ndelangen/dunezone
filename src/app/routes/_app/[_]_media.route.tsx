import { createFileRoute, redirect } from '@tanstack/react-router';

import { mediaLocation } from './media/mediaNavigation';
import { validateMediaSearch } from './media/mediaSearchParams';

export const Route = createFileRoute('/_app/__media')({
  validateSearch: validateMediaSearch,
  beforeLoad: ({ search }) => {
    throw redirect({ ...mediaLocation(search), replace: true });
  },
});
