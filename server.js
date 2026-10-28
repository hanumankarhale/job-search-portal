'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { Store, DEFAULT_PROFILE } = require('./lib/store');
const { listSources, normalize } = require('./lib/sources');
const { searchForProfile } = require('./lib/autosearch');
const { scoreJob } = require('./lib/scoring');
const { buildApplication } = require('./lib/generate');

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT) || 4321;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_JOBS = 600;
const MAX_BODY = 1024 * 1024;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);
const AUTO_REFRESH_HOURS = Number(process.env.AUTO_REFRESH_HOURS ?? 6);

const store = new Store(process.env.DATA_DIR || path.join(__dirname, 'data'));

const STATUSES = ['prepared', 'applied', 'interview', 'offer', 'rejected', 'withdrawn'];

// ---------- helpers ----------

function send(res, status, body, type = 'application/json; charset=utf-8') {
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Request body too large'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('Invalid JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

const str = (v, max = 300) => String(v ?? '').trim().slice(0, max);
const list = (v, max = 80) =>
  (Array.isArray(v) ? v : String(v ?? '').split(/[,\n]/))
    .map((s) => (typeof s === 'string' ? s.trim() : s))
    .filter(Boolean)
    .slice(0, max);

function cleanProfile(input) {
  const p = { ...DEFAULT_PROFILE };
  for (const k of ['name', 'email', 'phone', 'location', 'headline', 'linkedin', 'github', 'portfolio']) p[k] = str(input[k]);
  p.summary = str(input.summary, 3000);
  p.experience = str(input.experience, 8000);
  p.education = str(input.education, 3000);
  p.yearsExperience = Math.max(0, Math.min(50, Number(input.yearsExperience) || 0));
  p.minScore = Math.max(0, Math.min(100, Number(input.minScore) || DEFAULT_PROFILE.minScore));
  p.workMode = ['any', 'remote', 'hybrid', 'onsite'].includes(input.workMode) ? input.workMode : 'any';
  p.postedWithinDays = Math.max(1, Math.min(60, Number(input.postedWithinDays) || DEFAULT_PROFILE.postedWithinDays));
  p.searchKeywords = str(input.searchKeywords, 200);
  p.languages = list(input.languages)
    .map((l) => (typeof l === 'string' ? { name: str(l, 60), level: 'proficient' } : { name: str(l.name, 60), level: str(l.level, 20) || 'proficient' }))
    .filter((l) => l.name);
  p.skills = list(input.skills).map((s) => str(s, 60));
  p.targetRoles = list(input.targetRoles, 20).map((s) => str(s, 80));
  p.locations = list(input.locations, 20).map((s) => str(s, 80));
  p.excludeKeywords = list(input.excludeKeywords, 30).map((s) => str(s, 60));
  p.highlights = list(Array.isArray(input.highlights) ? input.highlights : String(input.highlights ?? '').split('\n'), 20).map((s) => str(s, 400));
  return p;
}

const getProfile = () => ({ ...DEFAULT_PROFILE, ...store.read('profile', {}) });
const getJobs = () => store.read('jobs', []);
const getApps = () => store.read('applications', []);

function scored(jobs, profile, apps = getApps()) {
  const byJob = new Map(apps.map((a) => [a.jobId, a]));
  return jobs
    .map((job) => ({ ...job, fit: scoreJob(job, profile), application: byJob.has(job.id) ? { id: byJob.get(job.id).id, status: byJob.get(job.id).status } : null }))
    .sort((a, b) => b.fit.eligible - a.fit.eligible || b.fit.score - a.fit.score);
}

const hasProfile = (p) => !!(p.skills.length || p.languages.length || p.targetRoles.length);

// Search every source for the profile and merge new postings into the list.
let running = null;
async function runSearch(overrides = {}) {
  if (running) return running;
  running = (async () => {
    const profile = getProfile();
    const { plan, jobs, report } = await searchForProfile(profile, overrides);
    const existing = getJobs();
    const known = new Set(existing.map((j) => j.id));
    const fresh = jobs.filter((j) => !known.has(j.id));
    // Newest first, and never let the cache grow without bound.
    const appliedIds = new Set(getApps().map((a) => a.jobId));
    const merged = [...fresh, ...existing];
    const keep = merged.filter((j) => appliedIds.has(j.id)).concat(merged.filter((j) => !appliedIds.has(j.id))).slice(0, MAX_JOBS);
    store.write('jobs', keep);
    const meta = { lastSearchAt: new Date().toISOString(), plan, report, newCount: fresh.length, found: jobs.length };
    store.write('meta', meta);
    const ids = new Set(jobs.map((j) => j.id));
    return { ...meta, query: plan.queries.join(', '), results: scored(keep.filter((j) => ids.has(j.id)), profile) };
  })();
  try {
    return await running;
  } finally {
    running = null;
  }
}

async function prepare(job, profile) {
  const fit = scoreJob(job, profile);
  const pkg = await buildApplication(profile, job, fit);
  return {
    id: crypto.randomUUID(),
    jobId: job.id,
    job: { title: job.title, company: job.company, location: job.location, remote: job.remote, url: job.url, applyUrl: job.applyUrl, source: job.source, emails: job.emails },
    fit: { score: fit.score, verdict: fit.verdict, matchedSkills: fit.matchedSkills, missingSkills: fit.missingSkills },
    ...pkg,
    status: 'prepared',
    notes: '',
    createdAt: new Date().toISOString(),
    appliedAt: null,
    updatedAt: new Date().toISOString(),
  };
}

function csvCell(v) {
  const s = String(v ?? '');
  // Leading = + - @ would be run as a formula by spreadsheet apps.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

// ---------- routes ----------

const routes = {
  'GET /api/status': () => ({
    sources: listSources(),
    claude: !!process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_API_KEY ? process.env.CLAUDE_MODEL || 'claude-opus-5-5' : null,
    counts: { jobs: getJobs().length, applications: getApps().length },
    lastSearch: store.read('meta', null),
    autoRefreshHours: AUTO_REFRESH_HOURS,
  }),

  'GET /api/profile': () => getProfile(),

  'PUT /api/profile': async (req) => store.write('profile', cleanProfile(await readBody(req))),

  'GET /api/jobs': () => scored(getJobs(), getProfile()),

  'DELETE /api/jobs': () => {
    store.write('jobs', []);
    return { ok: true };
  },

  'POST /api/search': async (req) => {
    const body = await readBody(req);
    return runSearch({ query: str(body.query, 200), location: str(body.location, 120), sources: list(body.sources, 20) });
  },

  'POST /api/jobs/manual': async (req) => {
    const b = await readBody(req);
    if (!str(b.title) || !str(b.description, 20000)) throw Object.assign(new Error('Title and description are required'), { status: 400 });
    const job = normalize('manual', {
      sourceId: crypto.randomUUID(),
      title: str(b.title),
      company: str(b.company),
      location: str(b.location),
      remote: !!b.remote,
      url: str(b.url, 1000) || '',
      description: str(b.description, 20000),
    });
    store.write('jobs', [job, ...getJobs()].slice(0, MAX_JOBS));
    return scored([job], getProfile())[0];
  },

  'POST /api/applications': async (req) => {
    const { jobId } = await readBody(req);
    const apps = getApps();
    const existing = apps.find((a) => a.jobId === jobId);
    if (existing) return existing;
    const job = getJobs().find((j) => j.id === jobId);
    if (!job) throw Object.assign(new Error('Job not found'), { status: 404 });
    const app = await prepare(job, getProfile());
    store.write('applications', [app, ...getApps()]);
    return app;
  },

  // Prepare packages for every eligible, not-yet-handled job above the score
  // threshold. Submitting stays with the user: one click per job opens the
  // employer's page (or an email draft) with everything ready to paste.
  'POST /api/auto-apply': async (req) => {
    const b = await readBody(req);
    const profile = getProfile();
    const minScore = Number.isFinite(Number(b.minScore)) ? Number(b.minScore) : profile.minScore;
    const limit = Math.max(1, Math.min(25, Number(b.limit) || 10));
    const candidates = scored(getJobs(), profile)
      .filter((j) => !j.application && j.fit.eligible && j.fit.score >= minScore)
      .slice(0, limit);
    const created = [];
    for (const job of candidates) created.push(await prepare(job, profile));
    if (created.length) store.write('applications', [...created, ...getApps()]);
    return { minScore, created };
  },

  'GET /api/applications': () => getApps(),

  'GET /api/applications.csv': () => {
    const header = ['Company', 'Role', 'Location', 'Score', 'Verdict', 'Status', 'Prepared', 'Applied', 'URL', 'Notes'];
    const rows = getApps().map((a) => [a.job.company, a.job.title, a.job.location, a.fit.score, a.fit.verdict, a.status, a.createdAt, a.appliedAt || '', a.job.url, a.notes]);
    return { __csv: [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') };
  },
};

async function handleAppRoute(req, id) {
  const apps = getApps();
  const idx = apps.findIndex((a) => a.id === id);
  if (idx === -1) throw Object.assign(new Error('Application not found'), { status: 404 });
  if (req.method === 'DELETE') {
    apps.splice(idx, 1);
    store.write('applications', apps);
    return { ok: true };
  }
  if (req.method === 'PATCH') {
    const b = await readBody(req);
    const app = apps[idx];
    if (b.status !== undefined) {
      if (!STATUSES.includes(b.status)) throw Object.assign(new Error(`status must be one of ${STATUSES.join(', ')}`), { status: 400 });
      if (b.status === 'applied' && !app.appliedAt) app.appliedAt = new Date().toISOString();
      app.status = b.status;
    }
    if (b.notes !== undefined) app.notes = str(b.notes, 5000);
    if (b.coverLetter !== undefined) app.coverLetter = str(b.coverLetter, 10000);
    if (b.pitch !== undefined) app.pitch = str(b.pitch, 2000);
    app.updatedAt = new Date().toISOString();
    store.write('applications', apps);
    return app;
  }
  if (req.method === 'GET') return apps[idx];
  throw Object.assign(new Error('Method not allowed'), { status: 405 });
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const file = path.resolve(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, { error: 'Forbidden' });
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, { error: 'Not found' });
    send(res, 200, data, MIME[path.extname(file)] || 'application/octet-stream');
  });
}

function sameOrigin(origin, host) {
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  try {
    // Bound to loopback, the portal only answers to loopback host names, so a
    // malicious site cannot reach it through DNS rebinding.
    if (LOOPBACK.has(HOST) && !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(req.headers.host || '')) {
      return send(res, 403, { error: 'Unexpected Host header' });
    }
    if (!pathname.startsWith('/api/')) return serveStatic(req, res, pathname);
    // Same-origin only: blocks other websites from driving this local API.
    const origin = req.headers.origin;
    if (origin && !sameOrigin(origin, req.headers.host)) return send(res, 403, { error: 'Cross-origin request refused' });

    const appMatch = pathname.match(/^\/api\/applications\/([\w-]+)$/);
    const result = appMatch ? await handleAppRoute(req, appMatch[1]) : routes[`${req.method} ${pathname}`] ? await routes[`${req.method} ${pathname}`](req) : undefined;
    if (result === undefined) return send(res, 404, { error: 'Not found' });
    if (result && result.__csv !== undefined) {
      res.setHeader('Content-Disposition', 'attachment; filename="applications.csv"');
      return send(res, 200, result.__csv, 'text/csv; charset=utf-8');
    }
    send(res, 200, result);
  } catch (err) {
    if (!err.status) console.error(err);
    send(res, err.status || 500, { error: err.message || 'Internal error' });
  }
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    const enabled = listSources().filter((s) => s.enabled).map((s) => s.name);
    console.log(`Job portal running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    console.log(`Job sources: ${enabled.join(', ') || 'none'}`);
    console.log(`Cover letters: ${process.env.ANTHROPIC_API_KEY ? 'Claude' : 'built-in template (set ANTHROPIC_API_KEY to use Claude)'}`);
  });
  // Keep the list fresh while the portal runs: search again whenever the
  // last search is older than AUTO_REFRESH_HOURS (0 turns this off).
  if (AUTO_REFRESH_HOURS > 0) {
    const tick = () => {
      const last = store.read('meta', null);
      const stale = !last || Date.now() - Date.parse(last.lastSearchAt) > AUTO_REFRESH_HOURS * 3600000;
      if (stale && hasProfile(getProfile())) {
        runSearch().then((r) => console.log(`Auto-search: ${r.newCount} new job(s)`), (e) => console.warn(`Auto-search failed: ${e.message}`));
      }
    };
    setTimeout(tick, 5000);
    setInterval(tick, 15 * 60 * 1000).unref();
  }
}

module.exports = { server, cleanProfile, csvCell };
