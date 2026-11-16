import {defineConfig} from '@playwright/test';
import base from './playwright.config.js';
export default defineConfig({...base,testDir:'./e2e-real',outputDir:'test-results-real',reporter:[['list']],use:{...base.use,baseURL:'http://127.0.0.1:4325'},webServer:{command:'node tools/site/serve.js',url:'http://127.0.0.1:4325',reuseExistingServer:false,env:{PORT:'4325',SITE_BASE:'/',SITE_SERVE_DIR:'.site/real-preview'}}});
