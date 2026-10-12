import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { rootDir } from '../src/config.mjs';

const out = path.join(rootDir, 'dist');
await mkdir(out, { recursive: true });
const zip = path.join(out, 'lambda.zip');
const result = spawnSync('tar', ['-a', '-c', '-f', zip, '-C', rootDir, 'src', 'config'], {
  stdio: 'inherit',
});
if (result.status !== 0)
  throw new Error('Could not create Lambda zip (requires Windows tar with zip support).');
console.log(`Created ${zip}`);
