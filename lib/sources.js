'use strict';

const crypto = require('crypto');
const { htmlToText, guardPosting, extractEmails } = require('./text');
const linkedin = require('./linkedin');

const UA = 'Mozilla/5.0 (compatible; personal-job-portal/1.0)';
const TIMEOUT_MS = Number(process.env.SOURCE_TIMEOUT_MS) || 15000;

async function getJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    throw new Error(err.name === 'AbortError' ? `timed out after ${TIMEOUT_MS / 1000}s` : err.message);
  } finally {
    clearTimeout(timer);
  }
}

function formatSalary(min, max, currency = '') {
  const f = (n) => (Number(n) ? Math.round(Number(n)).toLocaleString('en-US') : '');
  if (!f(min) && !f(max)) return '';
  return [currency, [f(min), f(max)].filter(Boolean).join(' – ')].filter(Boolean).join(' ');
}

function toDate(v) {
  if (!v) return null;
  const d = typeof v === 'number' ? new Date(v < 1e12 ? v * 1000 : v) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Every source maps its raw records onto this one shape.
function normalize(source, raw) {
  const guarded = guardPosting(htmlToText(raw.description));
  const id = crypto.createHash('sha1').update(`${source}:${raw.sourceId || raw.url}`).digest('hex').slice(0, 16);
  return {
    id,
    source,
    title: String(raw.title || '').trim(),
    company: String(raw.company || '').trim() || 'Unknown company',
    location: String(raw.location || '').trim(),
    remote: !!raw.remote,
    url: raw.url || '',
    applyUrl: raw.applyUrl || raw.url || '',
    description: guarded.text,
    integrityFlags: guarded.flags,
    emails: extractEmails(guarded.text),
    tags: (raw.tags || []).map(String).slice(0, 15),
    salary: raw.salary || '',
    employmentType: raw.employmentType || '',
    postedAt: toDate(raw.postedAt),
  };
}

// Sources without a server-side keyword filter get filtered here: a job is
// kept when any query word appears in its title or tags (or, failing that,
// at least half of them appear in the description).
function matchesQuery(raw, query) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return true;
  const head = `${raw.title} ${(raw.tags || []).join(' ')}`.toLowerCase();
  if (words.some((w) => head.includes(w))) return true;
  const body = String(raw.description || '').toLowerCase();
  return words.filter((w) => body.includes(w)).length >= Math.ceil(words.length / 2);
}

