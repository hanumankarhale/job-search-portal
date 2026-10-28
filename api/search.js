'use strict';

// GET: what this deployment can do. POST {profile, query?}: search every job
// board for the profile and return the postings, scored, best fit first.

const { handler, readJson } = require('./_util');
const { cleanProfile, str } = require('../lib/profile');
const { searchForProfile } = require('../lib/autosearch');
const { listSources } = require('../lib/sources');
const { scoreJob } = require('../lib/scoring');

module.exports = handler({
  GET: () => ({
    ok: true,
    claude: !!process.env.ANTHROPIC_API_KEY,
    needsKey: !!process.env.PORTAL_KEY,
    sources: listSources().filter((s) => s.enabled).map((s) => s.name),
  }),
  POST: async (req) => {
    const body = await readJson(req);
    const profile = cleanProfile(body.profile || {});
    if (!profile.skills.length && !profile.languages.length && !profile.targetRoles.length) {
      throw Object.assign(new Error('Add your skills or job titles to the profile first.'), { status: 400 });
    }
    const { plan, jobs, report } = await searchForProfile(profile, { query: str(body.query, 200) });
    const scored = jobs
      .map((j) => ({ ...j, description: j.description.slice(0, 8000), fit: scoreJob(j, profile) }))
      .sort((a, b) => b.fit.eligible - a.fit.eligible || b.fit.score - a.fit.score)
      .slice(0, 100);
    return { searchedAt: new Date().toISOString(), plan, report, jobs: scored };
  },
});
