'use strict';

// Builds the hosted, single-file version of the portal (online/dist/job-portal.html).
// The scoring, skill extraction and letter templates are the same lib/ modules
// the local server uses, wrapped in a tiny CommonJS shim so the page needs no
// bundler.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MODULES = ['skills', 'text', 'scoring', 'generate', 'plan'];

const bundle = [
  'const __mods = {};',
  'const __cache = {};',
  'function require(p) {',
  "  const name = p.replace('./', '');",
  '  if (!__cache[name]) { const module = { exports: {} }; __cache[name] = module; __mods[name](module, module.exports); }',
  '  return __cache[name].exports;',
  '}',
  ...MODULES.map((m) => {
    const src = fs.readFileSync(path.join(ROOT, 'lib', `${m}.js`), 'utf8');
    if (/<\/script/i.test(src)) throw new Error(`lib/${m}.js contains </script`);
    return `__mods[${JSON.stringify(m)}] = function (module, exports) {\n${src}\n};`;
  }),
].join('\n');

const template = fs.readFileSync(path.join(__dirname, 'page.html'), 'utf8');
if (!template.includes('/*__LIB__*/')) throw new Error('page.html is missing the /*__LIB__*/ placeholder');
const out = template.replace('/*__LIB__*/', () => bundle);

// dist/ is the claude.ai artifact; web/ is the Vercel site, which needs a
// full document around the same page.
const site = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<style>body{margin:0}</style>\n</head>\n<body>\n${out}\n</body>\n</html>\n`;
for (const [dir, file, html] of [['dist', 'job-portal.html', out], [path.join('..', 'web'), 'index.html', site]]) {
  const target = path.join(__dirname, dir, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, html);
  console.log(`Wrote ${path.relative(process.cwd(), target)} (${(html.length / 1024).toFixed(1)} KB)`);
}
