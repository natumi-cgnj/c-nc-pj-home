import { packager } from '@electron/packager';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root = path.dirname(fileURLToPath(import.meta.url));
const platform = process.argv[2] || 'win32';
const art = path.resolve(process.argv[3] || path.join(root, '../../Jane_Desktop_States_25'));
const stage = path.join(root, '.stage');
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(await fs.readFile(path.join(art, 'manifest.json'), 'utf8'));
if (manifest.images.length !== 25) throw new Error('Expected the approved 25-image artwork pack');
const approved = JSON.parse(await fs.readFile(path.join(root, 'artwork-manifest.json'), 'utf8'));
assert.deepEqual(manifest, approved, 'Artwork must match the approved version');
for (const image of manifest.images) {
  assert.match(image.file, /^png\/[0-9]{2}_[a-z0-9_]+\.png$/);
  const bytes = await fs.readFile(path.join(art, image.file));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), image.sha256, image.id + ' checksum');
}
await fs.rm(stage, { recursive: true, force: true });
await fs.mkdir(stage, { recursive: true });
for (const name of ['bootstrap.cjs', 'update-manager.cjs', 'update-public-key.pem', 'main.cjs', 'preload.cjs', 'policy.cjs', 'program-launcher.cjs', 'offline.html', 'offline.js']) await fs.copyFile(path.join(root, name), path.join(stage, name));
await fs.copyFile(path.join(root, '../jane-companion.css'), path.join(stage, 'offline.css'));
await fs.copyFile(path.join(root, '../apple-touch-icon.png'), path.join(stage, 'icon.png'));
await fs.mkdir(path.join(stage, 'assets'), { recursive: true });
await fs.copyFile(path.join(art, 'manifest.json'), path.join(stage, 'assets/manifest.json'));
await fs.cp(path.join(art, 'png'), path.join(stage, 'assets/png'), { recursive: true });
await fs.writeFile(path.join(stage, 'package.json'), JSON.stringify({ name: pkg.name, productName: pkg.productName, version: pkg.version, description: pkg.description, author: pkg.author, main: pkg.main }));
const built = await packager({ dir: stage, out: path.join(root, 'out'), platform, arch: 'x64', name: pkg.productName,
  executableName: pkg.productName, appVersion: pkg.version, electronVersion: pkg.devDependencies.electron,
  icon: platform === 'win32' ? path.join(root, '../favicon.ico') : undefined,
  asar: true, overwrite: true, prune: true });
for (const directory of built) await fs.copyFile(path.join(root, '使用说明.txt'), path.join(directory, '使用说明.txt'));
console.log(JSON.stringify({ platform, directories: built }));
