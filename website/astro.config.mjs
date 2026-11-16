import {defineConfig} from 'astro/config';
export default defineConfig({site: 'https://loghub.pages.dev', output: 'static', base: process.env.SITE_BASE || '/', trailingSlash: 'always', publicDir: process.env.SITE_PUBLIC || '../.site/input/public', outDir: process.env.SITE_OUT || '../.site/output', build: {format: 'directory'}, vite: {build: {assetsInlineLimit: 0}}, devToolbar: {enabled: false}});
