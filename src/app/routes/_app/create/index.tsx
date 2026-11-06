import { createFileRoute } from '@tanstack/react-router';

import { publicPageHead } from '@app/routes/publicPage';
import { TutorialCatalogue } from '@app/widgets/tutorial-catalogue/TutorialCatalogue';
import type { CatalogueRow } from '@app/widgets/tutorial-catalogue/TutorialCatalogue';

import { CREATOR_PARTS, CREATOR_TUTORIALS, creatorArt } from './creatorTutorials';

/* The Creating content tutorials, beside the Play chapters with the same tiles; each written tutorial lives below /create. */
export const Route = createFileRoute('/_app/create/')({
  ssr: true,
  head: () =>
    publicPageHead({
      name: 'Learn to create custom Dune content',
      kind: 'Tutorials',
      pathname: '/create',
      description:
        'Tutorials for making your own homebrew content for the Dune board game: factions, cards, tokens, boards, Rulesets and Rulebooks.',
      social: { kind: 'Tutorials', shape: 'portrait' },
    }),
  component: CreatorTutorials,
});

const ROWS: readonly CatalogueRow[] = CREATOR_PARTS.map((part) => ({
  part,
  tiles: CREATOR_TUTORIALS.filter((tutorial) => tutorial.part === part).map((tutorial) => ({
    ...tutorial,
    art: creatorArt(tutorial),
    link: tutorial.page,
  })),
}));

function CreatorTutorials() {
  return <TutorialCatalogue track="create" rows={ROWS} />;
}
