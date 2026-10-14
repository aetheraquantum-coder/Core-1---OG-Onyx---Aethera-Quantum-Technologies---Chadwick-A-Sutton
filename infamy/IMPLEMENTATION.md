# Infamy owner-build implementation plan

Spec: Infamy Build Specification v0.1, supplied in the owner conversation. Owner subsequently delegated remaining decisions and requested build and shipment, adding Nyx then Ominous for emotional context. Implementation is on the isolated infamy/owner-build-20261014 branch; existing product source and main remain unchanged.

## Delivery scope
One Flutter codebase, Windows x64 and Android ARM64, version 0.1.0 owner-test candidate. Casper owns project context, deterministic tools, provider requests and result provenance. Nyx applies the user's chosen communication style; Ominous presents the resulting state without claiming psychological diagnosis. Session chat is not saved automatically. No private prior conversations, credentials, signing keys or personal research corpus in this public branch.

## Tasks
- [ ] 1. Red/green tests for URL validation, source scoping, emotional directives and portable project integrity.
- [ ] 2. Transactional SQLite projects, immutable revisions, explicit knowledge/source/result saves and stale-write protection.
- [ ] 3. Bound, nonredirecting provider transport; optional configured Claude or compatible provider; official read-only X lookup; actual pinned OG Onyx execution.
- [ ] 4. Native adaptive interface, shared selected project, crimson/blue/white identity, source/result workflow, Nyx and Ominous controls.
- [ ] 5. Windows and Android build jobs, native smoke checks where available, owner-test packages, source and exact limitations.

## Rulings
The owner explicitly delegated remaining implementation decisions; proceed inline without another design approval loop. Cost if misunderstood: source remains isolated and reviewable, not merged.
Use the maintained flutter_js QuickJS bridge rather than a bespoke QuickJS-NG FFI bridge for this candidate; preserve and hash-check the original OG Onyx script. Cost: dependency and platform checks remain necessary.
Use a bounded, hash-checked .infamy.json envelope for text-only project exchange instead of ZIP in this first candidate; no binary media import or ZIP extraction. Cost: binary project bundles remain later work.
Build a developer-signed Android owner-test candidate and unsigned Windows candidate; do not claim store/production signing or physical-device acceptance. Preserve existing installed apps and data.
No automatic sync, media generation, model weights, paid API execution, autonomous background research or jailbreak is claimed. Configured connections require explicit send consent.

## Review focus
Reject forged X hosts, credential-bearing URLs and insecure remote providers. Keep sources scoped to their project. Reject stale revisions and damaged bundles. Cancel late network completions. Never label missing models, reference-only roles, or user-supplied text as verified execution.
