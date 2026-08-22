export interface SlugRenameNoticeProps {
  /** What is being renamed, in the reader's words, `group`, `ruleset`, `profile`. */
  noun: string;
  /** The address as it stands, e.g. `…/rulesets/dune-classic`. Shown so the reader sees the stakes. */
  url: string;
  /** One extra clause where the rule is not just "the name becomes the address". */
  note?: string;
}

/**
 * Warns that renaming something moves it.
 *
 * Callers own the words that identify the thing and its current address;
 * this owns the sentence that says what renaming costs.
 * It exists because three settings forms each wrote that warning by hand and each said something slightly different about it, one mentioned bookmarks, one mentioned shared links, one hedged with "may" where another promised "will".
 */
export function SlugRenameNotice({ noun, url, note }: SlugRenameNoticeProps) {
  return (
    <>
      Renaming this {noun} changes its address (<code>{url}</code>), and bookmarks or shared links to the old one stop
      working.
      {note ? ` ${note}` : null}
    </>
  );
}
