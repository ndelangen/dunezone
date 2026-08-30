# Operational traps

Things about this repo's tooling that behave in a way you would not predict, each one paid for at
least once. They are here because they cost time in a session that could not hand the knowledge on,
and because none of them is discoverable from the code you are looking at when you hit it.

Every entry names what goes wrong, what it looks like when it does, and what to do instead. Where a
trap has a symptom that reads as success, that is said first, because those are the expensive ones.

## Storybook silently takes a different port

`storybook dev -p 6006` does not fail when 6006 is busy. It increments and serves on the next free
port, prints the number, and behaves normally. Another worktree's server keeps the port it took.

**What it looks like when it bites:** you attach to `localhost:6006`, screenshot a page, and publish
a proof shot of a different branch's code. The port answered, so nothing looked wrong.

Pick a port, confirm it is free before starting, and after starting confirm the process serving it is
yours:

```bash
lsof -nP -iTCP:6006 -sTCP:LISTEN            # free if this prints nothing
lsof -a -p "$PID" -d cwd -Fn                # the listener's working directory
```

That the port answers is not evidence. The listener's working directory is.

## `.claude/launch.json` is tracked and locally dirty by design

The file is checked in, and the root checkout carries local edits to it as a matter of course. Any
command that discards working-tree changes takes them with it.

Park the branch with `git switch` or `git pull --ff-only`. Reach for `git reset --hard` in the root
checkout only when you have looked at what it will discard.

## The Playwright runner deletes the admin key before it runs

`scripts/e2e-playwright.sh` opens with `rm -rf .playwright`, which is where `e2e:local up` and
`provision` wrote the self-hosted admin key. Calling the runner directly, after provisioning, throws
the key away and the seed step then fails with `BadAdminKey`.

Drive the phases through `bun run e2e:local <phase>`, which re-establishes the key via
`ensure_admin_key`. Call `e2e-playwright.sh` directly only if you have pinned the key in the
environment yourself.

## A generated admin key contains a pipe, so it needs quoting

`generate_admin_key.sh` emits `convex-self-hosted|<hex>`, and it prints a label line above it. An env
file is sourced by bash, so an unquoted value makes the shell try to run the hex as a command:

```
line 11: 018d10393f68…: command not found
```

Take the key line rather than the whole output, and quote it:

```bash
CONVEX_SELF_HOSTED_ADMIN_KEY="convex-self-hosted|018d…"
```

## `ensure_admin_key` accepts any non-empty key without checking it

The helper short-circuits when `CONVEX_SELF_HOSTED_ADMIN_KEY` is set to anything other than
`replace-me`. It does not ask the backend whether the key belongs to it.

**What it looks like when it bites:** a key copied from another instance, or left over from a
previous container, sails through provisioning and fails later as `BadAdminKey`, far from its cause.
If you see that error and your key is set, suspect the key's provenance rather than the flow.

## Manual compose ports can break generated URLs

`app:dev --local` assigns each worktree its own Compose project and host ports. Convex uses the
origin values in storage URLs, action callbacks, and other addresses that browsers and local tools
must reach. They must name the mapped host ports, not the ports inside the container.

The Compose defaults work only when the host uses the same ports as the container:

```yaml
- CONVEX_CLOUD_ORIGIN=${CONVEX_CLOUD_ORIGIN:-http://127.0.0.1:3210}
- CONVEX_SITE_ORIGIN=${CONVEX_SITE_ORIGIN:-http://127.0.0.1:3211}
```

Inside the container the backend still listens on 3210 and 3211. The backend receives those ports
through separate command-line flags. When you remap the host ports, change both origins to the
addresses that callers outside Docker can reach:

```bash
COMPOSE_PROJECT_NAME=my-second-stack
COMPOSE_PROFILES=worktree-local
CONVEX_BACKEND_PORT=3310
CONVEX_SITE_PORT=3311
CONVEX_CLOUD_ORIGIN=http://127.0.0.1:3310
CONVEX_SITE_ORIGIN=http://127.0.0.1:3311
```

