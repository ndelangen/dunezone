import { createFileRoute, redirect } from '@tanstack/react-router';

import { validateMediaSearch } from './media/mediaCatalogue';
import { mediaLocation } from './media/mediaNavigation';

export const Route = createFileRoute('/_app/__media')({
  validateSearch: validateMediaSearch,
  beforeLoad: ({ search }) => {
    throw redirect({ ...mediaLocation(search), replace: true });
  },
});
