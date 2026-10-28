'use strict';

// LinkedIn's public "jobs-guest" endpoints: no login, no API key. Parsing is
// ported from the MIT-licensed ai-job-search linkedin-search CLI.
// Automated access is against LinkedIn's terms, so this keeps volume low
// (a few result pages and detail fetches per search) and is for personal use.

const { decodeEntities, htmlToText } = require('./text');

const SEARCH_URL = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search';
const DETAIL_URL = 'https://www.linkedin.com/jobs-guest/jobs/api/jobPosting';
const UA = 'Mozilla/5.0 (compatible; personal-job-portal/1.0)';

const clean = (html) => decodeEntities(String(html || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// Search results are a flat list of <li> cards. Splitting on the job URN
// keeps one malformed card from breaking the rest.
function parseJobCards(html) {
  const out = [];
  for (const chunk of String(html || '').split(/data-entity-urn="urn:li:jobPosting:/).slice(1)) {
    const id = (chunk.match(/^(\d+)/) || [])[1];
    if (!id) continue;
    const link = chunk.match(/class="base-card__full-link[^"]*"[^>]*href="([^"]+)"/i);
    const h3 = chunk.match(/class="base-search-card__title"[^>]*>([\s\S]*?)<\/h3>/i);
    const sr = chunk.match(/class="sr-only"[^>]*>([\s\S]*?)<\/span>/i);
    const title = clean(h3 && h3[1]) || clean(sr && sr[1]);
    if (!title) continue;
    const sub = chunk.match(/class="base-search-card__subtitle"[^>]*>([\s\S]*?)<\/h4>/i);
    const loc = chunk.match(/class="job-search-card__location"[^>]*>([\s\S]*?)<\/span>/i);
    const dt = chunk.match(/class="job-search-card__listdate[^"]*"[^>]*datetime="([^"]+)"/i);
    out.push({
      id,
      title,
      company: clean(sub && sub[1]) || null,
      location: clean(loc && loc[1]) || null,
      date: dt ? dt[1] : null,
      url: link ? decodeEntities(link[1]).split('?')[0] : `https://www.linkedin.com/jobs/view/${id}`,
    });
  }
  return out;
}

// Inner HTML of the first <div> with this class, following nested divs.
function divContent(html, className) {
  const open = new RegExp(`<div[^>]*class="[^"]*${className}[^"]*"[^>]*>`, 'i').exec(html);
  if (!open) return null;
  let i = open.index + open[0].length;
  let depth = 1;
  while (depth > 0) {
    const nextOpen = html.indexOf('<div', i);
    const nextClose = html.indexOf('</div>', i);
    if (nextClose === -1) return null;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      i = nextOpen + 4;
    } else {
      depth--;
      i = nextClose + 6;
    }
  }
  return html.slice(open.index + open[0].length, i - 6);
}

function parseJobDetail(html) {
  const desc = divContent(html, 'show-more-less-html__markup') ?? divContent(html, 'description__text');
  const criteria = {};
  const re = /class="description__job-criteria-subheader"[^>]*>([\s\S]*?)<\/h3>[\s\S]*?class="description__job-criteria-text[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;
  let m;
  while ((m = re.exec(html))) criteria[clean(m[1]).toLowerCase()] = clean(m[2]);
  const descAt = html.search(/show-more-less-html__markup|description__text/);
  const topCard = descAt === -1 ? html : html.slice(0, descAt);
  return {
    description: desc ? htmlToText(desc) : '',
    seniority: criteria['seniority level'] || '',
    employmentType: criteria['employment type'] || '',
    closed: /closed-job__flavor|no longer accepting applications/i.test(topCard),
  };
}

// LinkedIn experience-level filter: 1 internship, 2 entry, 3 associate,
// 4 mid-senior, 5 director, 6 executive.
function experienceLevels(years) {
  const y = Number(years) || 0;
  if (y < 1) return '1,2';
  if (y < 3) return '2,3';
  if (y < 6) return '3,4';
  if (y < 12) return '4';
  return '4,5';
}

function buildSearchUrl({ query, location, maxAgeDays, workMode, years, start = 0 }) {
  const p = new URLSearchParams();
  if (query) p.set('keywords', query);
  p.set('location', location || 'India');
  if (maxAgeDays > 0) p.set('f_TPR', `r${Math.round(maxAgeDays * 86400)}`);
  const wt = { onsite: '1', remote: '2', hybrid: '3' }[workMode];
  if (wt) p.set('f_WT', wt);
  if (years !== undefined && years !== null && years !== '') p.set('f_E', experienceLevels(years));
  p.set('start', String(start));
  return `${SEARCH_URL}?${p}`;
}

async function getHtml(url) {
  for (let attempt = 0, delay = 600; ; attempt++, delay *= 2) {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'en-US,en;q=0.9' },
      signal: AbortSignal.timeout(15000),
    });
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await new Promise((r) => setTimeout(r, delay + Math.random() * 400));
      continue;
    }
    if (res.status === 404) return '';
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]).catch(() => null);
      }
    }),
  );
  return out;
}

const PAGES = Number(process.env.LINKEDIN_PAGES) || 3;
const DETAILS = Number(process.env.LINKEDIN_DETAILS) || 25;

async function search(opts) {
  const cards = [];
  for (let page = 0; page < PAGES; page++) {
    const batch = parseJobCards(await getHtml(buildSearchUrl({ ...opts, start: page * 10 })));
    cards.push(...batch);
    if (batch.length < 10) break;
  }
  // Cards carry no description, and skills can't be scored without one, so
  // fetch details for the first few; the rest are listed with title only.
  const details = await mapLimit(cards.slice(0, DETAILS), 4, (c) => getHtml(`${DETAIL_URL}/${c.id}`).then(parseJobDetail));
  return cards
    .map((c, i) => ({ card: c, detail: details[i] || null }))
    .filter(({ detail }) => !(detail && detail.closed))
    .map(({ card, detail }) => ({
      sourceId: card.id,
      title: card.title,
      company: card.company,
      location: card.location,
      remote: /\bremote\b/i.test(`${card.location} ${card.title}`) || opts.workMode === 'remote',
      url: card.url,
      description: detail ? detail.description : '',
      tags: [detail && detail.seniority].filter(Boolean),
      employmentType: detail ? detail.employmentType : '',
      postedAt: card.date,
    }));
}

module.exports = { search, parseJobCards, parseJobDetail, buildSearchUrl, experienceLevels };
