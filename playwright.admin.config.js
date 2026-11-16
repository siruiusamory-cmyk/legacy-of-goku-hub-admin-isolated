import {defineConfig} from '@playwright/test';
export default defineConfig({testDir: './e2e-admin', testMatch: '**/*.pw.js', fullyParallel: false, workers: 1, retries: 0, use: {browserName: 'chromium', channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', screenshot: 'only-on-failure'}, reporter: [['list']], outputDir: 'test-results/admin', timeout: 45000});
