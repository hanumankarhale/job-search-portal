'use strict';

// Builds the hosted, single-file version of the portal (online/dist/job-portal.html).
// The scoring, skill extraction and letter templates are the same lib/ modules
// the local server uses, wrapped in a tiny CommonJS shim so the page needs no
// bundler.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MODULES = ['skills', 'text', 'scoring', 'generate'];

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

fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
const target = path.join(__dirname, 'dist', 'job-portal.html');
fs.writeFileSync(target, out);
console.log(`Wrote ${path.relative(process.cwd(), target)} (${(out.length / 1024).toFixed(1)} KB)`);
