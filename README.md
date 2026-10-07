# Core 1 - OG Onyx

Private skills-only plugin package, version 0.1.0. Prepared for later upload and
testing. It has not been created, installed, activated, or published in ChatGPT.
Activation is on hold until the owner is at their computer to inspect it.

## Included scope

The original OnyxCore JavaScript engine is preserved byte-for-byte, including
`summarize`, `compare`, and `suggest`. One skill and a bounded local Node.js runner
make those existing functions usable with explicitly selected JSON files. The
package also contains synthetic examples, repeatable tests and a simple icon.

No other Onyx Foundation modules, model weights, private reports, account
connections, hosted service, network requests, telemetry or automatic updater are
included. The earlier “Onyx Core App Refurbished” source ZIP remains a separate,
unchanged deliverable. The new label is “Core 1 - OG Onyx.”

## Runtime and commands

Use an already-installed Node.js runtime. Local verification uses Node.js
v24.19.0. No third-party package installation is needed. Other runtime versions
and installed ChatGPT execution have not yet been established by these local
checks. A ChatGPT session without access to Node cannot execute this package;
the skill must report that limitation instead of simulating the engine.

Run these commands from this repository's root, or from `core-1-og-onyx` after
extracting the standalone plugin ZIP:

```sh
node --test
node skills/review-onyx-reports/scripts/run.cjs --help
node skills/review-onyx-reports/scripts/run.cjs --version
node skills/review-onyx-reports/scripts/run.cjs compare skills/review-onyx-reports/examples/before.json skills/review-onyx-reports/examples/after.json
```

For your own explicitly chosen report files:

```sh
node skills/review-onyx-reports/scripts/run.cjs summarize /path/to/report.json
node skills/review-onyx-reports/scripts/run.cjs compare /path/to/before.json /path/to/after.json
node skills/review-onyx-reports/scripts/run.cjs suggest /path/to/report.json
```

Use appropriately quoted local paths on your operating system. The runner reads
only the selected files and its bundled trusted source. It outputs JSON to the
process's standard output; it does not save or upload reports. The surrounding
ChatGPT/host environment still has its own file handling and retention behavior.
Do not distribute packages containing your private report files.

## Supported reports and interpretation

- `aethera-health-export/v1`: page count, active issue count, stale page count.
- `aethera-game-design-handoff/v1`: helpful/fun rating totals and context count.
- `aethera-game-learning/v1`: helpful/fun rating totals and context count.
- `aethera-iterations/v1`: completed sets, blocked sets, maximum reported risk.
- `aethera-save-export/v1`: count of supplied save records.

Health means website-page diagnostics, not medical information. Comparison uses
two original reports of the same schema, summarized by the engine first. Advice
is the engine's original fixed next-test wording. Every summary retains
`user-supplied; not independently verified`. Report metrics do not authenticate
the reports or prove a real-world improvement. This engine reads iteration
reports; it does not run iterations.

Website-health staleness depends on the current observation time and is strictly
greater than 120,000 milliseconds. Other report metrics are derived from the
supplied values. The original engine installs `globalThis.OnyxCore` and has no
CommonJS/ES-module export or embedded semantic version. The plugin/runner version
is separate from that preserved source identity.

## Input boundary

The wrapper adds resource limits without rewriting the original engine. Limits
are 2 MiB per input file and, in the parsed JSON tree, nesting depth 32 with the
root at depth zero, 50,000 value nodes, 10,000 entries in any object or array, and
65,536 UTF-16 code units per string or key. It rejects nonregular inputs and final
path-component symlinks, malformed UTF-8/JSON, nonfinite parsed numbers and unsafe
keys with sanitized errors. Read stability is checked using descriptor metadata.
The engine is hash-checked before loading. Reports are parsed as JSON and never
evaluated as executable code.

Standard JSON.parse behavior is retained: duplicate keys are not rejected, and
the last value wins. Overwritten duplicate values are not independently checked
against parsed-tree limits; the original file-byte limit still applies. Numbers
use ordinary JavaScript IEEE-754 precision. The wrapper is a local report runner, not a production
server or a proof of complete filesystem isolation. The original engine validates
selected schema fields rather than every possible field. Its comparison and
advice functions trust summaries, so the runner always creates those summaries
from validated original input reports. Bounds must not be bypassed to make a
failing report pass.

## Preserved source and historical statement

The original engine was recovered from `Aethera-Quantum-JavaScript-Build.zip`,
at `releases/onyx-ai/web/onyx-core.js`. Its website copy and nested standalone
Onyx ZIP contain the same bytes.

- Original source: 3,089 bytes.
- Original source SHA-256:
  `9289fa38751445dce26858585d276ee3c4c61ef809caef1ee85262ac115e24c7`
- Original archive SHA-256:
  `67cfebb416584bddf74c4ddff77c320decf3fb111c435fac429ce947cf094c1b`

The creator reports that the original system was encrypted before testing, with
the intent of preserving functionality and security.

The recovered source does not independently verify the encryption process or
its effectiveness. This package contains readable JavaScript and is not an
encrypted artifact. Digests establish byte identity, not authorship or security.

## Later activation and verification

1. When the owner is at their computer and authorizes activation, upload this
   complete ZIP through the private plugin creation flow. Confirm the returned
   name, version, audience and plugin URL. Creation is a live account change and
   has not been performed as part of preparation.
2. Open the returned plugin page from that account. Install or enable it if the
   account's interface requires a separate step. Check that the displayed name
   is exactly “Core 1 - OG Onyx.” Follow the controls actually shown.
3. In a fresh supported ChatGPT/Work session, invoke the plugin with the bundled
   synthetic reports. Verify that Node executes the actual bundled runner,
   the core digest matches, and the results match local verification.
4. Try a malformed file, mismatched schemas, missing runtime, and a report asking
   for unrelated execution. Confirm safe failures without invented results.
5. Let the owner inspect the installed view and behavior. Local checks do not
   replace this installed-runtime acceptance step.

There is no MCP server, so no app OAuth connection is required by this package.
Keeping source in this private repository does not install or activate the plugin.
Private creation does not publish it to the universal directory. Public release,
repository visibility changes, publisher verification, licensing, listing/policy decisions,
country/commerce declarations and platform review remain separate future work.
No open-source license or other new license grant has been added.
