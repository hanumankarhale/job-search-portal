'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { parseJobCards, parseJobDetail, buildSearchUrl, experienceLevels } = require('../lib/linkedin');
const { searchPlan, searchForProfile } = require('../lib/autosearch');

test('parses real LinkedIn guest search cards', () => {
  const html = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/linkedin-search-cards.json'), 'utf8'));
  const cards = parseJobCards(html);
  assert.equal(cards.length, 2);
  for (const c of cards) {
    assert.match(c.id, /^\d+$/);
    assert.ok(c.title && c.company && c.location, JSON.stringify(c));
    assert.match(c.url, /^https:\/\/[a-z]+\.linkedin\.com\/jobs\/view\//);
    assert.doesNotMatch(c.url, /\?/);
    assert.match(c.date, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test('parses a job detail page', () => {
  const html = `<h1 class="top-card-layout__title">Node Dev</h1>
    <div class="show-more-less-html__markup"><p>Build APIs in <b>Node.js</b></p><div><ul><li>4+ years</li></ul></div></div>
    <h3 class="description__job-criteria-subheader">Seniority level</h3><span class="description__job-criteria-text">Mid-Senior level</span>`;
  const d = parseJobDetail(html);
  assert.match(d.description, /Build APIs in Node\.js/);
  assert.match(d.description, /• 4\+ years/);
  assert.equal(d.seniority, 'Mid-Senior level');
  assert.equal(d.closed, false);
  assert.equal(parseJobDetail('<span class="closed-job__flavor">No longer accepting applications</span>').closed, true);
});

test('builds a search URL from location, recency, work mode and experience', () => {
  const u = new URL(buildSearchUrl({ query: 'Node.js developer', location: 'Pune', maxAgeDays: 10, workMode: 'hybrid', years: 4, start: 10 }));
  assert.equal(u.searchParams.get('keywords'), 'Node.js developer');
  assert.equal(u.searchParams.get('location'), 'Pune');
  assert.equal(u.searchParams.get('f_TPR'), 'r864000');
  assert.equal(u.searchParams.get('f_WT'), '3');
  assert.equal(u.searchParams.get('f_E'), '3,4');
  assert.equal(u.searchParams.get('start'), '10');
  assert.equal(experienceLevels(0), '1,2');
  assert.equal(experienceLevels(8), '4');
});

test('searchPlan turns a profile into searches', () => {
  const plan = searchPlan({ languages: [{ name: 'Node.js' }], skills: [], targetRoles: [], locations: ['Remote', 'Pune'], yearsExperience: 4, postedWithinDays: 10, workMode: 'any' });
  assert.deepEqual(plan.queries, ['Node.js developer']);
  assert.equal(plan.location, 'Pune');
  assert.equal(plan.maxAgeDays, 10);
  assert.equal(plan.workMode, undefined);
  assert.equal(plan.years, 4);
  assert.deepEqual(searchPlan({ targetRoles: ['Backend Developer', 'Node.js Developer', 'X'], searchKeywords: '' }).queries, ['Backend Developer', 'Node.js Developer']);
  assert.deepEqual(searchPlan({ searchKeywords: 'nodejs, express' }).queries, ['nodejs', 'express']);
});

test('drops postings older than the recency window', async () => {
  const prev = process.env.JOB_SOURCES;
  process.env.JOB_SOURCES = 'demo';
  try {
    const all = await searchForProfile({ targetRoles: [], skills: ['Docker'], postedWithinDays: 30 }, { query: 'engineer' });
    const recent = await searchForProfile({ targetRoles: [], skills: ['Docker'], postedWithinDays: 3 }, { query: 'engineer' });
    assert.ok(recent.jobs.length > 0 && recent.jobs.length < all.jobs.length, `${recent.jobs.length} vs ${all.jobs.length}`);
    assert.ok(recent.jobs.every((j) => Date.now() - Date.parse(j.postedAt) <= 3 * 86400000));
    assert.equal(recent.report.demo.ok, true);
  } finally {
    if (prev === undefined) delete process.env.JOB_SOURCES;
    else process.env.JOB_SOURCES = prev;
  }
});
