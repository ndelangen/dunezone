# Observed run records

Use `<run>.json` for actual normal authenticated operations and their evidence. These operator records are separate from authored content and generated preparation. The file-only tool neither validates them nor marks an operation passed. Its checkpoint, preparation, collection and review validation remains separate.

Each record contains:

| Field | Value |
| --- | --- |
| `version` | `1` |
| `run` | A lowercase letter-or-digit key, with single hyphens between segments, at most 160 characters. |
| `authoringCommit` | The exact 40-character lowercase hexadecimal Git commit. |
| `authoringHash` | The 64-character lowercase SHA-256 of the authored content. |
| `environmentFingerprint` | The 64-character lowercase SHA-256 identifying the observed environment. |
| `preparationReport` | The nonempty path to the preparation report. |
| `preparationHash` | The 64-character lowercase SHA-256 of that report. |
| `operations` | An array of the observed operations described below. |

Each operation contains:

| Field | Value |
| --- | --- |
| `entityKey` | The authored entity's lowercase letter-or-digit key, with single hyphens between segments, at most 160 characters. |
| `action` | `load`, `save`, `assign-group`, `rename`, `convert`, `publish` or `verify`. |
| `observedAt` | The ISO UTC date and time of the observation. |
| `targetId` | The actual nonempty application record ID. |
| `desiredHash` | The 64-character lowercase SHA-256 of the intended writable value. |
| `beforeHash`, `afterHash` | Optional 64-character lowercase SHA-256 hashes of the observed values. |
| `revision`, `edition` | Optional positive integers for the actual saved revision and published Edition. |
| `artifact` | Optional object with a nonempty `identity`, a 64-character lowercase SHA-256 `sha256`, and the actual artifact `url`. |
| `evidence` | A nonempty array of nonempty paths or links to retained evidence. |
| `result` | `passed` or `blocked`. Failed or pending work remains `blocked`. |
| `detail` | A nonempty description of the observed result or blocker. |

Do not add fields beyond this contract or record an operation that has not been observed. Keep credentials out. This directory supplies no completed events or review claims.
