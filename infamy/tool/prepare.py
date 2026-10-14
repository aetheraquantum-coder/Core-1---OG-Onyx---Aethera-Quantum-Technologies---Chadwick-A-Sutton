"""Create platform runners from the pinned Flutter SDK; overlay inspected source."""
from pathlib import Path
import shutil,subprocess,hashlib,base64,os
import xml.etree.ElementTree as ET
root=Path(__file__).resolve().parents[2]
src=root/'infamy'; app=root/'infamy-workspace'
if not app.exists():
    subprocess.run(['flutter','create','--no-pub','--platforms=android,windows','--org','com.conspiracy4love','--project-name','infamy',str(app)],check=True,shell=os.name=='nt')
for name in ('lib','test','assets'):
    target=app/name
    if target.exists(): shutil.rmtree(target)
    if (src/name).exists(): shutil.copytree(src/name,target)
    else: target.mkdir(parents=True)
shutil.copy2(src/'pubspec.yaml',app/'pubspec.yaml')
(app/'analysis_options.yaml').write_text('include: package:flutter_lints/flutter.yaml\nanalyzer:\n  errors:\n    deprecated_member_use: ignore\n',encoding='utf-8')
engine=root/'skills/review-onyx-reports/scripts/onyx-core.js'
b=engine.read_bytes()
if hashlib.sha256(b).hexdigest()!='9289fa38751445dce26858585d276ee3c4c61ef809caef1ee85262ac115e24c7': raise RuntimeError('OG Onyx source hash mismatch')
(app/'assets/onyx-core.js').write_bytes(b)
shutil.copy2(root/'LICENSE',app/'assets/Onyx-LICENSE.txt')
logo=src/'assets/logo.webp.b64'
if logo.exists(): (app/'assets/logo.webp').write_bytes(base64.b64decode(logo.read_text(),validate=True))
manifest=app/'android/app/src/main/AndroidManifest.xml'
android_uri='http://schemas.android.com/apk/res/android'
android='{'+android_uri+'}'
ET.register_namespace('android',android_uri)
tree=ET.parse(manifest)
document=tree.getroot()
application=document.find('application')
if application is None: raise RuntimeError('Android manifest has no application element')
application.set(android+'allowBackup','false')
application.set(android+'networkSecurityConfig','@xml/network_security_config')
application.set(android+'label','Infamy')
internet=[p for p in document.findall('uses-permission') if p.get(android+'name')=='android.permission.INTERNET']
if not internet:
    document.insert(0,ET.Element('uses-permission',{android+'name':'android.permission.INTERNET'}))
for duplicate in internet[1:]: document.remove(duplicate)
tree.write(manifest,encoding='utf-8',xml_declaration=True)
xml=app/'android/app/src/main/res/xml'; xml.mkdir(exist_ok=True)
(xml/'network_security_config.xml').write_text('<?xml version="1.0" encoding="utf-8"?><network-security-config><base-config cleartextTrafficPermitted="false"/><domain-config cleartextTrafficPermitted="true"><domain>localhost</domain><domain>127.0.0.1</domain><domain>::1</domain></domain-config></network-security-config>')
gradle=app/'android/app/build.gradle.kts'
t=gradle.read_text().replace('minSdk = flutter.minSdkVersion','minSdk = 26'); gradle.write_text(t)
print('Prepared',app)
