// Runs the API and the web app in one container (Render free plan): one
// service, one wake-up, and the API is reachable only from the web app.
import { spawn } from 'node:child_process';
import process from 'node:process';
import { setTimeout } from 'node:timers';

const apiPort = process.env.API_PORT ?? '3001';
const children = [
  spawn('node_modules/.bin/tsx', ['apps/api/src/server.ts'], {
    stdio: 'inherit', env: { ...process.env, HOST: '127.0.0.1', PORT: apiPort }
  }),
  spawn('node', ['node_modules/next/dist/bin/next', 'start', 'apps/web', '-H', '0.0.0.0', '-p', process.env.PORT ?? '10000'], {
    stdio: 'inherit', env: { ...process.env, API_INTERNAL_URL: `http://127.0.0.1:${apiPort}` }
  })
];
let stopping = false;
const stop = code => {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 5000).unref();
};
// If either process dies, stop both so the host restarts a clean pair.
for (const child of children) child.on('exit', code => stop(code ?? 1));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => stop(0));