const SOURCES = {
  linkedin: {
    name: 'LinkedIn',
    homepage: 'https://www.linkedin.com/jobs',
    // Public guest search: filters by location, posting age, work mode and
    // experience on LinkedIn's side. Personal, low-volume use only.
    search: (opts) => linkedin.search(opts),
  },
  remotive: {
    name: 'Remotive',
    homepage: 'https://remotive.com',
    async search({ query }) {
      const data = await getJson(`https://remotive.com/api/remote-jobs?limit=60&search=${encodeURIComponent(query || '')}`);
      return (data.jobs || []).map((j) => ({
        sourceId: j.id,
        title: j.title,
        company: j.company_name,
        location: j.candidate_required_location,
        remote: true,
        url: j.url,
        description: j.description,
        tags: [j.category, ...(j.tags || [])].filter(Boolean),
        salary: j.salary,
        employmentType: j.job_type,
        postedAt: j.publication_date,
      }));
    },
  },
  remoteok: {
    name: 'Remote OK',
    homepage: 'https://remoteok.com',
    async search({ query }) {
      const data = await getJson('https://remoteok.com/api');
      return (Array.isArray(data) ? data : [])
        .filter((j) => j && j.id && j.position)
        .map((j) => ({
          sourceId: j.id,
          title: j.position,
          company: j.company,
          location: j.location || 'Worldwide',
          remote: true,
          url: j.url,
          applyUrl: j.apply_url || j.url,
          description: j.description,
          tags: j.tags,
          salary: formatSalary(j.salary_min, j.salary_max, 'USD'),
          postedAt: j.date || j.epoch,
        }))
        .filter((j) => matchesQuery(j, query));
    },
  },
  arbeitnow: {
    name: 'Arbeitnow',
    homepage: 'https://www.arbeitnow.com',
    async search({ query }) {
      const pages = await Promise.all([1, 2].map((p) => getJson(`https://www.arbeitnow.com/api/job-board-api?page=${p}`).catch(() => ({ data: [] }))));
      return pages
        .flatMap((p) => p.data || [])
        .map((j) => ({
          sourceId: j.slug,
          title: j.title,
          company: j.company_name,
          location: j.location,
          remote: !!j.remote,
          url: j.url,
          description: j.description,
          tags: [...(j.tags || []), ...(j.job_types || [])],
          employmentType: (j.job_types || []).join(', '),
          postedAt: j.created_at,
        }))
        .filter((j) => matchesQuery(j, query));
    },
  },
  jobicy: {
    name: 'Jobicy',
    homepage: 'https://jobicy.com',
    async search({ query }) {
      const tag = String(query || '').trim().split(/\s+/)[0] || '';
      const data = await getJson(`https://jobicy.com/api/v2/remote-jobs?count=50${tag ? `&tag=${encodeURIComponent(tag)}` : ''}`);
      return (data.jobs || []).map((j) => ({
        sourceId: j.id,
        title: htmlToText(j.jobTitle),
        company: j.companyName,
        location: j.jobGeo,
        remote: true,
        url: j.url,
        description: j.jobDescription || j.jobExcerpt,
        tags: [].concat(j.jobIndustry || [], j.jobType || []),
        salary: formatSalary(j.annualSalaryMin, j.annualSalaryMax, j.salaryCurrency),
        employmentType: [].concat(j.jobType || []).join(', '),
        postedAt: j.pubDate,
      }));
    },
  },
  adzuna: {
    name: 'Adzuna',
    homepage: 'https://developer.adzuna.com',
    // Free API key required; covers on-site jobs in India, UK, US, EU and more.
    enabled: () => !!(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY),
    requires: 'ADZUNA_APP_ID and ADZUNA_APP_KEY (free at developer.adzuna.com)',
    async search({ query, location }) {
      const country = (process.env.ADZUNA_COUNTRY || 'in').toLowerCase();
      const params = new URLSearchParams({
        app_id: process.env.ADZUNA_APP_ID,
        app_key: process.env.ADZUNA_APP_KEY,
        results_per_page: '50',
        what: query || '',
        'content-type': 'application/json',
      });
      if (location && !/remote/i.test(location)) params.set('where', location);
      const data = await getJson(`https://api.adzuna.com/v1/api/jobs/${country}/search/1?${params}`);
      return (data.results || []).map((j) => ({
        sourceId: j.id,
        title: htmlToText(j.title),
        company: j.company && j.company.display_name,
        location: j.location && j.location.display_name,
        remote: /\b(remote|work from home|wfh)\b/i.test(`${j.title} ${j.description}`),
        url: j.redirect_url,
        description: j.description,
        tags: [j.category && j.category.label].filter(Boolean),
        salary: formatSalary(j.salary_min, j.salary_max, country === 'in' ? 'INR' : ''),
        employmentType: j.contract_time,
        postedAt: j.created,
      }));
    },
  },
  demo: {
    name: 'Demo data',
    homepage: '',
    // Offline sample postings, so the portal can be tried without network access.
    enabled: () => process.env.JOB_SOURCES === 'demo' || process.env.ENABLE_DEMO === '1',
    async search({ query }) {
      const all = require('./demo-jobs');
      const hits = all.filter((j) => matchesQuery(j, query));
      return hits.length ? hits : all;
    },
  },
};

function isEnabled(key) {
  const src = SOURCES[key];
  if (!src) return false;
  const only = (process.env.JOB_SOURCES || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (only.length && !only.includes(key)) return false;
  return src.enabled ? src.enabled() : true;
}

function listSources() {
  return Object.entries(SOURCES).map(([key, s]) => ({
    key,
    name: s.name,
    homepage: s.homepage,
    enabled: isEnabled(key),
    requires: s.requires || null,
  }));
}

function dedupeKey(job) {
  const n = (s) => String(s).toLowerCase().replace(/\b(gmbh|inc|ltd|llc|pvt|private|limited|co)\b/g, '').replace(/[^a-z0-9]/g, '');
  return `${n(job.company)}|${n(job.title)}`;
}

// Query every enabled source in parallel. One failing source never sinks the
// search; its error is reported alongside the results. `maxAgeDays` drops
// postings older than that (sources that don't date their postings keep them).
async function searchAll({ query, location, sources, maxAgeDays, workMode, years }) {
  const keys = (sources && sources.length ? sources : Object.keys(SOURCES)).filter(isEnabled);
  const cutoff = maxAgeDays > 0 ? Date.now() - maxAgeDays * 86400000 : 0;
  const report = {};
  const settled = await Promise.all(
    keys.map(async (key) => {
      try {
        const raws = await SOURCES[key].search({ query, location, maxAgeDays, workMode, years });
        const jobs = raws
          .filter((r) => r.title && r.url)
          .map((r) => normalize(key, r))
          .filter((j) => !cutoff || !j.postedAt || Date.parse(j.postedAt) >= cutoff);
        report[key] = { ok: true, count: jobs.length };
        return jobs;
      } catch (err) {
        report[key] = { ok: false, error: err.message };
        return [];
      }
    }),
  );
  const seen = new Map();
  for (const job of settled.flat()) {
    const k = dedupeKey(job);
    if (!seen.has(k)) seen.set(k, job);
  }
  return { jobs: [...seen.values()], report };
}

module.exports = { searchAll, listSources, normalize, matchesQuery, dedupeKey, SOURCES };
