#!/usr/bin/env python3
"""Build the self-contained Java Android client using Android SDK tools.

No Gradle/plugins, native libraries, runtime permissions beyond the manifest,
or credentials from the main app are added to the package.
"""
from pathlib import Path
import argparse, hashlib, json, os, re, shutil, subprocess, zipfile

root = Path(__file__).resolve().parent
repo = root.parent
parser = argparse.ArgumentParser()
parser.add_argument('--tools', type=Path, required=True, help='Android build-tools 36.0.0 directory')
parser.add_argument('--platform', type=Path, required=True, help='Android 36 android.jar')
parser.add_argument('--compiler', type=Path, required=True, help='Eclipse ECJ 3.40.0 jar')
parser.add_argument('--artwork', type=Path, required=True, help='Approved Jane_Desktop_States_25 directory')
parser.add_argument('--supabase', type=Path, required=True, help='Pinned Supabase JS 2.58.0 UMD file')
parser.add_argument('--signing-store', type=Path, required=True)
parser.add_argument('--password-env', default='JANE_ANDROID_KEY_PASSWORD')
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()

def run(*command):
    subprocess.run([str(x) for x in command], check=True, cwd=root)

approved = json.loads((repo / 'desktop-companion/artwork-manifest.json').read_text())
assert json.loads((args.artwork / 'manifest.json').read_text()) == approved
for image in approved['images']:
    assert re.fullmatch(r'png/[0-9]{2}_[a-z0-9_]+\.png', image['file'])
    assert hashlib.sha256((args.artwork / image['file']).read_bytes()).hexdigest() == image['sha256'], image['id']
assert args.supabase.stat().st_size > 100000
assert hashlib.sha256(args.supabase.read_bytes()).hexdigest() == '3ae8cfec4a4715f4e67aa45fe4e7c1a40d67787629c7f10e32afd7dd836edf4e', 'Unexpected Supabase 2.58.0 UMD bytes'
assert os.environ.get(args.password_env), 'Signing password must be supplied via environment'

build = root / 'build'
if build.exists(): shutil.rmtree(build)
site = build / 'assets/site'; site.mkdir(parents=True)
shutil.copytree(args.artwork / 'png', build / 'assets/art/png')
for file in (root / 'web').iterdir():
    if file.is_file(): shutil.copy2(file, site / file.name)
shutil.copy2(args.supabase, site / 'supabase.js')
shutil.copy2(repo / 'character-runtime.js', site / 'character-runtime.js')
(site / 'manifest.json').write_text(json.dumps(approved, ensure_ascii=False), encoding='utf-8')

copied = set()
def module(name):
    if name in copied: return
    assert re.fullmatch(r'[a-zA-Z0-9_-]+\.mjs', name), name
    copied.add(name); text = (repo / name).read_text()
    (site / name).write_text(text)
    for dependency in re.findall(r'(?:from\s*|import\s*)[\'"]\./([^\'"?]+\.mjs)(?:\?[^\'"]*)?[\'"]', text): module(dependency)
module('jane-companion-mobile.mjs')

shutil.copytree(root / 'res', build / 'res')
classes = build / 'classes'; classes.mkdir()
generated = build / 'generated'; generated.mkdir()
run(args.tools / 'aapt2', 'compile', '--dir', build / 'res', '-o', build / 'resources.zip')
run(args.tools / 'aapt2', 'link', '-I', args.platform, '--manifest', root / 'AndroidManifest.xml', '--java', generated,
    '-o', build / 'base.apk', build / 'resources.zip')
sources = sorted((root / 'src').rglob('*.java')) + sorted(generated.rglob('*.java'))
boot = str(args.platform) + os.pathsep + str(args.tools / 'core-lambda-stubs.jar')
run('java', '-jar', args.compiler, '-source', '1.8', '-target', '1.8', '-bootclasspath', boot,
    '-nowarn', '-encoding', 'UTF-8', '-d', classes, *sources)
dex = build / 'dex'; dex.mkdir()
run('java', '-cp', args.tools / 'lib/d8.jar', 'com.android.tools.r8.D8', '--min-api', '26', '--lib', args.platform,
    '--output', dex, *sorted(classes.rglob('*.class')))
with zipfile.ZipFile(build / 'base.apk', 'a', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    archive.write(dex / 'classes.dex', 'classes.dex')
    for file in sorted((build / 'assets').rglob('*')):
        if file.is_file(): archive.write(file, 'assets/' + str(file.relative_to(build / 'assets')))
run(args.tools / 'zipalign', '-p', '-f', '4', build / 'base.apk', build / 'aligned.apk')
args.output.parent.mkdir(parents=True, exist_ok=True)
run('java', '-jar', args.tools / 'lib/apksigner.jar', 'sign', '--ks', args.signing_store, '--ks-key-alias', 'jane-companion',
    '--ks-pass', 'env:' + args.password_env, '--key-pass', 'env:' + args.password_env, '--v4-signing-enabled', 'false',
    '--out', args.output, build / 'aligned.apk')
run('java', '-jar', args.tools / 'lib/apksigner.jar', 'verify', '--verbose', '--print-certs', args.output)
run(args.tools / 'zipalign', '-c', '-p', '4', args.output)
with zipfile.ZipFile(args.output) as archive:
    assert archive.testzip() is None
    assert len([n for n in archive.namelist() if n.startswith('assets/art/png/')]) == 25
    assert 'classes.dex' in archive.namelist()
    assert not any('.p12' in n or 'password' in n or '.pem' in n for n in archive.namelist())
print(json.dumps({'apk': str(args.output), 'bytes': args.output.stat().st_size, 'sha256': hashlib.sha256(args.output.read_bytes()).hexdigest(),
    'shared_modules': sorted(copied)}, ensure_ascii=False))
