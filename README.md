# Core 1 - OG Onyx

By Chadwick A. Sutton · Aethera Quantum Technologies

Core 1 is OG Onyx, recovered and packaged to be used. We’re releasing the original engine, its working adapter, Praying Mantis as a companion, and a visual way to explore the results so people can inspect it, build with it, and help shape what comes next.

Release 0.3.0 includes the MIT-licensed Onyx engine, local adapter, visual reports and Praying Mantis companion. ChatGPT plugin installation and activation are separate steps and have not occurred.

## Explore the release

- [Start here](preview/index.html): after extracting the complete ZIP, open this local navigation page to choose the Onyx showcase or Mantis planner.
- [Visual showcase](preview/Core-1-OG-Onyx-Showcase.html): download and open the self-contained HTML in your browser. All five views use clearly labeled synthetic data.
- [Technical whitepaper (PDF)](docs/Core-1-White-Paper.pdf): architecture, cybersecurity boundaries, AI integration and reproducible checks.
- [Editable whitepaper](docs/Core-1-White-Paper.docx) · [Repository text](docs/Core-1-White-Paper.md)

## What it does

The original engine remains byte-for-byte unchanged. The adapter exposes all three original functions:

- **Summarize:** calculate the original metrics from a supported JSON report.
- **Compare:** summarize two reports of the same schema and calculate after-minus-before differences.
- **Suggest:** return the engine's original rule-based next-test advice.

The visualizer presents those actual results as a self-contained offline HTML report: metric cards, separate before/after charts, exact numeric values, the original advice and an execution receipt. A bundled synthetic showcase covers all five supported report schemas.

This release contains the unchanged Core 1 engine, its adapter/presentation files, and the separately named Praying Mantis companion below. There is no hosted backend, model training, computer scan or automatic publisher.

## Run it

For Onyx, use an already-installed Node.js runtime. Local verification uses Node.js v24.19.0. The optional Mantis Python CLI requires Python 3.10+; verification uses Python 3.12.14. Both components use only runtime standard libraries, without third-party dependencies or API keys. Run these commands from the repository root:

```sh
node --test
node skills/review-onyx-reports/scripts/run.cjs --version
node skills/review-onyx-reports/scripts/visualize.cjs showcase --output onyx-showcase.html
```

Open the generated HTML in a modern browser. It is self-contained, designed for offline use, and uses synthetic data, clearly labeled. Choose a new output filename each time; existing files are not overwritten.

For your own selected report files:

```sh
node skills/review-onyx-reports/scripts/run.cjs summarize report.json
node skills/review-onyx-reports/scripts/run.cjs compare before.json after.json
node skills/review-onyx-reports/scripts/run.cjs suggest report.json
node skills/review-onyx-reports/scripts/visualize.cjs summarize report.json --output summary.html
node skills/review-onyx-reports/scripts/visualize.cjs compare before.json after.json --output comparison.html
```

Quote paths appropriately for your operating system. The JSON runner writes results to stdout and sanitized errors to stderr. The visualizer writes only the explicitly requested HTML output; source reports remain unchanged. No report data is sent to a chart service. Your surrounding host environment still has its own file handling and retention behavior.

## Praying Mantis companion

The complete recovered Praying Mantis 0.2.1 planning lab is included under `skills/review-mantis-plans/resources/praying-mantis/`. It was recovered from the same archive at `releases/praying-mantis/`, with a previously tested correction that rejects malformed firewall rules. It is a separate component in this release, not a new export or hidden capability of the original 3,089-byte Onyx engine.

- **Fixture matching:** Python matches a fixed inert in-memory marker by exact SHA-256. It is not an antivirus engine; a no-match result is not a clean verdict. The browser has no connected matcher.
- **Firewall planning:** Python evaluates ordered, stateless first-match rules. The browser demo additionally accepts supplied connection state. Results are synthetic and host firewall status remains unknown.
- **VPN planning:** validate endpoint/DNS syntax and return a plan. No connection, tunnel, routing test, DNS-leak test or kill switch is implemented.
- **Risk review:** propagate six supplied normalized scores through a fixed heuristic matrix. The 0.65 review threshold is not a calibrated probability or a release authorization.

Run these from the repository root using an already-installed Python interpreter (`python3` on this test environment; commonly `py -3` on Windows):

```sh
python3 skills/review-mantis-plans/resources/praying-mantis/cli.py antivirus
python3 skills/review-mantis-plans/resources/praying-mantis/cli.py firewall --direction in --port 443
python3 skills/review-mantis-plans/resources/praying-mantis/cli.py vpn-plan --endpoint vpn.example.invalid:51820 --dns 9.9.9.9
python3 tests/mantis-policy-checks.py
```

Run the retained Python unit suite from the companion directory, so its local imports resolve:

```sh
cd skills/review-mantis-plans/resources/praying-mantis
python3 -B -m unittest discover -s tests -v
```

Return to the repository root before using the other root-relative commands.

For the standalone web planner, open its `web/index.html` from the complete extracted package. File-origin storage behavior varies by browser. Alternatively, run the included `START_WINDOWS.bat` from the Mantis directory on Windows, or explicitly start its loopback-only static server:

```sh
python3 -m http.server 8767 --bind 127.0.0.1 --directory skills/review-mantis-plans/resources/praying-mantis/web
```

Then open `http://127.0.0.1:8767` and stop the server with Ctrl+C when finished. This serves only bundled web assets and needs no administrator privileges. It provides no disk-save API. The release's small autosave packaging fix retains browser-local snapshot/backup/export behavior and removes calls to that unavailable API. The Python and web planner engines remain byte-identical to the inspected 0.2.1 source.

