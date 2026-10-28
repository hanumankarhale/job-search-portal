'use strict';

// Shared helpers for the Vercel functions in api/.

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 1024 * 1024) throw Object.assign(new Error('Request body too large'), { status: 413 });
    chunks.push(c);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

// With PORTAL_KEY set, only callers that send it may use the functions, so a
// public deployment can't be used by strangers to run searches.
function authorized(req) {
  const key = process.env.PORTAL_KEY;
  return !key || req.headers['x-portal-key'] === key;
}

function handler(methods) {
  return async (req, res) => {
    try {
      const fn = methods[req.method];
      if (!fn) return send(res, 405, { error: 'Method not allowed' });
      if (req.method !== 'GET' && !authorized(req)) return send(res, 401, { error: 'This portal needs an access key.' });
      send(res, 200, await fn(req));
    } catch (err) {
      if (!err.status) console.error(err);
      send(res, err.status || 500, { error: err.message || 'Internal error' });
    }
  };
}

module.exports = { handler, readJson, send };
