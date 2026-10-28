'use strict';

const { extractSkills, canonical } = require('./skills');

// Weights and thresholds follow the fit framework in ai-job-search
// (04-job-evaluation.md), minus the behavioural dimension, which needs an
// interview-built profile this portal does not collect.
const WEIGHTS = { skills: 0.4, experience: 0.25, role: 0.35 };

const VERDICTS = [
  [75, 'Strong Fit'],
  [60, 'Good Fit'],
  [45, 'Moderate Fit'],
  [30, 'Weak Fit'],
  [0, 'Poor Fit'],
];

const STOPWORDS = new Set(['and', 'or', 'the', 'a', 'an', 'of', 'for', 'in', 'to', 'with', 'at', 'm', 'f', 'd', 'w', 'remote', 'hybrid', 'senior', 'junior', 'sr', 'jr', 'mid', 'lead', 'level', 'i', 'ii', 'iii']);

function tokens(s) {
  return String(s || '')
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ''))
    .filter((t) => t && !STOPWORDS.has(t));
}

function profileSkillSet(profile) {
  const all = [...(profile.skills || []), ...(profile.languages || []).map((l) => (typeof l === 'string' ? l : l.name))];
  return new Map(all.filter(Boolean).map((s) => [canonical(s).toLowerCase(), canonical(s)]));
}

function scoreSkills(job, profile) {
  const mine = profileSkillSet(profile);
  const titleSkills = new Set(extractSkills(job.title, [...mine.values()]).map((s) => s.name));
  const jobSkills = extractSkills(`${job.title}\n${(job.tags || []).join(', ')}\n${job.description}`, [...mine.values()]);
  if (!jobSkills.length) return { score: 50, matched: [], missing: [], note: 'No recognisable skills in posting' };

  let total = 0;
  let hit = 0;
  const matched = [];
  const missing = [];
  // A skill named in the title or repeated in the text matters more.
  for (const s of jobSkills.sort((a, b) => b.count - a.count)) {
    const w = (titleSkills.has(s.name) ? 3 : 1) + Math.min(s.count - 1, 2) * 0.5;
    total += w;
    if (mine.has(s.name.toLowerCase())) {
      hit += w;
      matched.push(s.name);
    } else {
      missing.push(s.name);
    }
  }
  const coverage = hit / total;
  const score = Math.round(15 + 85 * coverage);
  return { score, matched, missing, note: `${matched.length} of ${jobSkills.length} posting skills match` };
}

const SENIORITY = [
  [/\b(intern|internship|trainee|apprentice)\b/i, 0],
  [/\b(junior|jr\.?|entry[- ]level|graduate|fresher|associate)\b/i, 1],
  [/\b(senior|sr\.?)\b/i, 5],
  [/\b(lead|staff|principal|architect)\b/i, 7],
  [/\b(head of|director|vp|vice president|cto)\b/i, 10],
];

