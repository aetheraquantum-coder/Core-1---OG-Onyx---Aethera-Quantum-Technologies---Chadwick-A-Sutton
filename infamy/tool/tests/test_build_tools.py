"""Regression tests for source readiness and repeatable Android preparation."""
from pathlib import Path
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET

REPO = Path(__file__).resolve().parents[3]
ANDROID = '{http://schemas.android.com/apk/res/android}'
ENGINE = 'skills/review-onyx-reports/scripts/onyx-core.js'


class BuildToolsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.write('infamy/lib/main.dart', 'void main() {}\n')
        self.write('infamy/tool/package.py', 'print("fixture")\n')
        self.write('infamy/pubspec.yaml', 'name: infamy\n')
        self.write(ENGINE, (REPO / ENGINE).read_text())
        self.write('LICENSE', (REPO / 'LICENSE').read_text())

    def write(self, path, content):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding='utf-8')

    def check(self):
        result = subprocess.run(
            [sys.executable, str(REPO / 'infamy/tool/check_build_inputs.py'),
             '--root', str(self.root)], capture_output=True, text=True)
        self.assertTrue(result.stdout.strip().startswith('{'), result.stderr)
        return result, json.loads(result.stdout)

    def test_complete_source_passes_without_claiming_a_binary(self):
        result, report = self.check()
        self.assertEqual(result.returncode, 0, report)
        self.assertEqual(report['status'], 'ready')
        self.assertEqual(report['scope'], 'source_prerequisites_only')
        self.assertFalse(report['native_build_verified'])

    def test_missing_entrypoint_is_reported(self):
        (self.root / 'infamy/lib/main.dart').unlink()
        result, report = self.check()
        self.assertEqual(result.returncode, 1)
        self.assertIn('infamy/lib/main.dart', report['failures'][0])

    def test_missing_packager_is_reported(self):
        (self.root / 'infamy/tool/package.py').unlink()
        result, report = self.check()
        self.assertEqual(result.returncode, 1)
        self.assertIn('infamy/tool/package.py', report['failures'][0])

    def test_all_missing_inputs_are_reported_together(self):
        (self.root / 'infamy/lib/main.dart').unlink()
        (self.root / 'infamy/tool/package.py').unlink()
        result, report = self.check()
        self.assertEqual(result.returncode, 1)
        self.assertEqual(len(report['failures']), 2)

    def test_empty_entrypoint_is_rejected(self):
        self.write('infamy/lib/main.dart', ' \n')
        result, report = self.check()
        self.assertEqual(result.returncode, 1)
        self.assertIn('empty', report['failures'][0])

    def test_modified_original_engine_is_rejected(self):
        self.write(ENGINE, 'changed engine')
        result, report = self.check()
        self.assertEqual(result.returncode, 1)
        self.assertIn('SHA-256', report['failures'][0])

    def test_preparation_can_run_twice_without_corrupting_manifest(self):
        tool = self.root / 'infamy/tool/prepare.py'
        shutil.copy2(REPO / 'infamy/tool/prepare.py', tool)
        self.write('infamy-workspace/android/app/src/main/AndroidManifest.xml',
                   '<manifest xmlns:android="http://schemas.android.com/apk/res/android">'
                   '<uses-permission android:name="android.permission.INTERNET"/>'
                   '<uses-permission android:name="android.permission.CAMERA"/>'
                   '<application android:label="infamy" android:allowBackup="true">'
                   '<activity android:name=".MainActivity"/></application></manifest>')
        self.write('infamy-workspace/android/app/build.gradle.kts',
                   'minSdk = flutter.minSdkVersion\n')
        (self.root / 'infamy-workspace/android/app/src/main/res').mkdir()
        for _ in range(2):
            result = subprocess.run([sys.executable, str(tool)],
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
        path = self.root / 'infamy-workspace/android/app/src/main/AndroidManifest.xml'
        try:
            manifest = ET.parse(path).getroot()
        except ET.ParseError as exc:
            self.fail(f'Repeated preparation must keep valid XML: {exc}')
        app = manifest.find('application')
        self.assertEqual(app.get(ANDROID + 'allowBackup'), 'false')
        self.assertEqual(app.get(ANDROID + 'label'), 'Infamy')
        self.assertEqual(app.get(ANDROID + 'networkSecurityConfig'), '@xml/network_security_config')
        permissions = [x.get(ANDROID + 'name') for x in manifest.findall('uses-permission')]
        self.assertEqual(permissions.count('android.permission.INTERNET'), 1)
        self.assertIn('android.permission.CAMERA', permissions)
        self.assertEqual(app.find('activity').get(ANDROID + 'name'), '.MainActivity')
        self.assertEqual((self.root / 'infamy-workspace/android/app/build.gradle.kts').read_text(), 'minSdk = 26\n')


if __name__ == '__main__':
    unittest.main()
