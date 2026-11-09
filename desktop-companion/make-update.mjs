import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { CORE_FILES, verifyBundle } from './update-manager.cjs';
const root = path.dirname(fileURLToPath(import.meta.url));
if (!process.argv[2]) throw Error('Pass the private signing key path; never put the key in the repository');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
const payload = { format: 'jane-desktop-update-v1', version: pkg.version, minimumShell: '0.1.2', files: CORE_FILES.map(name => {
  const bytes = fs.readFileSync(path.join(root, '.stage', name));
  return { name, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), data: bytes.toString('base64') };
}) };
const signature = crypto.sign(null, Buffer.from(JSON.stringify(payload)), fs.readFileSync(process.argv[2])).toString('base64');
const bundle = { payload, signature };
verifyBundle(bundle, fs.readFileSync(path.join(root, 'update-public-key.pem')), '0.1.2');
const output = path.join(root, '../desktop-companion-update.json'); fs.writeFileSync(output, JSON.stringify(bundle));
console.log(JSON.stringify({ version: pkg.version, files: CORE_FILES.length, bytes: fs.statSync(output).size, signed: true }));
