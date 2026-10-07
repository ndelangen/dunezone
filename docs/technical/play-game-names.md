# Play game names and permanent address allocation

[Generate Dune game names and allocate permanent numbered URLs](https://github.com/ndelangen/dunezone/issues/1933)
adds name and address allocation. Friendly route resolution, custom-name moderation, creation UI,
legacy backfill and schema contraction remain separate tickets in the
[Memorable Dune game names and permanent Play URLs](https://github.com/ndelangen/dunezone/issues/1931) map.

## Identity and compatibility

`play_games.name` is display wording. `play_games.slug` is the permanently allocated address.
Both fields are optional during the additive release. Database IDs still identify games in relations,
provisioning, tickets, sockets, Durable Objects and saved tables. Provisioning retries and lifecycle
changes patch the existing row without replacing its name or address.

The public `playGames.createGame` keeps its existing request and return shapes. It generates a name
inside its mutation. The internal `playGames.createNamedGame` accepts a supplied name through the same
authorization, ruleset, seat-limit and quota checks. It is reserved for the future moderation action;
there is no public way to supply a custom name in this release. Older bundles keep working.

Every current creation writer reaches `insertPendingGame`. That helper allocates the pair in the
transaction that inserts the pending game and schedules its expiry. It also names synthetic fixtures.
No migration or production fixture edit belongs to this ticket.

## Spelling and limits

`src/shared/play/gameNames.ts` owns the normalizer used by generated names, supplied names and future
availability checks. Display names use NFC, trim outer whitespace and collapse whitespace between
words. They contain 1 to 80 Unicode code points and reject controls, invisible formatting characters
and unpaired surrogates. Names can contain visible Unicode, but need a Latin letter that survives
normalization or a digit to produce an address. Emoji-only and non-Latin-only names are refused.

Addresses use NFKD, lowercase ASCII letters and digits. Combining marks disappear, apostrophes
are removed, and other characters become hyphens. `Gom Jabbar`, `Gom-Jabbar` and `gomjabbar` all
become `gomjabbar`; `Paul's` becomes `pauls`. The base is at most 64 ASCII characters and never ends
in a hyphen. A numeric suffix can bring the final address to 81 characters. Truncation can create a
duplicate base, which receives the same numeric allocation as any other collision. There is no
hexadecimal or asset-slug fallback. Asset naming semantics are unchanged.

## Vocabulary review

The generator combines ten explicit lore references with twelve scenes and seven modifier choices,
including no modifier. This gives 840 distinct display phrases and 840 distinct base addresses.
Each complete phrase contains a Dune reference. The lore entries carry separate print and URL
spellings, checked against the shared normalizer over the complete vocabulary.

| Print | URL |
| --- | --- |
| Arrakeen | arrakeen |
| Gom Jabbar | gomjabbar |
| Paul's | pauls |
| Hasimir | hasimir |
| Shai-Hulud | shai-hulud |
| Giedi Prime | giedi-prime |
| Bene Gesserit | bene-gesserit |
| Muad'Dib | muaddib |
| Caladan | caladan |
| Kwisatz Haderach | kwisatz-haderach |

Scenes are surprise party, accident, atomics battle, wedding traitor, picnic, lost invitation,
tea break, birthday conspiracy, dance rehearsal, sandwich dispute, holiday mixup and dinner ambush.
Modifiers are Family, Unexpected, Secret, Midnight, Annual and Awkward, plus the empty choice.
The phrases include the requested Arrakeen surprise party, Family Gom Jabbar accident,
Paul's atomics battle and Hasimir wedding traitor.

The complete Cartesian combinations were reviewed as phrases and URL forms. The vocabulary avoids
slurs, sexual language, religious insults and targeted descriptions of people. Lore-associated
violence remains in accident, atomics battle and dinner ambush. Modifiers and scenes introduce no
such terms when combined; joining their URL spellings creates no additional offensive word.
This is a review of this finite vocabulary, not evidence for custom-name moderation accuracy.
Inspect every complete pair with `playGameNameVocabulary()` from `convex/lib/playGameNames.ts`.

## Allocation and retention

Exact candidate checks read `play_game_slug_reservations.by_slug` and `play_games.by_slug` in the
same transaction as allocation. No lifecycle filter releases an expired, finished or discarded
address. The separate reservation survives a future hard deletion of its game; deletion code must
never remove it. `create`, `demo`, `hosted` and every token accepted by
`normalizeId('play_games', candidate)` are unavailable as base addresses, whether that ID has a row
or not. They can receive a numeric suffix.

A supplied name keeps its display wording when its base is occupied. A per-base cursor chooses
`-1` or a higher suffix, and each complete candidate still receives an exact indexed check.
An independently allocated name ending in a positive, canonical decimal suffix advances its
parent's cursor past that suffix. Leading-zero and out-of-safe-integer endings cannot be generated
by the cursor and do not advance it. A stale cursor catches up across exact occupied candidates.
The high-water mark can skip unused lower numbers; addresses are unique, never promised contiguous.

Generated names redraw at most four times, then use numeric allocation for the last phrase.
A numbered allocation probes at most 32 candidates. Unsafe or exhausted suffixes, or exhausting
that probe budget, throw `PLAY_GAME_ADDRESS_RETRY` with `retryable: true`. The caller can retry
creation; a persistent stale cursor may require the later migration's repair. The transaction rolls
back the game, reservations, cursor writes, schedules and rate-limiter consumption on failure.
No exception is caught after quota consumption. Different bases do not share an allocation cursor.

## Verification

`convex/playGames.names.test.ts` covers wording and URL equivalence, the complete vocabulary,
reserved routes, numeric custom names, stale cursors, retained reservations, length limits,
bounded redraws, atomic rollback and legacy request/return compatibility. Existing creation,
security and provisioning suites cover the surrounding authorization and lifecycle contracts.

The mock's IDs contain a table-name suffix and do not model production's encoded ID namespace.
`bun run scripts/verify-play-game-addresses.ts` therefore creates its own disposable Docker-backed
Convex deployment. Two batches of eight independently issued HTTP mutations request the same name,
then verify 16 distinct complete addresses. The proof also supplies an existing game ID and an
accepted ID token whose row was deleted. Both must receive `-1`. Six old-shape public creation
requests prove generated names and compatible returns against the real backend.

The proof accepts only its own loopback origin, uses synthetic sessions, performs no paid API call
and deletes its Docker project, volume and temporary credentials. It prints safe name/address
records. The new allocation tables are excluded from the anonymised snapshot alongside games.
