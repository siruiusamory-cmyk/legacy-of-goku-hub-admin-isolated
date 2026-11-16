import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(process.env.SITE_SERVE_DIR || '.site/preview');
const base = process.env.SITE_BASE || '/';
const types = {'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.webp':'image/webp','.woff2':'font/woff2','.json':'application/json'};
const server = http.createServer(async (request,response) => {
  try {
    const url = new URL(request.url,'http://127.0.0.1');
    let name = decodeURIComponent(url.pathname);
    if (!name.startsWith(base) || name.includes('\\') || name.includes('\0') || name.split('/').includes('..')) throw Error('unsafe path');
    name = name.slice(base.length); if (!path.extname(name)) name = path.join(name,'index.html');
    const file = path.resolve(root,name);
    if (!file.startsWith(root + path.sep)) throw Error('outside site');
    const bytes = await fs.readFile(file);
    response.writeHead(200,{'Content-Type':types[path.extname(file)] || 'application/octet-stream','X-Content-Type-Options':'nosniff'}); response.end(bytes);
  } catch {response.writeHead(404,{'Content-Type':'text/plain'});response.end('Page not found');}
});
server.listen(Number(process.env.PORT || 4321),'127.0.0.1',()=>console.log('Local static preview: http://127.0.0.1:'+(process.env.PORT||4321)+base));
