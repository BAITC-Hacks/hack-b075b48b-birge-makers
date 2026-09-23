import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./e2e', fullyParallel:false, workers:1, timeout:30000,
  reporter:[['list'],['json',{outputFile:'reports/ui-results.json'}]],
  use:{baseURL:'http://127.0.0.1:3107',channel:process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),headless:true,viewport:{width:1440,height:1000},screenshot:'only-on-failure'},
  webServer:{command:'node --env-file-if-exists=.env scripts/ui-test-server.js',url:'http://127.0.0.1:3107/health',reuseExistingServer:false,timeout:30000},
});
