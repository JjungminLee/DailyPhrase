import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { rootDir } from '../src/config.mjs';

const apiPort = process.env.PORT || '3000';
const uiPort = process.env.VITE_PORT || '5173';
const env = {
  ...process.env,
  PORT: apiPort,
  DAILY_PHRASE_LOCAL: '1',
  NODE_USE_SYSTEM_CA: '1',
};
let shuttingDown = false;
const children = [];

function stop(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) if (!child.killed) child.kill();
  setTimeout(() => process.exit(code), 150).unref();
}

const api = spawn(
  process.execPath,
  ['--env-file-if-exists=.env', '--use-system-ca', 'src/local.mjs'],
  { cwd: rootDir, env, stdio: 'inherit' },
);
children.push(api);
api.on('error', (error) => {
  console.error('Could not start local API:', error.message);
  stop(1);
});
api.on('exit', (code) => {
  if (!shuttingDown) stop(code || 1);
});
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

let ready = false;
for (let attempt = 0; attempt < 60; attempt += 1) {
  if (shuttingDown) process.exit(1);
  try {
    const response = await fetch(`http://127.0.0.1:${apiPort}/api/health`);
    if (response.ok) {
      ready = true;
      break;
    }
  } catch {
    // The local API may not have started listening yet.
  }
  await delay(250);
}
if (!ready) {
  console.error('Local API did not become ready.');
  stop(1);
}

const vite = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    '--configLoader',
    'native',
    '--host',
    '127.0.0.1',
    '--port',
    uiPort,
    '--strictPort',
  ],
  { cwd: rootDir, env, stdio: 'inherit' },
);
children.push(vite);
vite.on('error', (error) => {
  console.error('Could not start Vite:', error.message);
  stop(1);
});
vite.on('exit', (code) => {
  if (!shuttingDown) stop(code || 1);
});
console.log(`Daily Phrase UI:  http://localhost:${uiPort}`);
console.log(`Daily Phrase API: http://localhost:${apiPort}/api/health`);
