'use strict';

const { searchAll, dedupeKey } = require('./sources');
const { searchPlan } = require('./plan');

async function searchForProfile(profile, overrides = {}) {
  const plan = searchPlan(profile, overrides);
  const seen = new Map();
  const report = {};
  // One query at a time keeps request volume on each board low.
  for (const query of plan.queries) {
    const r = await searchAll({ ...plan, query, sources: overrides.sources });
    for (const job of r.jobs) if (!seen.has(dedupeKey(job))) seen.set(dedupeKey(job), job);
    for (const [k, v] of Object.entries(r.report)) {
      const prev = report[k];
      report[k] = !prev ? v : { ok: prev.ok || v.ok, count: (prev.count || 0) + (v.count || 0), error: v.ok ? prev.error : v.error };
    }
  }
  return { plan, jobs: [...seen.values()], report };
}

module.exports = { searchPlan, searchForProfile };
