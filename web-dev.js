'use strict';

// Runs the Vercel version locally: serves web/ and routes /api/<name> to
// api/<name>.js, the way Vercel does. `node online/build.js` first.
//   node web-dev.js            then open http://localhost:3000

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const WEB = path.join(__dirname, 'web');

http
  .createServer((req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    const api = pathname.match(/^\/api\/([a-z]+)$/);
    if (api && fs.existsSync(path.join(__dirname, 'api', `${api[1]}.js`))) {
      return require(`./api/${api[1]}.js`)(req, res);
    }
    const file = path.resolve(WEB, pathname === '/' ? 'index.html' : `.${pathname}`);
    if (!file.startsWith(WEB + path.sep)) return res.writeHead(403).end();
    fs.readFile(file, (err, data) => {
      if (err) return res.writeHead(404).end('Not found');
      res.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
      res.end(data);
    });
  })
  .listen(PORT, '127.0.0.1', () => console.log(`Web version at http://localhost:${PORT}`));
