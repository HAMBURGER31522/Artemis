import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  'server.mjs',
  'scripts/check-syntax.mjs',
  'scripts/smoke-server.mjs',
];

function collectJavaScript(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectJavaScript(full);
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(path.relative(root, full));
  }
}

collectJavaScript(path.join(root, 'public', 'js'));

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }
}

console.log(`Syntax check passed for ${files.length} files.`);
