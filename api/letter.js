'use strict';

// POST {profile, job}: a cover letter and "why this role" answer written by
// Claude. Needs ANTHROPIC_API_KEY in the deployment's environment variables.

const { handler, readJson } = require('./_util');
const { cleanProfile, str } = require('../lib/profile');
const { buildApplication } = require('../lib/generate');
const { scoreJob } = require('../lib/scoring');

module.exports = handler({
  POST: async (req) => {
    if (!process.env.ANTHROPIC_API_KEY) throw Object.assign(new Error('Claude is not set up on this deployment.'), { status: 501 });
    const body = await readJson(req);
    const profile = cleanProfile(body.profile || {});
    const j = body.job || {};
    const job = { title: str(j.title, 200), company: str(j.company, 120), location: str(j.location, 120), description: str(j.description, 20000) };
    const pkg = await buildApplication(profile, job, scoreJob(job, profile));
    if (pkg.generator !== 'claude') throw Object.assign(new Error(pkg.warning || 'Claude could not write this letter.'), { status: 502 });
    return { coverLetter: pkg.coverLetter, pitch: pkg.pitch };
  },
});
