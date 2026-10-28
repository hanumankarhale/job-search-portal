'use strict';

const { DEFAULT_PROFILE } = require('./store');

const str = (v, max = 300) => String(v ?? '').trim().slice(0, max);
const list = (v, max = 80) =>
  (Array.isArray(v) ? v : String(v ?? '').split(/[,\n]/))
    .map((s) => (typeof s === 'string' ? s.trim() : s))
    .filter(Boolean)
    .slice(0, max);

// Coerce untrusted input into a well-formed, size-bounded profile.
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

module.exports = { cleanProfile, str, list };
