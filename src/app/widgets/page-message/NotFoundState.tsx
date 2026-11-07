import { PageState } from '@ui/block/PageState';

const capitalised = (noun: string) => `${noun[0]?.toUpperCase() ?? ''}${noun.slice(1)}`;

export interface NotFoundStateProps {
  /** What is missing, as the page names it: "ruleset", "FAQ question", "deck". */
  noun: string;
  /** The address is a slug that a rename replaces, so an old link may have moved. */
  renamed?: boolean;
}

/** The one sentence for a thing that is not there, which `RouteNotFound` says in the band. */
export function notFoundSentence(noun: string, renamed = false): string {
  return `This ${noun} does not exist or was deleted.${renamed ? ' Its address may have changed after a rename.' : ''}`;
}

/** The one wording for a thing that is not there, for a page that draws its own frame (the asset editors). */
export function NotFoundState({ noun, renamed = false }: NotFoundStateProps) {
  return (
    <PageState kind="absent" title={`${capitalised(noun)} not found`}>
      {notFoundSentence(noun, renamed)}
    </PageState>
  );
}
