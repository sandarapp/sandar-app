import { defineConfig,devices } from '@playwright/test';
import { randomBytes } from 'node:crypto';
export default defineConfig({
  testDir:'./tests/e2e',fullyParallel:false,workers:1,timeout:45000,
  use:{baseURL:'http://localhost:3100',trace:'off',screenshot:'off',...devices['Desktop Chrome']},
  // Traces are disabled: auth requests and email fragments contain credentials.
  webServer:[
    {command:'node --import tsx scripts/e2e-api.ts',url:'http://127.0.0.1:3101/health',reuseExistingServer:false,timeout:30000,env:{NODE_ENV:'test',DATA_ENCRYPTION_KEY:randomBytes(32).toString('hex'),DEV_EMAIL_DIRECTORY:'.local/e2e-mail',E2E_DATABASE_URL:process.env.E2E_DATABASE_URL??''}},
    {command:'node node_modules/next/dist/bin/next start apps/web --hostname 127.0.0.1 --port 3100',url:'http://localhost:3100/login',reuseExistingServer:false,timeout:30000,env:{NODE_ENV:'production',APP_BASE_URL:'http://localhost:3100',API_INTERNAL_URL:'http://127.0.0.1:3101',NEXT_TELEMETRY_DISABLED:'1'}}
  ]
});
