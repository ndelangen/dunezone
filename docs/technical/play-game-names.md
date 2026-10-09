# Play game names and permanent address allocation

[Generate Dune game names and allocate permanent numbered URLs](https://github.com/ndelangen/dunezone/issues/1933)
adds name and address allocation. Server moderation is implemented by
[Block profane game names and allow creation when checks fail](https://github.com/ndelangen/dunezone/issues/1936).
Friendly route resolution, creation UI,
legacy backfill and schema contraction remain separate tickets in the
[Memorable Dune game names and permanent Play URLs](https://github.com/ndelangen/dunezone/issues/1931) map.

## Identity and compatibility

`play_games.name` is display wording. `play_games.slug` is the permanently allocated address.
Both fields are optional during the additive release. Database IDs still identify games in relations,
provisioning, tickets, sockets, Durable Objects and saved tables. Provisioning retries and lifecycle
changes patch the existing row without replacing its name or address.

The public `playGames.createGame` keeps its existing request and return shapes. It generates a name
inside its mutation. The public `playGames.createGameWithName` action accepts a custom name on
submission. It authenticates and validates before one bounded provider request, then passes the
exact checked name, normalized base and server-derived outcome to the internal
`playGames.createNamedGame` mutation. That mutation rechecks authorization, ruleset readiness,
seats and creation quota before atomic address allocation, insertion and scheduling.
The custom-name field belongs to the later creation-UI ticket. Older bundles keep working.

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
in a hyphen. A base-36 suffix can bring the final address to 78 characters. Truncation can create a
duplicate base, which receives the same suffix allocation as any other collision. The suffix uses the [shared collision selector](slug-allocation.md).
Each domain keeps its own normalization, namespace and address retention rules.

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

## Custom-name checking

The regex checks printable wording and normalized URL text. A local positive blocks creation before
any paid request. It recognizes common spelling, spacing, accent and symbol disguises without
rejecting substrings in ordinary names. Ambiguous whole words such as Dick, ass, cock, prick and
bastard reach Jev for context judgment. An explicit U+1F595 rule blocks the middle-finger gesture,
including skin-tone and presentation variants. Harmless emoji remain usable.

The server calls `jev-1.13.0` with the frozen fuller policy D at threshold 0.80. Only the name,
normalized base and URL text are sent. Embedded commands remain text to classify. The server key
stays in `TYPESAFE_API_KEY`. One request has a two-second deadline covering both the request and
response body; there are no automatic retries. Responses must carry the pinned model, a Noul answer
and a finite probability between zero and one.

A probability of at least 0.80 blocks creation. A valid lower probability is no profanity detected,
including uncertainty. Missing credentials, exhausted credits, rate limits, transport failures,
timeouts and unusable answers are check unavailable. Creation then keeps the valid supplied name,
unless the regex detects profanity. Neither uncertainty nor failure is described as approval.
Unavailable acceptance logs only the event, model and failure category, never name text, identity,
keys or raw provider responses.

Checking capacity is bounded per account and globally, separately from creation quota. Exhausted
checking capacity follows the same unavailable policy. Authorization, ordinary validation, readiness,
seat limits, creation quota and uniqueness remain mandatory. Refusals spend no creation token and
leave no game or provisioning schedule. A thrown allocation failure rolls back all creation writes.

[Norbert's acceptance decision](https://github.com/ndelangen/dunezone/issues/1947#issuecomment-6044471397)
applies the unchanged English targets to the regex and Jev together. The
[frozen fresh evaluation](https://gist.github.com/ndelangen/ad5850fb2a7a9c523fceafacecc8b5ce/068324e69696f227595d0e000dc2e2e041320c3d)
records Jev's two English disguise misses, both caught locally. Multilingual checking is best-effort;
the French diagnostic miss remains recorded. The small synthetic corpus is not a general language
coverage guarantee. The tested compact policy was rejected after missing four tuning examples.

## Allocation and retention

Exact candidate checks read `play_game_slug_reservations.by_slug` and `play_games.by_slug` in the
same transaction as allocation. No lifecycle filter releases an expired, finished or discarded
address. The separate reservation survives a future hard deletion of its game; deletion code must
never remove it. `create`, `demo`, `hosted` and every token accepted by
`normalizeId('play_games', candidate)` are unavailable as base addresses, whether that ID has a row
or not. They can receive a counter suffix.

A supplied name keeps its display wording when its base is occupied. A per-base cursor chooses
`-1` or a higher counter encoded in lowercase base 36, so the sequence continues through `-9`,
`-a`, `-z` and `-10`. Every complete candidate receives an exact indexed check.
Every final address passes local profanity checks. Meaningless generated suffixes also reject
embedded profane words, including context-dependent words, before availability is checked.
Independently entered name endings never advance another base's cursor. Generated names redraw
at most four times, then use suffix allocation for the last phrase. Selection probes four counter
candidates, then two 64-bit random base-36 candidates padded to 13 characters. Random candidates
recover dense occupied windows without a repair or unsafe cursor jump. Exhausted or unsafe counters
use the same random recovery. Complete failure throws `PLAY_GAME_ADDRESS_RETRY` with `retryable: true`;
a new mutation attempt draws fresh candidates. The transaction rolls back the game, reservations,
cursor writes, schedules and rate-limiter consumption on failure.
No exception is caught after quota consumption. Different bases do not share an allocation cursor.

## Verification

`convex/playGames.names.test.ts` covers wording and URL equivalence, the complete vocabulary,
reserved routes, independently entered suffixes and base-36 boundaries, stale cursors, retained
reservations, length limits,
bounded redraws, atomic rollback and legacy request/return compatibility. Existing creation,
security and provisioning suites cover the surrounding authorization and lifecycle contracts.

`convex/playGames.moderation.test.ts` covers provider detection, valid uncertainty, local positives
during an outage, bounded request and body timeouts, billing and transport failures, malformed
responses, sanitized logging, unavailable acceptance and access changes while checking is in flight.
The creation browser journey also checks the compatible path's generated name and final address.

The mock's IDs contain a table-name suffix and do not model production's encoded ID namespace.
`bun run scripts/verify-play-game-addresses.ts` therefore creates its own disposable Docker-backed
Convex deployment. Two batches of eight independently issued HTTP mutations request the same name,
then verify 16 distinct complete addresses. The proof also supplies an existing game ID and an
accepted ID token whose row was deleted. Both must receive `-1`. Six old-shape public creation
requests prove generated names and compatible returns against the real backend.
The public custom-name action is then checked on the keyless backend: local profanity and invalid
names refuse creation, accepted names retain their wording during complete checking failure, and
those refusals preserve all three initial creation tokens.

The proof accepts only its own loopback origin, uses synthetic sessions, performs no paid API call
and deletes its Docker project, volume and temporary credentials. It prints safe name/address
records. The new allocation tables are excluded from the anonymised snapshot alongside games.

The [retained real-backend proof](https://gist.github.com/ndelangen/9893fb47a485f5b926a64d3beb532758)
records the successful 7 October 2026 run and its safe synthetic name/address results.
