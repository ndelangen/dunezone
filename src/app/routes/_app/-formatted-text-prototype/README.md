# Formatted text control prototype

Three browser variants test one small authored-text grammar in four representative fields. The route uses in-memory state only.

## Verdict

Variant A, `split`, was accepted for the writing interaction. Its rendered preview is useful for inspecting this prototype, but it is not part of the production control. Production fields use their normal renderer when they need visual feedback.

The production control stores a normalized string. Authors primarily use the toolbar and keyboard shortcuts; they can also type the small syntax directly. Parsing errors remain editable, explain the exact problem, and block Save. Formatting commands refuse changes that would create invalid text.

Run:

```sh
bun run prototype:formatted-text
```

Open:

```text
http://localhost:4174/formatted-text-prototype?variant=split
```

Variants:

- `split`: one multiline control beside a live preview.
- `guided`: paragraph and list-item structure is edited without blank-line or list-prefix syntax.
- `preview-first`: formatted output is primary and the editor opens when requested.

Prototype grammar assumptions are deliberately visible for review:

- `*text*`, `-text-`, and `_text_` store bold, italic, and underline.
- A single newline renders a line break. A blank line starts a paragraph. Consecutive `- ` lines form one list.
- A line indented by two spaces continues the preceding list item and renders after a line break. A blank line ends that list.
- Different formatting marks may nest when they close in order. Formatting may span a line break, but it cannot cross a paragraph or list item.
- When the same words have several styles, controls store them in a fixed order: underline outside italic outside bold (`_-*text*-_`).
- A backslash escapes `*`, `-`, `_`, and another backslash.
- Paste keeps plain text, normalizes line endings, collapses repeated blank lines, and converts common bullet characters to `- `.
- Enter after a populated list item starts another `- ` item. Enter on an empty list item ends the list and starts a normal paragraph.
- Shift+Enter inside a list item inserts a two-space continuation line. Enter from a populated continuation starts the next list item.
- An empty string is valid grammar. A field may still require content before it can be saved.
- Requiredness belongs to the consuming field. The About example is optional; the other examples demonstrate required-field validation.
- Invalid grammar remains editable and visible, but it is not ready to save.
- Storage keeps the normalized source string. Parsed blocks are derived for validation and rendering rather than stored.
