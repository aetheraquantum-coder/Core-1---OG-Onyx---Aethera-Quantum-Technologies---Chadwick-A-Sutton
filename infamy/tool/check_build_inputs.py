"""Check required source inputs; this never certifies a native binary or release."""
import argparse
import hashlib
import json
from pathlib import Path

ENGINE_PATH = 'skills/review-onyx-reports/scripts/onyx-core.js'
ENGINE_SHA256 = '9289fa38751445dce26858585d276ee3c4c61ef809caef1ee85262ac115e24c7'
REQUIRED = (
    'infamy/lib/main.dart',
    'infamy/tool/package.py',
    'infamy/pubspec.yaml',
    ENGINE_PATH,
    'LICENSE',
)


def inspect_inputs(root):
    checks, failures = [], []
    for relative in REQUIRED:
        path = root / relative
        check = {'path': relative, 'status': 'failed'}
        try:
            data = path.read_bytes()
        except OSError as exc:
            check['reason'] = f'missing or unreadable ({type(exc).__name__})'
        else:
            check['sha256'] = hashlib.sha256(data).hexdigest()
            if not data.strip():
                check['reason'] = 'empty source input'
            elif relative == ENGINE_PATH and check['sha256'] != ENGINE_SHA256:
                check['reason'] = 'original OG Onyx SHA-256 mismatch'
            else:
                check['status'] = 'passed'
        if check['status'] == 'failed':
            failures.append(f"{relative}: {check['reason']}")
        checks.append(check)
    return {
        'schema_version': 1,
        'scope': 'source_prerequisites_only',
        'status': 'blocked' if failures else 'ready',
        'native_build_verified': False,
        'checks': checks,
        'failures': failures,
        'limitations': [
            'File presence does not prove valid Dart or Python implementation.',
            'Compilation, packaging, signing and device acceptance are separate checks.',
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    args = parser.parse_args()
    report = inspect_inputs(args.root)
    print(json.dumps(report, indent=2))
    return 1 if report['failures'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
