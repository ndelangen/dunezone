# Security policy

## Report a vulnerability

Report suspected vulnerabilities through
[GitHub's private reporting form](https://github.com/ndelangen/dunezone/security/advisories/new).
If you cannot use GitHub, email [support@dune.zone](mailto:support@dune.zone) with the subject
"Dune Zone security report".

Keep vulnerability details out of public issues, pull requests, discussions and game chat.
For ordinary bugs and feature requests, use the
[issue tracker](https://github.com/ndelangen/dunezone/issues).

Include what you know:

- The affected URL, feature or source file, and the commit if you tested a local checkout.
- What someone could access, change or disrupt, and which permissions they would need.
- Steps to reproduce, or a small proof of concept using your own test data.
- Relevant logs or screenshots with credentials and other people's data removed.

Incomplete reports are welcome. You do not need to exploit a problem to report it.
Never send passwords, session tokens or private keys.

## Scope and supported versions

This policy covers [dune.zone](https://dune.zone), its Dune Play service, and the code in this
repository, including authentication, data access, multiplayer games, publishing and build tooling.
Examples include reading private drafts or game information without permission, changing another
person's content, and gaining access to an account or deployment credentials.

Security fixes target the current production deployment and the latest `main` branch. Older
commits, release tags and forks do not receive backported fixes. If you find a problem in an older
version, report it even if you cannot check whether it affects the current version.

Problems in how Dune Zone uses a dependency or hosting provider belong here. Problems in the
provider's own service or an upstream project should also go through that project's security
reporting process. This policy does not authorize testing systems operated by other parties.

## Testing safely

Use the [disposable local environment](./docs/README.md#disposable-local-app-development) with
`bun run app:dev --local` where possible. Plain `bun run app:dev` connects to a shared online
backend, even when the frontend runs locally.

On the live service, use only accounts, content and games you control. Keep requests to the minimum
needed to demonstrate the problem.

- Do not access, change, download or delete other people's data.
- If you encounter someone else's private data, stop testing and report where it appeared. Do not
  copy the data into your report.
- Do not disrupt the service, run load tests or high-volume scans, send spam, or use phishing or
  other social engineering.
- Do not use exposed credentials or keep access after testing. Report what you found without
  trying the credentials.

If a test would cross these limits, contact us privately first.

## What to expect

We aim to acknowledge reports within seven calendar days. This is a best-effort target, not a
guaranteed response or fix deadline. If you have not heard back after seven days, follow up in the
private report or email us at the address above.

We will discuss the impact and next steps in private. Please give us time to investigate and
coordinate a disclosure date before publishing details. Include any disclosure deadline you already
follow in your report. We will not ask you to keep a report private indefinitely.

We welcome reports made in good faith and will ask before naming you in a public advisory.
This project does not offer paid bounties.
