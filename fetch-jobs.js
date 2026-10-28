#!/usr/bin/env node
'use strict';

// Command-line job search for scheduled runs:
//   node fetch-jobs.js --profile profile.json [--out jobs.json] [--days 10] [--limit 80]
// Reads a profile, searches every enabled source, scores each posting and
// writes {plan, report, jobs} as JSON, best fit first.

const fs = require('fs');
const { searchForProfile } = require('./lib/autosearch');
const { scoreJob } = require('./lib/scoring');
const { DEFAULT_PROFILE } = require('./lib/store');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

(async () => {
  const file = arg('profile');
  if (!file) {
    console.error('Usage: node fetch-jobs.js --profile profile.json [--out jobs.json] [--days 10] [--limit 80]');
    process.exit(2);
  }
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const profile = { ...DEFAULT_PROFILE, ...(raw.profile || raw) };
  const limit = Number(arg('limit', 80));
  const { plan, jobs, report } = await searchForProfile(profile, { maxAgeDays: arg('days') });
  const scored = jobs
    .map((j) => ({ ...j, description: j.description.slice(0, 8000), fit: scoreJob(j, profile) }))
    .sort((a, b) => b.fit.eligible - a.fit.eligible || b.fit.score - a.fit.score)
    .slice(0, limit);
  const out = JSON.stringify({ searchedAt: new Date().toISOString(), plan, report, jobs: scored }, null, 2);
  const target = arg('out');
  if (target) fs.writeFileSync(target, out);
  else process.stdout.write(out + '\n');
  const ok = Object.values(report).some((r) => r.ok);
  console.error(`${scored.length} job(s); sources: ${Object.entries(report).map(([k, v]) => `${k} ${v.ok ? v.count : `failed (${v.error})`}`).join(', ')}`);
  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
