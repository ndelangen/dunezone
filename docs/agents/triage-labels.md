# Triage labels

| Role | GitHub label | Exists on the repo |
| --- | --- | --- |
| Needs triage | `needs-triage` | no, create before first use |
| Needs information | `needs-info` | no, create before first use |
| Ready for an agent | `ready-for-agent` | yes |
| Ready for a human | `ready-for-human` | no, create before first use |
| Will not be actioned | `wontfix` | yes |

Three of these have never been created on `ndelangen/dunezone`, so `gh issue edit --add-label` fails
on them. Create the one you need first, then apply it:

```bash
gh label create needs-triage --description "Awaiting triage" --color FBCA04
```

The `wayfinder:*` labels (`map`, `research`, `prototype`, `grilling`, `task`) all exist; see
[`issue-tracker.md`](./issue-tracker.md).
