# Rulebook designs, page layouts and blocks

The catalogue needs four separate choices. Choose Size and Design when creating a rulebook. Choose a Layout for each page, then fill its regions with editable Blocks.

| Choice | What it controls |
| --- | --- |
| Size | Square, A4 or tall A4 folded lengthwise. |
| Design | The book's paper colour, type, heading bars, callout treatment, ornaments and alternating page decoration. |
| Layout | The arrangement of content on one page. |
| Blocks | The words, images, lists and other content the author edits. |

A design is a coordinated preset. It supplies the appearance of headings, examples, figures and page furniture throughout the book. Authors choose content and arrangements without having to assemble the decorative frame themselves.

## Start with the reader's task

The source rulebooks show what readers need to understand: find a stronghold, read a leader token, recognize components, learn when to play a card, follow a procedure or check an exception. Recover that purpose, identify the repeated pattern, then give authors a structured Block that serves it well.

The official pages and the earlier Dreamrules book are evidence, not reproduction targets. Their typography, exact composition and authoring mechanics do not prescribe ours. The accepted Designs remain the visual direction, while Block families, variants and controls can improve as these reader tasks become clearer. The original eleven-family inventory is a starting point rather than a fixed count.

Variants should change how a Block helps the reader. Numbers, letters and icons are marker choices. A board guide and a component anatomy guide have different explanatory jobs and may need different authoring controls. A component set belongs in an illustrated inventory when readers need to identify several pieces.

## Book designs

| Proposed design | Pattern in the references |
| --- | --- |
| Illustrated classic | Cream paper, navy major headings, blue section bars, faction colours, gold example boxes and a two-tone gold footer. Facing pages have distinct artwork: a worm at the lower left and a caped fighter at the lower right. The outer rail changes sides with the page. See compilation spreads, printed pages 6-7, 10-11 and 32-33. |
| Restrained expansion | Cream paper, navy heading bars, faction-coloured bands and the gold footer remain. Large corner illustrations give way to a quieter page. Folios alternate sides. See Ixians and Tleilaxu, printed pages 3 and 6. |

Each design needs a treatment for each size. A tall book can still use Illustrated classic, with smaller ornaments and a narrower frame. Choosing a tall size should not silently choose Restrained expansion. Alternation belongs to the book design and follows the page's position in the spread.

## Page layouts

These six interior arrangements recur across the references. Names such as "Faction rules" or "FAQ" are useful starting pages assembled from them.

| Layout | Where it appears and what it accommodates |
| --- | --- |
| Single column | Tall expansion rules. A sequence of section headings, named rules, lists and examples. |
| Two columns | FAQ and ordinary rules pages. Two reading columns beneath an optional shared heading. |
| Columns with outer rail | Base setup and faction pages; compilation tech tokens. Two columns beside a narrow rail for an emblem, quotation or captioned figures. The rail follows the outside edge. |
| Figure with explanation | Compilation components spread. A large map or component illustration beside explanatory text or a numbered key. |
| Wide band with columns | Compilation faction introduction spread. A full-width region above or below two columns, for an introduction, illustration or repeated entries. |
| Stacked panels | Tall faction introductions and the compilation's faction rows. Repeated full-width panels containing the same kinds of information. |

Cover is a separate layout with artwork, title, subtitle and edition details. Its appearance also follows the selected design.

## Editable blocks