The `worktree-local` profile starts a loopback proxy in the backend network namespace. OIDC
discovery can then reach the mapped site origin on port 3311 and forward it to the internal listener
on port 3211. The mapped site port cannot be 3210 because the proxy shares that namespace with the
backend listener. A separate `COMPOSE_PROJECT_NAME` keeps the second stack's network and volume
independent. The application launcher sets both values automatically.

## `convex codegen` deploys

Running codegen pushes to whatever deployment `.env.local` names. It is not a local-only operation,
and in a worktree it can reach shared dev.

This has two consequences that have both been paid for:

- **Repairing generated bindings by re-running codegen is not safe.** When drifted
  `convex/_generated/server.d.ts` and `server.js` rode into `main` from a branch that had run codegen
  under a different Convex version, the repair took the files **from history** rather than from a
  fresh codegen, precisely because running it would have deployed ([#807](https://github.com/ndelangen/dunezone/pull/807)).
- **In a worktree with no `.env.local`, codegen cannot run at all.** New `convex/_generated/api.d.ts`
  entries have been extended by hand in the file's own deterministic pattern instead
  ([#815](https://github.com/ndelangen/dunezone/pull/815)).

## A Convex `returns` validator rejects what the generated types approve

Widening a query's projection is not proven by a green `typecheck`. `convex/_generated/api.d.ts`
imports its module types from source, so the compiler sees a widened return shape the moment the
source changes and is satisfied. Nothing in the type system knows a `returns` validator exists, and
the validator lives in a different file from the projection.

**What it looks like when it bites:** every gate green, and the page does not render:

```
Error: Return value validation failed for query "profiles:getBySlug":
Validator error: Unexpected field `image_cover` in object
```

After widening any projection, load the surface. And before widening a validator, count its
consumers: on [#868](https://github.com/ndelangen/dunezone/pull/868) the obvious shared validator had
three, one of which had no cover to send, so the two shapes that needed the field got their own
validator instead.

## A `MERGED` badge is not delivery

A pull request whose base is another branch merges **into that branch**. If the base lands on `main`
first and the stacked PR is never retargeted, GitHub shows `MERGED` while the work sits in a branch
nobody will merge again.

**What it looks like when it bites:** the badge, the closed ticket, and nothing on `main`. It
happened on [#878](https://github.com/ndelangen/dunezone/pull/878), which merged into
`norbert/870-chip-api` and had to be recovered as [#880](https://github.com/ndelangen/dunezone/pull/880).

Retarget a stacked PR the moment its base lands, and verify delivery by ancestry rather than by the
badge:

```bash
git merge-base --is-ancestor <commit> real-origin/main && echo delivered
```

## A green gate is true of the tree it ran on

A suggestion accepted through GitHub's review UI is committed verbatim. None of the local tooling
runs on it, so wording a reviewer proposed can land in a shape `oxlint` refuses, most often the
block-comment plugin's one-clause-per-line rule.

Those commits land on the branch without touching your checkout. A gate you ran and reported green
is then a fact about your working tree and not about what CI will see.

**What it looks like when it bites:** you report `lint 0`, CI reports the same file red, and the
disagreement invites a theory about the two commands differing. They do not. `lint` and `lint:ci` are
`oxlint . --deny-warnings` with and without `--format=github`, identical in strictness, and plain
`bun run lint` reproduces the CI failure once you are on the tree CI saw. On
[#887](https://github.com/ndelangen/dunezone/pull/887) the local branch was two commits behind, both
of them applied suggestions, and one had wrapped a sentence mid-clause.

Before reporting any gate result for a branch, fetch and confirm you are not behind:

```bash
git fetch real-origin <branch> && git status -sb   # "behind" means your gate ran on something else
```

Fix a refused comment shape with `oxlint --fix` rather than by hand, because the plugin owns the
shape and reverts a hand-reflow.

The suggestions themselves are not the trap and were correct on substance in that case, including two
places where they caught a documentation claim that generalised past what the code does. The trap is
only that the mechanism which applies them runs no checks.

## A verification that cannot reach Convex still exits clean

`publisher:release:verify` in a worktree with no Convex URL in `.env.local` reaches the application
prerender, stops, and **produces no generated diff**. A run that verified nothing does not look
different from a run that verified everything ([#808](https://github.com/ndelangen/dunezone/pull/808)).

When a check's whole output is "no changes", confirm it actually produced the artifact it compares
against before reading the silence as a pass.

## A disabled control can hide its interactive part from the accessibility tree

Being disabled removes nothing on its own. Native `disabled` keeps an element in the accessibility
tree, and testing-library's `byRole` does not filter disabled elements out. What removes it is a
component library choosing to *hide* part of a disabled control, because `display: none` is excluded
from the tree.

Mantine's slider is the case in hand, and the two halves are worth reading together. The thumb keeps
everything a query needs:

```js
// @mantine/core Slider/Thumb/Thumb.mjs
role: "slider",
"aria-label": thumbLabel,
"aria-disabled": disabled,
```

and the stylesheet then hides it outright:

```css
/* @mantine/core styles/Slider.css, .m_c9a9a60a is the thumb */
.m_c9a9a60a:where([data-disabled]) { display: none; }
```

So the role and the label are there in the source and the element is not in the tree.

**What it looks like when it bites:** the assertion you wrote is about the value, so the failure
reads as a missing element and sends the debugging at the query, or at the name you queried by. The
control is on the page, visible in a screenshot, and unreachable by role.

Read a control only in the state where it is enabled, or query it another way and assert the DOM
property directly:

```ts
expect((view.getByLabelText('Name') as HTMLInputElement).disabled).toBe(true);
```

## A `div` with `role="slider"` does not answer `userEvent.type`

Mantine's slider thumb is a `div` carrying `role="slider"`, so there is nothing to type into. Arrow
keys sent with `userEvent.type` never land, and the value does not move.

**What it looks like when it bites:** the story reads the value afterwards and reports the wrong
number, so the failure looks like the component ignoring the interaction, or like arithmetic. It is
neither: the interaction did not happen.

Focus the thumb and send the key:

```ts
(await thumb()).focus();
await userEvent.keyboard('{ArrowLeft>3/}');
```

Then read where it landed rather than predicting it. The ends clamp, and the step is the widget's
business.

## Any command that discards working-tree state takes uncommitted work with it

The class, not one command:

| | what it does to uncommitted work |
| --- | --- |
| `git checkout <branch>` | carries it onto the branch you land on, where it gets committed |
| `git checkout HEAD -- <path>` | destroys it, including edits made after the state you meant to restore |
| `git reset --hard` | destroys it |
| `git clean -f`, `-fd` | destroys untracked files (bare `git clean` refuses, `clean.requireForce` defaults true) |

The first spends it and the rest lose it, and both are the same root cause: the working tree held
something no commit did.

**What it looks like when it bites:** in the carrying case, nothing at all. Typecheck, lint and the
whole suite pass, because the stowaway changes are independently valid. No gate distinguishes
"correct" from "belongs here"; only reading the whole diff does. In the destroying case you get
silence too, since a restore that removed more than you asked looks exactly like a restore.

**The disguise is what makes it expensive.** The rule against bare `git stash` (the stack is shared
with every worktree on this machine) makes stashing feel like the reckless option and switching feel
like the careful one. They are the same hazard, and avoiding stash without adopting commit-before
leaves the hole open while feeling disciplined.

One rule covers the table: **commit before any of them.** A WIP commit is cheap, and it is the same
move already required before a destructive command.

```bash
git status --short          # anything printed goes into a WIP commit first
git add -A && git commit -m 'WIP'   # -A, because untracked files are inside this class too
git log main..HEAD          # after cutting a branch: only your own ticket's commits
```

**After any restore, check the thing you changed is still there.** A restoring command aimed at one
edit will take every uncommitted edit in that file, including ones made for a different reason
minutes earlier:

```bash
grep -c 'the phrase you just wrote' path/to/file    # 0 means the restore took it
```

This entry was written naming `checkout <branch>` alone. The very next mistake of the same class was
a `checkout HEAD -- <path>` that discarded an unrelated fix in the same file, which is why it now
names the class instead.

## The shape these share

Most of the entries above have the same shape: **the fast signal is the wrong one**. A port answers,
a typecheck passes, a badge says merged, a verifier exits zero. In each case the thing that would
have caught it is one step slower and one level more concrete: the listener's working directory, the
page load, the ancestry check, the artifact on disk.

When a check is cheap and its answer is good news, that is the moment to ask what it actually
measured.
