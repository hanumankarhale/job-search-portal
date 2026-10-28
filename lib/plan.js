'use strict';

// Turns a profile into job searches: what to search for, where, and how
// recent. "Node.js, 4 years, Pune, last 10 days" becomes a LinkedIn search for
// Node.js roles in Pune posted within 10 days at associate/mid-senior level,
// plus the remote boards.
function searchPlan(profile, overrides = {}) {
  const lang = (profile.languages || []).map((l) => (typeof l === 'string' ? l : l.name)).filter(Boolean)[0];
  const typed = String(overrides.query || profile.searchKeywords || '').split(',').map((s) => s.trim()).filter(Boolean);
  const queries = typed.length
    ? typed
    : (profile.targetRoles || []).filter(Boolean).slice(0, 2).length
      ? profile.targetRoles.filter(Boolean).slice(0, 2)
      : [lang ? `${lang} developer` : (profile.skills || [])[0] || 'software developer'];
  const place = (profile.locations || []).find((l) => !/^remote$/i.test(l.trim())) || profile.location || 'India';
  return {
    queries: queries.slice(0, 3),
    location: overrides.location || place,
    maxAgeDays: Number(overrides.maxAgeDays ?? profile.postedWithinDays) || 10,
    workMode: profile.workMode === 'any' ? undefined : profile.workMode,
    years: profile.yearsExperience,
  };
}

module.exports = { searchPlan };
