# Praying Mantis 0.2.1 — standalone candidate companion
Creator: Chadwick Sutton.

Three audit-only services: synthetic antivirus fixture matching, synthetic firewall
policy, and VPN configuration planning. ENFORCE=False. Not active antivirus, a host
firewall, or a VPN client. No PC protection status is inferred from these tests.
The original OG Onyx summary engine remains separate from this companion.

## Prerequisites and explicit launch

Python 3.10+ is required; no third-party Python packages are needed. Packaging or
loading this skill does not install, activate, or launch software or a server.
From the parent bundle folder (one directory above web/), the existing Python
entry points are:

    python cli.py antivirus
    python cli.py firewall --direction in --port 443
    python cli.py vpn-plan --endpoint vpn.example.invalid:51820 --dns 9.9.9.9
    python mantis_os.py
    python -B -m unittest discover -s tests -v

Use python3 or Windows py -3 if that is the available Python 3.10+ interpreter.
The combined mantis_os.py demonstration also exercises the six-axis lattice and
a denied apply attempt. The axes are Launch, Assets, Saves, Boundary, Security,
and Portable; crossing 0.65 blocks the synthetic risk gate. Lower risk scores do
not authorize a release, and no real security state is measured.

For a requested standalone web session on Windows, run START_WINDOWS.bat.
On other supported Python installations, run from the parent bundle folder:

    python -m http.server 8767 --bind 127.0.0.1 --directory web

Open http://127.0.0.1:8767/ in Firefox. Keep the terminal open; Ctrl+C stops it.
Only the web directory is served, bound to loopback. No installation/admin rights,
OS rule changes, real tunnel, or quarantine actions are performed by this lab.

## Service limits

Antivirus: synthetic memory fixture hash matching only. No-match does not mean safe.
Firewall: validates synthetic TCP/UDP flows; inbound defaults to deny. Python
uses ordered, first-match stateless rules; the web demo additionally models a
supplied connection state. Neither reproduces effective Windows policy.
VPN: validates endpoint/DNS syntax and records a plan; never connects or resolves
DNS. Separate supported device/client, credentials, routes and DNS tests would be
required for real VPN use; do not enter credentials into this lab.

Unknown rule keys and malformed rule values are rejected before classification.
Use only id, action, proto, direction and dst_port. Optional match fields may be
omitted intentionally for wildcard rules; first-match behavior is preserved.
This correction changes synthetic planning only and does not apply host rules.

## Browser saves and advisory format

Browser inputs save in localStorage with a previous-snapshot backup. The bundled
static server has no disk mirror or save/recovery API. In this co-packaged copy,
optional legacy /api/save calls are disabled; storage failures are still reported.
Browser storage can be unavailable or cleared; local saving is not a disk backup.

Import/export aethera-insight/v1 observations manually through the standalone page.
This is a manual legacy advisory format. The OG run.cjs does not support it.
Only fixed source/topic/result enums and a bounded check count are accepted.
Reports are unverified, user-reported advice; no model training, automatic
execution, enforcement, credentials, or raw logs. Legacy source enum labels do
not establish a connection to another app. Result events share the browser origin;
separate storage keys are not a security boundary.

This package has no ChatGPT remote-control hook, MCP server, API key, or app-store
listing. Sharing an exported report is manual. No game runtime is included.

## Verification and release status

The retained suite contains 24 Python fixture/regression test methods, including
9 policy-validation regressions. Portable web-function and independent synthetic
policy checks are supplied in the parent plugin's tests/ folder. These checks do
not establish live protection. Windows/Firefox, real security-engine, routing,
and tunnel tests have not run for this co-packaged candidate.

The Python core, CLI, web planner, and legacy advisory validator retain the source
candidate bytes. The local-save helper is adapted only to disable unavailable
disk API calls. Documentation and UI copy clarify standalone limits; MANIFEST.json
records the resulting bundled file sizes and SHA-256 checksums.

This companion is included in Core 1 - OG Onyx release 0.3.0 under the MIT
License. See LICENSE in this folder; it retains the same license and copyright
notice as the parent release. The source's 0.2.1-candidate identity is preserved
separately from the release-package version. Browser/platform acceptance remains
unverified. Live protection would require a separate implementation and validation.
Existing downloaded copies do not auto-update.

References:
https://learn.microsoft.com/en-us/windows/security/operating-system-security/network-security/windows-firewall/
https://www.wireguard.com/quickstart/
