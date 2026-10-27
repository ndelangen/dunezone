# GF9 Advanced to Dreamrules

Local review draft for players who know GF9 Dune 2019 Advanced. It explains the changed procedures, cards and faction powers, with examples for the rules most likely to be misplayed. It also compares the Ixians and Tleilaxu with their 2020 expansion versions. Iduali, Ecaz and Moritani are outside this draft.

The book has 31 A4 pages and uses the existing rulebook renderer, text, callout and table blocks, and Dreamrules cover preset. It has not been imported or published to production.

## Review the book

From the repository root:

```sh
bun content/dreamrules/differences/authoring/build.ts
bun content/dreamrules/differences/authoring/preview-server.ts
```

Open <http://127.0.0.1:4321/>. The page selector also supports a single-page view, such as <http://127.0.0.1:4321/?page=4>.

The PDF export is at `output/pdf/gf9-advanced-to-dreamrules-review.pdf`. The native JSON Load file is [authoring/rulebook.json](authoring/rulebook.json).

## Rules and decisions

The baseline is the GF9 2019 Advanced rulebook with the November 2020 FAQ. The Dreamrules sources are Quickstart v0.8, the eight current finished faction sheets, Dream Rulebook Edition 3, and the later rulings recorded under [#1831](https://github.com/ndelangen/dunezone/issues/1831). Later explicit rulings take precedence over older prose for the rule they address. The guide applies the later victory, sudden-death, notes and Truthtrance decisions.

Norbert decided on 27 October 2026 that the Spice deck uses **six Shai-Hulud cards**. [#1838](https://github.com/ndelangen/dunezone/issues/1838#issuecomment-6442547562) records that decision. It remains open because the shuffle recipe accounts for only five. [#1837](https://github.com/ndelangen/dunezone/issues/1837) separately tracks one versus two draw piles.

Fourteen questions remain open. The setup page and the appendix identify the affected procedures. This draft does not supply house rulings for those gaps. See [questions.json](questions.json) for the issue records and [decisions.json](decisions.json) for the new six-worm decision.

## Source records

- [sources.json](sources.json) records source precedence, URLs, hashes and limits.
- [sources/](sources/) preserves the text and public page captures used for the comparison, including the council issues and current faction sheets.
- [change-index.json](change-index.json) records 169 authored topics, examples and reference entries. That count is not a count of distinct mechanical changes.
- [authoring/coverage.json](authoring/coverage.json) maps every indexed topic to its page and block.
- [authoring/editorial-review.json](authoring/editorial-review.json) records the rules check and copy review. [The detailed edit record](authoring/copy-review-2026-10-27.json) shows the changes made after the first reader review. [The second-pass record](authoring/copy-review-second-pass-2026-10-27.json) covers the follow-up edit. The open questions appear together on page 30; affected sections use short page references.

The five mine yields were checked against the published card faces. Their catalogue descriptions contain unrelated Discovery rules, so those descriptions were excluded as rules evidence.