This is the working purpose catalogue. Detailed field contracts are being resolved in [Define the authored fields and references of the new Blocks](https://github.com/ndelangen/dunezone/issues/1083).

| Block family | Reader's purpose | Author-facing content |
| --- | --- | --- |
| Section heading | Find the current topic. | Title; section or faction association. |
| Text or named rule | Understand a rule and its conditions. | Optional rule name; paragraphs. |
| List or steps | Scan related points or follow an ordered procedure. | Numbered or bulleted items. |
| Note, example or quotation | Understand an exception, see a rule applied or read supporting context. | Kind; optional title; text; quotation attribution. |
| AssetExplainer | Understand a component's information or relevant features of a board. | Live reference; authored explanations; a treatment suited to the subject; optional caption and legend. |
| Illustrated entries or inventory | Recognize a collection of pieces and their roles or quantities. | Ordered references; descriptions; optional quantities. |
| Faction introduction | Recognize a faction and understand its identity and roster. | Live faction reference; authored introduction; current faction identity, ruler and leader group. |
| Card entry or card group | Find what a card does, when to use it and how related cards differ. | One or more live card references; shared explanation; optional member-specific guidance, examples and exceptions. |
| Question and answer | Resolve a specific uncertainty. | Question; answer; optional topic. |
| Reference table | Compare cases or look up a value. | Column labels; rows; optional note. |
| Contents | Find the relevant section of the book. | Section names and Page references. |
| Credits | Identify contributors and their roles. | Credit groups, names and roles. |

The faction introduction uses the same live reference and authored introduction in a horizontal row and a vertical panel. Its arrangement follows the available region. A named rule stays editable prose whether its heading uses navy, faction purple or plain type.

### AssetExplainer treatments

| Proposed treatment | What it helps readers understand | Authoring direction |
| --- | --- | --- |
| Board focus | Where selected places are and which board features matter for this rule. | Select named regions or features, highlight them while retaining surrounding context, and connect them to explanations and a matching legend. |
| Component anatomy | What the information on a leader token, card or other component means. | Reference the component, identify the fields or parts to explain, and attach short explanations. Numbers, letters or icons can mark those parts when useful. |

The Dreamrules Strongholds page demonstrates board focus. It pairs named rules with a simplified board showing selected territories in distinct colours and a matching legend. That purpose is better served by selecting board features than by asking the author to trace them or rebuild the illustration.

Choose a treatment for the reader's task; the selected source can suggest one. A leader can also appear in a faction roster or inventory, and a board can illustrate setup rather than geography. Keep authored explanations and annotations on the Rulebook Block while its source remains a live reference. Legends should remain understandable without colour alone. HTML can connect a legend entry with its matching feature; the printed page must communicate the same information without interaction.

### Treachery card coverage

The catalogue must support an entry for every individual treachery card and for a group of cards that share an explanation. Including all of them is an author's choice.

- An individual entry presents the referenced card with authored guidance about its use. Examples, timing and exceptions can be included where they help.
- A group entry presents several referenced cards with shared guidance and any member-specific differences. Authors should not need to duplicate the whole shared explanation for every card.

The grouping belongs to the Rulebook entry. It need not introduce a new global card-group entity. Card content and images remain referenced; the Rulebook owns its explanatory text.

## Dreamrules source evidence

The user supplied an early 38-page Dreamrules PDF and a screenshot of its Strongholds page. The complete JSX source is recoverable at [f16f055](https://github.com/ndelangen/dunezone/tree/f16f055ddd6ad5aba68708e882e4fdc24552a396/src/game/book/dreamrules). It was removed in [828a36c](https://github.com/ndelangen/dunezone/commit/828a36c1e5471b141aab71a288c4cb3b4618beac), whose message explicitly retains it in history for future Rulebook work.

| Source example | Reusable purpose |
| --- | --- |
| PDF p5; [StrongholdsMap](https://github.com/ndelangen/dunezone/blob/f16f055ddd6ad5aba68708e882e4fdc24552a396/src/game/book/dreamrules/Introduction.tsx#L295-L375) | Locate selected territories, relate them to a legend and explain their rules. The old diagram uses named board geometry, rather than manually drawn regions. |
| PDF p4; [Sectors](https://github.com/ndelangen/dunezone/blob/f16f055ddd6ad5aba68708e882e4fdc24552a396/src/game/book/dreamrules/Introduction.tsx#L117-L167) | Emphasize a board layer and explain its significance. |
| PDF p8; [Lasgun entry](https://github.com/ndelangen/dunezone/blob/f16f055ddd6ad5aba68708e882e4fdc24552a396/src/game/book/dreamrules/Cards.tsx#L265-L292) | Explain one card, including interactions with other cards. |
| PDF p7; [Projectile Weapons group](https://github.com/ndelangen/dunezone/blob/f16f055ddd6ad5aba68708e882e4fdc24552a396/src/game/book/dreamrules/Cards.tsx#L163-L193) | Explain the common use of several cards together. |
| PDF p13; [Supplies! and its related cards](https://github.com/ndelangen/dunezone/blob/f16f055ddd6ad5aba68708e882e4fdc24552a396/src/game/book/dreamrules/Cards.tsx#L719-L775) | Explain a featured card's relationship to a group of other cards. |
| PDF pp10-11; [Karama and Truth Trance](https://github.com/ndelangen/dunezone/blob/f16f055ddd6ad5aba68708e882e4fdc24552a396/src/game/book/dreamrules/Cards.tsx#L394-L582) | Give a card a longer treatment using ordinary rule, example and exception Blocks around its entry. |

The old groups were hand-authored selections, sometimes using repeated copies of a representative card. The new authoring model should let users select the actual referenced members and choose a compact group or a gallery when readers need to distinguish them.

Current renderers retain the treachery-card and leader-token drawing, and the generated map retains named place geometry. These are implementation starting points. Recover their rendering behavior behind structured Blocks; the old JSX pages are reference material, not the authoring model to restore.

The [visual study](./patterns.html) shows the original catalogue in both designs on facing pages and at all three sizes. It reuses the original `public/page/bottom.svg` artwork from the old JSX book. Sample text is historical source material used to demonstrate these patterns, with short paraphrases where needed. The running prototype has not yet been updated with the newer purpose catalogue above.

## Screenshot references

- [Base setup, p6](</Users/me/Screenshots/Screenshot 2026-09-07 at 20.56.06.png>), [Fremen, p16](</Users/me/Screenshots/Screenshot 2026-09-07 at 20.56.25.png>), [FAQ, p22](</Users/me/Screenshots/Screenshot 2026-09-07 at 20.56.31.png>).
- [Compilation factions, pp6-7](</Users/me/Screenshots/Screenshot 2026-09-07 at 20.56.50.png>), [variants, pp32-33](</Users/me/Screenshots/Screenshot 2026-09-07 at 20.57.02.png>), [components, pp10-11](</Users/me/Screenshots/Screenshot 2026-09-07 at 20.57.19.png>).
- [Expansion introductions, p3](</Users/me/Screenshots/Screenshot 2026-09-07 at 20.59.34.png>), [expansion rules, p6](</Users/me/Screenshots/Screenshot 2026-09-07 at 20.59.38.png>).