Mantis browser notes and saves are plain local data. Do not enter credentials or private logs. Its fixed seven-field `aethera-insight/v1` exchange is manual, user-reported advice. That format is shared with a separate historical Onyx UI, which is not included here; the original OG runner does not accept it. No automated connection or conversion between Mantis and OG is claimed. Per-app storage keys are conventions, not browser-origin isolation.

The companion guide records exact source hashes, packaging changes and limitations. Its supplied tests use benign in-memory fixtures and synthetic flows. No live malware, host security changes, quarantine or restoration is involved.

## Supported report formats

| Schema | Original metrics |
| --- | --- |
| `aethera-health-export/v1` | Page count, active issues, stale pages |
| `aethera-game-design-handoff/v1` | Helpful ratings, fun ratings, learning contexts |
| `aethera-game-learning/v1` | Helpful ratings, fun ratings, learning contexts |
| `aethera-iterations/v1` | Completed sets, blocked sets, maximum reported risk |
| `aethera-save-export/v1` | Save records |

Health means website-page diagnostics. Maximum reported risk is a normalized 0–1 score, not a probability. The two learning formats share metrics, giving 10 distinct metric names overall. The engine reads iteration results; it does not run iterations.

Every summary retains `user-supplied; not independently verified`. Differences describe the reports, not independently established real-world improvement. Charts keep count metrics and risk scores on separate scales, with exact values available in the report table. Website-health staleness uses the current observation time and a threshold strictly greater than 120,000 milliseconds.

## Using it with an LLM or another tool

Any authorized host that can execute the required Node.js code and access the selected JSON files can invoke the Onyx commands and parse their results. A second skill describes the existing Mantis Python CLI for hosts with Python 3.10+. The packaged skills describe these workflows for compatible ChatGPT/Work or Codex environments. Other assistants can use the same command-line interface through their own supported execution tools.

Compatibility depends on that host's runtime, file access and permissions. If the required Node or Python runtime is unavailable, report that the requested component has not run. Do not substitute model-calculated numbers and label them as engine output. Installed ChatGPT execution remains a separate verification gate; local tests do not establish universal LLM compatibility.

## Input and output boundaries

The adapter enforces 2 MiB per input file and, in the parsed JSON tree, depth 32 (root at zero), 50,000 value nodes, 10,000 entries per object/array, and 65,536 UTF-16 code units per string/key. It rejects nonregular files, final path-component symlinks, malformed UTF-8/JSON, nonfinite parsed numbers and unsafe keys. Descriptor metadata is checked for read stability. Reports are parsed as data and never evaluated as code.

Standard JSON.parse behavior is retained: duplicate keys use the last value. Overwritten duplicate values are not independently checked against parsed-tree limits; the file-byte limit still applies. Numbers use JavaScript IEEE-754 precision. The original engine validates selected schema fields. The adapter always creates summaries from original reports before comparison/advice and checks the original source digest before loading it.

The visual report contains derived metrics, fixed labels/advice and execution metadata, not original free-form report content. It is a local output file, not a production server or a guarantee of complete filesystem isolation. Keep private reports and private generated results out of distributed source packages.

## Preserved original

The engine was recovered from `Aethera-Quantum-JavaScript-Build.zip`, at `releases/onyx-ai/web/onyx-core.js`. Its website copy and nested standalone Onyx ZIP contain the same bytes.

- Original source: 3,089 bytes.
- Source SHA-256: `9289fa38751445dce26858585d276ee3c4c61ef809caef1ee85262ac115e24c7`
- Original archive SHA-256: `67cfebb416584bddf74c4ddff77c320decf3fb111c435fac429ce947cf094c1b`

These hashes establish byte identity, not authorship or security. The engine has no embedded semantic version; the package and adapter versions are separate. The source-specific Git LF rule preserves its digest on Windows checkouts. Earlier source-only and private-plugin ZIPs remain separate historical deliverables.

The creator reports that the original system was encrypted before testing, with the intent of preserving functionality and security. The recovered source does not independently verify the encryption process or its effectiveness. This package contains readable JavaScript and is not an encrypted artifact.

## Review and activation

Local Node source and integration tests cover the generated data and HTML. Automated browser appearance, mobile layout and keyboard-interaction checks could not be completed in the preparation environment because browser execution/access was blocked. Inspect the views in your target environment; individual visual inspection is not a substitute for automated cross-browser coverage.

GitHub publication is separate from plugin activation. When the owner is at their computer and authorizes private plugin activation:

1. Create the private plugin from the validated complete ZIP; check the returned name, version, audience and plugin URL.
2. Open that plugin page and use the install/enable controls actually shown.
3. In a fresh supported session, run the bundled reports through the installed Onyx skill. Check actual Node execution, the pinned core digest, numerical results and generated report. Run the Mantis skill’s inert Python example separately and verify its enforcement-off result.
4. Test malformed files, mismatched schemas and unavailable-runtime handling without invented results.
5. Inspect the installed view before treating that environment as accepted.

Storing source in GitHub does not install a plugin. Private creation does not publish to the universal directory. There is no MCP server or required app OAuth connection in this package. Public ChatGPT directory submission, account eligibility and review remain separate from the GitHub release.

## License

MIT covers this release’s original Onyx engine, adapter, presentation and included Praying Mantis companion. See [LICENSE](LICENSE); a matching copy travels with the standalone companion. Copyright © 2026 Chadwick A. Sutton (Aethera Quantum Technologies).
