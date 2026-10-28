'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('stream');

const search = require('../api/search');

function call(fn, method, body, headers = {}) {
  const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
  Object.assign(req, { method, headers });
  return new Promise((resolve) => {
    const res = {
      headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      end(payload) { resolve({ status: this.statusCode, body: JSON.parse(payload) }); },
    };
    fn(req, res);
  });
}

test('api/search describes itself and searches for a profile', async () => {
  const prev = { ...process.env };
  process.env.JOB_SOURCES = 'demo';
  delete process.env.PORTAL_KEY;
  try {
    const info = await call(search, 'GET');
    assert.equal(info.status, 200);
    assert.deepEqual(info.body.sources, ['Demo data']);

    const empty = await call(search, 'POST', { profile: {} });
    assert.equal(empty.status, 400);

    const r = await call(search, 'POST', { profile: { languages: ['PHP'], targetRoles: ['PHP Developer'], locations: ['Pune'], postedWithinDays: 30 } });
    assert.equal(r.status, 200);
    assert.ok(r.body.jobs.length > 0);
    assert.equal(r.body.jobs[0].title, 'Senior PHP Developer (Laravel / CodeIgniter)');
    assert.ok(r.body.jobs[0].fit.score >= r.body.jobs.at(-1).fit.score);

    process.env.PORTAL_KEY = 'k';
    assert.equal((await call(search, 'POST', { profile: { skills: ['PHP'] } })).status, 401);
    assert.equal((await call(search, 'POST', { profile: { skills: ['PHP'] } }, { 'x-portal-key': 'k' })).status, 200);
  } finally {
    process.env = prev;
  }
});