function requiredYears(job) {
  let fromTitle = null;
  for (const [re, years] of SENIORITY) if (re.test(job.title)) fromTitle = years;
  let fromText = null;
  const re = /(\d{1,2})\s*(?:\+|plus)?\s*(?:-\s*\d{1,2}\s*)?(?:years?|yrs?)(?:'|’)?\s*(?:of\s+)?(?:\w+\s+){0,3}?experience/gi;
  let m;
  while ((m = re.exec(job.description || ''))) {
    const n = parseInt(m[1], 10);
    if (n > 0 && n <= 20) fromText = fromText === null ? n : Math.min(fromText, n);
  }
  if (fromText !== null) return { years: fromText, basis: `posting asks for ${fromText}+ years` };
  if (fromTitle !== null) return { years: fromTitle, basis: 'seniority in title' };
  return { years: null, basis: 'no stated requirement' };
}

function scoreExperience(job, profile) {
  const have = Number(profile.yearsExperience) || 0;
  const req = requiredYears(job);
  if (req.years === null) return { score: 70, note: req.basis };
  const gap = req.years - have;
  let score;
  if (gap <= 0) score = have - req.years > 6 ? 70 : 92;
  else if (gap <= 1) score = 75;
  else if (gap <= 2) score = 62;
  else if (gap <= 4) score = 42;
  else score = 22;
  return { score, note: `${req.basis}; you have ${have}` };
}

function scoreRole(job, profile) {
  const roles = (profile.targetRoles || []).filter(Boolean);
  if (!roles.length) return { score: 60, note: 'Add target roles to your profile' };
  const title = String(job.title || '').toLowerCase();
  let best = 0;
  let bestRole = '';
  for (const role of roles) {
    if (title.includes(role.toLowerCase())) return { score: 95, note: `Title matches "${role}"` };
    const want = tokens(role);
    if (!want.length) continue;
    const have = new Set(tokens(job.title));
    const ratio = want.filter((t) => have.has(t)).length / want.length;
    if (ratio > best) [best, bestRole] = [ratio, role];
  }
  if (best === 0) return { score: 30, note: 'Title does not match your target roles' };
  return { score: Math.round(35 + 55 * best), note: `Partly matches "${bestRole}"` };
}

// Remote jobs often say who may apply ("USA only", "UK"). For someone whose
// locations are in India, a remote job is open to them only if it names
// India, Asia/APAC or no region at all.
const INDIA = /\b(india|pune|mumbai|bengaluru|bangalore|hyderabad|chennai|delhi|new delhi|noida|gurgaon|gurugram|kolkata|ahmedabad|kochi|jaipur|indore|nagpur|nashik|thane|chandigarh|coimbatore|maharashtra|karnataka)\b/;

function checkLocation(job, profile) {
  const mode = profile.workMode || 'any';
  const prefs = (profile.locations || []).map((l) => l.toLowerCase()).filter(Boolean);
  const loc = String(job.location || '').toLowerCase();
  const locMatches = prefs.some((p) => loc.includes(p) || (loc && p.includes(loc)));
  const global = !loc || /\b(anywhere|worldwide|global|any location)\b/.test(loc);
  const inIndia = INDIA.test(`${prefs.join(' ')} ${String(profile.location || '').toLowerCase()}`);

  if (job.remote) {
    if (mode === 'onsite') return { status: 'FLAG', note: 'Remote role; you prefer on-site' };
    if (global || locMatches || (inIndia && /\b(india|asia|apac)\b/.test(loc))) return { status: 'PASS', note: 'Remote' + (loc ? ` (${job.location})` : '') };
    if (inIndia) return { status: 'FAIL', note: `Remote, but only for people in ${job.location}` };
    return { status: 'FLAG', note: `Remote, but limited to: ${job.location}` };
  }
  if (mode === 'remote') return { status: 'FAIL', note: `On-site/hybrid in ${job.location || 'unknown location'}; you want remote only` };
  if (locMatches) return { status: 'PASS', note: job.location };
  if (!prefs.length) return { status: 'FLAG', note: `Located in ${job.location || 'unknown'}` };
  return { status: 'FAIL', note: `${job.location || 'Unknown location'} is outside your preferred locations` };
}

// Words too common in job titles to say what a job is about.
const GENERIC = new Set(['developer', 'developers', 'engineer', 'engineers', 'senior', 'junior', 'lead', 'software', 'full', 'stack', 'fullstack', 'backend', 'back', 'end', 'frontend', 'front', 'sr', 'jr', 'and', 'or', 'the', 'of', 'for', 'in', 'with', 'remote', 'job', 'jobs', 'role', 'web', 'app', 'application', 'programmer', 'specialist', 'associate', 'principal', 'staff', 'level', 'i', 'ii', 'iii']);
const TECH_TITLE = /develop|engineer|programm|architect|\bsde\b|software|full[ -]?stack|back[ -]?end|front[ -]?end|devops|data scien|data engineer|machine learning|\bml\b|\bai\b|technical lead|tech lead/i;

// Is this posting about what the person is looking for? True when the title
// names one of their languages, target roles or search words, or when it is a
// technical role whose posting asks for one of their languages (or skills,
// when no languages are given). This drops postings that only mention a
// language in passing, like an analyst role "nice to have: Python".
function isRelevant(job, profile, queries = []) {
  const langs = (profile.languages || []).map((l) => canonical(typeof l === 'string' ? l : l.name)).filter(Boolean);
  const words = [...(profile.targetRoles || []), ...queries]
    .flatMap((r) => String(r).toLowerCase().split(/[^a-z0-9+#.]+/))
    .map((w) => w.replace(/^\.+|\.+$/g, ''))
    .filter((w) => w.length > 1 && !GENERIC.has(w));
  const core = [...new Set([...langs.map((l) => l.toLowerCase()), ...words])];
  const title = String(job.title || '');
  const inTitle = extractSkills(title, core).some((s) => core.includes(s.name.toLowerCase())) || core.some((w) => new RegExp(`(?<![a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`, 'i').test(title));
  if (inTitle) return true;
  if (!TECH_TITLE.test(title)) return false;
  const found = new Set(extractSkills(`${title}\n${(job.tags || []).join(', ')}\n${job.description}`, [...langs, ...(profile.skills || [])]).map((s) => s.name.toLowerCase()));
  const wanted = langs.length ? langs : (profile.skills || []).map(canonical);
  return wanted.some((w) => found.has(String(w).toLowerCase()));
}

function findDealBreaker(job, profile) {
  const hay = `${job.title} ${job.company}`.toLowerCase();
  return (profile.excludeKeywords || []).find((k) => k && hay.includes(k.toLowerCase())) || null;
}

function verdictFor(score) {
  return VERDICTS.find(([min]) => score >= min)[1];
}

function scoreJob(job, profile) {
  const skills = scoreSkills(job, profile);
  const experience = scoreExperience(job, profile);
  const role = scoreRole(job, profile);
  const location = checkLocation(job, profile);
  const dealBreaker = findDealBreaker(job, profile);

  let score = Math.round(skills.score * WEIGHTS.skills + experience.score * WEIGHTS.experience + role.score * WEIGHTS.role);
  let verdict = verdictFor(score);
  if (dealBreaker) verdict = `Excluded ("${dealBreaker}")`;
  else if (location.status === 'FAIL') verdict = 'Location mismatch';

  return {
    score,
    verdict,
    eligible: !dealBreaker && location.status !== 'FAIL',
    breakdown: {
      skills: { score: skills.score, note: skills.note },
      experience,
      role,
    },
    location,
    matchedSkills: skills.matched,
    missingSkills: skills.missing,
  };
}

module.exports = { scoreJob, isRelevant, requiredYears, checkLocation, verdictFor, WEIGHTS };
