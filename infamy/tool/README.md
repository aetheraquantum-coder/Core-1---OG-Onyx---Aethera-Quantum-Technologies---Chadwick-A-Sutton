# Infamy build tooling

Run from the repository root:

```sh
python3 -m unittest discover -s infamy/tool/tests -v
python3 infamy/tool/check_build_inputs.py
```

The checker exits 1 and reports all missing, empty or unreadable required inputs,
plus an OG Onyx digest mismatch. It exits 0 when those prerequisites exist. This
does not compile Dart, execute the packager, verify signing or certify a release.
`--root /path/to/checkout` checks another snapshot without editing it.

The workflow runs this gate independently of core tests; both jobs must pass
before Windows and Android builds start. A JSON report is printed to the job log
and retained as the `Infamy-build-inputs` artifact, including on a blocked check.
Core tests can still run while the interface or packager is under development.

`prepare.py` updates Android XML structurally, so repeated preparation sets the
same backup, network policy and app-label values and keeps one INTERNET permission.
Other permissions and activity definitions remain in place. Invalid existing XML
still fails visibly; this is not a repair tool for already-corrupt generated files.

## Verification boundary

At base commit `dfe58bd45cb3d538eec92dd553ffbb32b87de734`, both native jobs in
Actions run `38506211972` failed because the application entry point was absent.
The packaging script referenced by that workflow was also absent. This change
detects those prerequisites early and fixes repeat preparation. It does not add
the missing interface, packager, installer or APK.
