/** The project's source repository, where its issues and ideas live. */
export const GITHUB_REPOSITORY = 'https://github.com/ndelangen/dunezone';

/** Where a reader proposes an idea: the repository's new-issue chooser. */
export const GITHUB_IDEAS = `${GITHUB_REPOSITORY}/issues/new/choose`;

export const GITHUB_BACKLOG = `${GITHUB_REPOSITORY}/issues`;

export function githubIssueHref(issue: number): string {
  return `${GITHUB_BACKLOG}/${issue}`;
}
