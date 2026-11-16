import {defineConfig} from '@playwright/test';
import path from 'node:path';
export default defineConfig({
  testDir: './e2e', testMatch: '**/*.pw.js', fullyParallel: false, workers: 1, timeout: 30000,
  reporter: [['list'],['html',{open:'never'}]],
  outputDir: 'test-results',
  use: {browserName:'chromium', channel:process.env.PLAYWRIGHT_CHANNEL || undefined, baseURL:'http://127.0.0.1:4321', viewport:{width:1448,height:1086}, reducedMotion:'reduce', serviceWorkers:'block', trace:'retain-on-failure', screenshot:'only-on-failure', launchOptions:{chromiumSandbox:true,env:Object.fromEntries(['PATH','SystemRoot','WINDIR','TEMP','TMP','LOCALAPPDATA'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]))}},
  webServer: [
    {command:'node tools/site/serve.js',url:'http://127.0.0.1:4324',reuseExistingServer:false,env:{PORT:'4324',SITE_BASE:'/',SITE_SERVE_DIR:path.resolve('.site/external-preview')}},
    {command:'node tools/site/serve.js',url:'http://127.0.0.1:4323',reuseExistingServer:false,env:{PORT:'4323',SITE_BASE:'/',SITE_SERVE_DIR:path.resolve('.site/unfeatured-preview')}},
    {command:'node tools/site/serve.js',url:'http://127.0.0.1:4321',reuseExistingServer:false,env:{PORT:'4321',SITE_BASE:'/',SITE_SERVE_DIR:path.resolve('.site/preview')}},
    {command:'node tools/site/serve.js',url:'http://127.0.0.1:4322',reuseExistingServer:false,env:{PORT:'4322',SITE_BASE:'/',SITE_SERVE_DIR:path.resolve(process.env.SITE_EMPTY_SERVE_DIR || '.site/empty-preview')}}
  ]
});
