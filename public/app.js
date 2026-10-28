'use strict';

// All job text is third-party content: it is only ever placed into the page
// via textContent (see h()), never innerHTML.

const $ = (sel) => document.querySelector(sel);

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

async function copy(text, label = 'Copied to clipboard') {
  try {
    await navigator.clipboard.writeText(text);
    toast(label);
  } catch {
    toast('Copy failed — select the text and copy manually');
  }
}

// Only http(s) links from postings are ever made clickable.
function safeUrl(u) {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

const state = { profile: null, status: null, jobs: [], apps: [], tab: 'profile' };

// ---------------- Tabs ----------------

function showTab(name) {
  state.tab = name;
  document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('.panel').forEach((p) => (p.hidden = p.id !== `tab-${name}`));
  try { localStorage.setItem('jp.tab', name); } catch {}
  if (name === 'apps') renderApps();
  if (name === 'jobs') renderJobs();
}
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

// ---------------- Profile ----------------

const profileForm = $('#profileForm');
let langs = [];
let skills = [];

function renderTags() {
  $('#langTags').replaceChildren(
    ...langs.map((l, i) =>
      h('span', { class: 'tag' }, l.name, ' ', h('small', {}, l.level), h('button', { type: 'button', 'aria-label': `Remove ${l.name}`, onclick: () => { langs.splice(i, 1); renderTags(); } }, '×')),
    ),
  );
  $('#skillTags').replaceChildren(
    ...skills.map((s, i) => h('span', { class: 'tag' }, s, h('button', { type: 'button', 'aria-label': `Remove ${s}`, onclick: () => { skills.splice(i, 1); renderTags(); } }, '×'))),
  );
}

function addLang() {
  const name = $('#langName').value.trim();
  if (!name) return;
  if (!langs.some((l) => l.name.toLowerCase() === name.toLowerCase())) langs.push({ name, level: $('#langLevel').value });
  $('#langName').value = '';
  renderTags();
  $('#langName').focus();
}
$('#addLang').addEventListener('click', addLang);
$('#langName').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addLang(); } });

function addSkills(raw) {
  for (const s of raw.split(',').map((x) => x.trim()).filter(Boolean)) {
    if (!skills.some((k) => k.toLowerCase() === s.toLowerCase())) skills.push(s);
  }
  renderTags();
}
$('#skillEntry').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    addSkills(e.target.value);
    e.target.value = '';
  } else if (e.key === 'Backspace' && !e.target.value && skills.length) {
    skills.pop();
    renderTags();
  }
});
$('#skillEntry').addEventListener('blur', (e) => { if (e.target.value.trim()) { addSkills(e.target.value); e.target.value = ''; } });

const SUGGESTIONS = ['JavaScript', 'TypeScript', 'Python', 'Java', 'PHP', 'C#', 'C++', 'Go', 'Rust', 'Kotlin', 'Swift', 'Dart', 'Ruby', 'SQL', 'React', 'Angular', 'Vue', 'Next.js', 'Node.js', 'Express', 'Laravel', 'CodeIgniter', 'Django', 'Flask', 'FastAPI', 'Spring Boot', '.NET', 'Flutter', 'React Native', 'MySQL', 'PostgreSQL', 'MongoDB', 'Redis', 'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform', 'Git', 'Linux', 'REST APIs', 'GraphQL', 'Microservices', 'Machine Learning', 'Pandas', 'TensorFlow', 'PyTorch', 'Power BI', 'Tableau', 'HTML', 'CSS', 'Tailwind CSS', 'Bootstrap', 'jQuery', 'Agile', 'CI/CD'];
$('#skillList').replaceChildren(...SUGGESTIONS.map((s) => h('option', { value: s })));

function fillProfile(p) {
  for (const el of profileForm.elements) {
    if (!el.name) continue;
    const v = p[el.name];
    el.value = Array.isArray(v) ? (el.tagName === 'TEXTAREA' ? v.join('\n') : v.join(', ')) : v ?? '';
  }
  langs = (p.languages || []).map((l) => (typeof l === 'string' ? { name: l, level: 'proficient' } : l));
  skills = [...(p.skills || [])];
  renderTags();
}

function readProfile() {
  const data = Object.fromEntries(new FormData(profileForm));
  return { ...data, languages: langs, skills };
}

async function saveProfile() {
  const pending = $('#skillEntry').value.trim();
  if (pending) { addSkills(pending); $('#skillEntry').value = ''; }
  if (!profileForm.reportValidity()) return;
  const btn = $('#saveProfile');
  btn.disabled = true;
  try {
    state.profile = await api('/api/profile', { method: 'PUT', body: readProfile() });
    fillProfile(state.profile);
    toast('Profile saved — job scores updated');
    await loadJobs();
    if (!state.jobs.length) showTab('jobs');
  } catch (e) {
    toast(e.message);
  } finally {
    btn.disabled = false;
  }
}
$('#saveProfile').addEventListener('click', saveProfile);
profileForm.addEventListener('submit', (e) => { e.preventDefault(); saveProfile(); });

// ---------------- Jobs ----------------

function scoreRing(score) {
  const c = score >= 75 ? 'var(--good)' : score >= 60 ? 'var(--primary)' : score >= 45 ? 'var(--ok)' : 'var(--bad)';
  return h('div', { class: 'score', style: `--v:${score};--c:${c}`, title: `Fit score ${score}/100` }, h('span', {}, score));
}

function verdictClass(fit) {
  if (!fit.eligible) return 'v-bad';
  return fit.score >= 60 ? 'v-good' : fit.score >= 45 ? 'v-ok' : 'v-bad';
}

function relTime(iso) {
  if (!iso) return '';
  const d = Math.round((Date.now() - new Date(iso)) / 86400000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
}

function sourceName(key) {
  const s = (state.status?.sources || []).find((x) => x.key === key);
  return s ? s.name : key === 'manual' ? 'Added by you' : key;
}

function jobCard(job) {
  const f = job.fit;
  return h(
    'article',
    { class: `job${f.eligible ? '' : ' dim'}` },
    scoreRing(f.score),
    h(
      'div',
      {},
      h('h3', {}, h('button', { onclick: () => openJob(job) }, job.title)),
      h(
        'div',
        { class: 'meta' },
        h('span', {}, `🏢 ${job.company}`),
        h('span', {}, `📍 ${job.remote ? 'Remote' : ''}${job.remote && job.location ? ' · ' : ''}${job.location || (job.remote ? '' : 'Location n/a')}`),
        job.salary ? h('span', {}, `💰 ${job.salary}`) : null,
        h('span', {}, `🗓 ${relTime(job.postedAt) || 'date n/a'}`),
        h('span', {}, `via ${sourceName(job.source)}`),
      ),
      h(
        'div',
        { class: 'chips' },
        h('span', { class: `verdict ${verdictClass(f)}` }, f.verdict),
        ...f.matchedSkills.slice(0, 6).map((s) => h('span', { class: 'chip hit' }, `✓ ${s}`)),
        ...f.missingSkills.slice(0, 3).map((s) => h('span', { class: 'chip miss' }, s)),
      ),
      job.integrityFlags?.length ? h('div', { class: 'warn' }, `⚠ Posting contains suspicious hidden text (${job.integrityFlags.length}) — review before applying`) : null,
    ),
    h(
      'div',
      { class: 'job-actions' },
      job.application
        ? h('button', { class: 'btn', onclick: () => { showTab('apps'); focusApp(job.application.id); } }, `✓ ${job.application.status}`)
        : h('button', { class: 'btn primary', onclick: (e) => applyTo(job, e.currentTarget) }, 'Apply'),
      h('button', { class: 'btn small', onclick: () => openJob(job) }, 'Details'),
    ),
  );
}

function filteredJobs() {
  const min = Number($('#minFilter').value);
  return state.jobs.filter((j) => (!$('#onlyEligible').checked || j.fit.eligible) && j.fit.score >= min && (!$('#hideApplied').checked || !j.application));
}

function renderJobs() {
  const list = $('#jobList');
  if (!state.jobs.length) {
    list.replaceChildren(
      h('div', { class: 'empty' }, h('h3', {}, 'No jobs yet'), h('p', {}, state.profile?.skills?.length ? 'Click “Search jobs” to pull live postings that match your profile.' : 'Fill in your profile first, then search.')),
    );
    return;
  }
  const jobs = filteredJobs();
  list.replaceChildren(
    h('p', { class: 'muted small' }, `${jobs.length} of ${state.jobs.length} jobs shown · sorted by fit`),
    ...(jobs.length ? jobs.map(jobCard) : [h('div', { class: 'empty' }, 'No jobs match the current filters.')]),
  );
}

['#onlyEligible', '#hideApplied'].forEach((s) => $(s).addEventListener('change', renderJobs));
$('#minFilter').addEventListener('input', (e) => { $('#minFilterVal').textContent = e.target.value; renderJobs(); });

function renderSources() {
  const chips = (state.status?.sources || []).map((s) =>
    h(
      'label',
      { class: s.enabled ? '' : 'off', title: s.enabled ? s.homepage : `Disabled${s.requires ? ` — needs ${s.requires}` : ''}` },
      h('input', { type: 'checkbox', value: s.key, checked: s.enabled, disabled: !s.enabled, 'data-source': '' }),
      s.name,
    ),
  );
  $('#sourceChips').replaceChildren(...chips);
}

async function loadJobs() {
  state.jobs = await api('/api/jobs');
  renderJobs();
}

$('#searchForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#searchBtn');
  const sources = [...document.querySelectorAll('[data-source]:checked')].map((c) => c.value);
  btn.disabled = true;
  btn.textContent = 'Searching…';
  $('#searchReport').textContent = 'Searching job boards…';
  try {
    const r = await api('/api/search', { method: 'POST', body: { query: $('#query').value, location: $('#searchLocation').value, sources } });
    const parts = Object.entries(r.report).map(([k, v]) => (v.ok ? `${sourceName(k)}: ${v.count}` : `${sourceName(k)}: failed (${v.error})`));
    $('#searchReport').textContent = `Searched “${r.query}” — ${parts.join(' · ')} — ${r.newCount} new`;
    await loadJobs();
    await refreshStatus();
  } catch (err) {
    $('#searchReport').textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Search jobs';
  }
});

function openJob(job) {
  const f = job.fit;
  const url = safeUrl(job.url);
  const body = $('#detailBody');
  body.replaceChildren(
    h('div', { class: 'app-head' },
      h('div', {}, h('h3', {}, job.title), h('div', { class: 'meta' }, h('span', {}, job.company), h('span', {}, job.remote ? `Remote · ${job.location}` : job.location), job.salary ? h('span', {}, job.salary) : null)),
      scoreRing(f.score),
    ),
    h('span', { class: `verdict ${verdictClass(f)}` }, f.verdict),
    h('div', { class: 'breakdown' },
      h('div', {}, h('b', {}, f.breakdown.skills.score), ' Skills', h('p', {}, f.breakdown.skills.note)),
      h('div', {}, h('b', {}, f.breakdown.experience.score), ' Experience', h('p', {}, f.breakdown.experience.note)),
      h('div', {}, h('b', {}, f.breakdown.role.score), ' Role fit', h('p', {}, f.breakdown.role.note)),
      h('div', {}, h('b', {}, f.location.status), ' Location', h('p', {}, f.location.note)),
    ),
    f.matchedSkills.length ? h('p', {}, h('b', {}, 'You have: '), h('span', { class: 'chips' }, ...f.matchedSkills.map((s) => h('span', { class: 'chip hit' }, s)))) : null,
    f.missingSkills.length ? h('p', {}, h('b', {}, 'Gaps: '), h('span', { class: 'chips' }, ...f.missingSkills.map((s) => h('span', { class: 'chip miss' }, s)))) : null,
    job.integrityFlags?.length ? h('div', { class: 'flagbox' }, h('b', {}, '⚠ Posting integrity check'), h('ul', {}, ...job.integrityFlags.map((x) => h('li', {}, x)))) : null,
    h('h4', {}, 'Job description'),
    h('div', { class: 'desc' }, job.description || 'No description provided.'),
    h('div', { class: 'dialog-actions' },
      h('button', { class: 'btn', onclick: () => $('#detailDialog').close() }, 'Close'),
      url ? h('a', { class: 'btn', href: url, target: '_blank', rel: 'noopener noreferrer' }, 'View original ↗') : null,
      job.application
        ? h('button', { class: 'btn primary', onclick: () => { $('#detailDialog').close(); showTab('apps'); focusApp(job.application.id); } }, 'Open application')
        : h('button', { class: 'btn primary', onclick: (e) => applyTo(job, e.currentTarget).then(() => $('#detailDialog').close()) }, 'Apply'),
    ),
  );
  $('#detailDialog').showModal();
}

async function applyTo(job, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Preparing…'; }
  try {
    const app = await api('/api/applications', { method: 'POST', body: { jobId: job.id } });
    toast(`Application prepared for ${job.company}${app.warning ? ' (template used)' : ''}`);
    await Promise.all([loadJobs(), loadApps()]);
    showTab('apps');
    focusApp(app.id);
  } catch (e) {
    toast(e.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Apply'; }
  }
}

$('#autoApplyBtn').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const min = state.profile?.minScore ?? 60;
  const n = state.jobs.filter((j) => !j.application && j.fit.eligible && j.fit.score >= min).length;
  if (!n) return toast(`No new eligible jobs scoring ${min}+. Lower the threshold in your profile or search again.`);
  if (!confirm(`Prepare tailored applications for the top ${Math.min(n, 10)} eligible job(s) scoring ${min}+?`)) return;
  btn.disabled = true;
  btn.textContent = 'Preparing…';
  try {
    const r = await api('/api/auto-apply', { method: 'POST', body: { minScore: min, limit: 10 } });
    toast(`${r.created.length} application(s) prepared — submit each from the Applications tab`);
    await Promise.all([loadJobs(), loadApps()]);
    showTab('apps');
  } catch (err) {
    toast(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '⚡ Auto-apply to top matches';
  }
});

$('#pasteJobBtn').addEventListener('click', () => { $('#pasteForm').reset(); $('#pasteDialog').showModal(); });
$('#pasteDialog').addEventListener('close', async () => {
  if ($('#pasteDialog').returnValue !== 'ok') return;
  const data = Object.fromEntries(new FormData($('#pasteForm')));
  data.remote = !!data.remote;
  try {
    const job = await api('/api/jobs/manual', { method: 'POST', body: data });
    await loadJobs();
    openJob(state.jobs.find((j) => j.id === job.id) || job);
  } catch (e) {
    toast(e.message);
  }
});

// ---------------- Applications ----------------

const STATUSES = ['prepared', 'applied', 'interview', 'offer', 'rejected', 'withdrawn'];

async function loadApps() {
  state.apps = await api('/api/applications');
  $('#appCount').textContent = state.apps.length;
  if (state.tab === 'apps') renderApps();
}

async function patchApp(id, body, msg) {
  try {
    const updated = await api(`/api/applications/${id}`, { method: 'PATCH', body });
    state.apps = state.apps.map((a) => (a.id === id ? updated : a));
    if (msg) toast(msg);
    renderApps();
    loadJobs();
  } catch (e) {
    toast(e.message);
  }
}

async function submitApp(app) {
  await copy(app.coverLetter, 'Cover letter copied — paste it into the application form');
  const url = safeUrl(app.job.applyUrl || app.job.url);
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
  else toast('No application link on this job — use the email draft or apply on the company site');
  setTimeout(() => {
    if (app.status === 'prepared' && confirm(`Did you submit the application to ${app.job.company}? Mark it as applied?`)) patchApp(app.id, { status: 'applied' }, 'Marked as applied');
  }, 800);
}

function mailtoFor(app) {
  const d = app.emailDraft;
  if (!d) return null;
  return `mailto:${encodeURIComponent(d.to)}?subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.body)}`;
}

function docBlock(title, text, field, app) {
  const pre = h('div', { class: 'doc', contenteditable: field ? 'plaintext-only' : null, spellcheck: 'true' }, text);
  return h('details', {},
    h('summary', {}, title),
    pre,
    h('div', { class: 'doc-tools' },
      h('button', { class: 'btn small', onclick: () => copy(pre.innerText) }, 'Copy'),
      field ? h('button', { class: 'btn small', onclick: () => patchApp(app.id, { [field]: pre.innerText }, 'Saved') }, 'Save edits') : null,
      h('button', { class: 'btn small', onclick: () => download(`${app.job.company}-${title}.txt`.replace(/[^\w.-]+/g, '_'), pre.innerText) }, 'Download .txt'),
    ),
  );
}

function download(name, text) {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/plain' })), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

function appCard(app) {
  const mail = mailtoFor(app);
  const notes = h('textarea', { rows: 2, placeholder: 'Notes (recruiter name, interview date…)' }, app.notes || '');
  notes.value = app.notes || '';
  return h('article', { class: 'app', id: `app-${app.id}` },
    h('div', { class: 'app-head' },
      h('div', {},
        h('h3', {}, `${app.job.title} — ${app.job.company}`),
        h('div', { class: 'meta' },
          h('span', {}, `Fit ${app.fit.score}/100 · ${app.fit.verdict}`),
          h('span', {}, app.job.remote ? `Remote · ${app.job.location}` : app.job.location),
          h('span', {}, `Prepared ${relTime(app.createdAt)}`),
          app.appliedAt ? h('span', {}, `Applied ${relTime(app.appliedAt)}`) : null,
          h('span', {}, app.generator === 'claude' ? 'Written by Claude' : 'Template letter'),
        ),
        app.warning ? h('div', { class: 'warn' }, app.warning) : null,
      ),
      h('div', { class: 'btns' },
        h('select', { class: 'status', 'aria-label': 'Status', onchange: (e) => patchApp(app.id, { status: e.target.value }, `Status: ${e.target.value}`) },
          ...STATUSES.map((s) => h('option', { value: s, selected: s === app.status }, s[0].toUpperCase() + s.slice(1)))),
        h('button', { class: 'btn primary', onclick: () => submitApp(app) }, 'Submit ↗'),
        mail ? h('a', { class: 'btn', href: mail, onclick: () => setTimeout(() => app.status === 'prepared' && patchApp(app.id, { status: 'applied' }, 'Marked as applied'), 500) }, '✉ Email') : null,
        h('button', { class: 'btn small', title: 'Delete', onclick: async () => {
          if (!confirm('Delete this application?')) return;
          await api(`/api/applications/${app.id}`, { method: 'DELETE' });
          await Promise.all([loadApps(), loadJobs()]);
          renderApps();
        } }, '🗑'),
      ),
    ),
    docBlock('Cover letter', app.coverLetter, 'coverLetter', app),
    docBlock('Tailored CV', app.cvSummary, null, app),
    docBlock('“Why this role?” answer', app.pitch, 'pitch', app),
    h('details', {}, h('summary', {}, 'Notes'), notes, h('div', { class: 'doc-tools' }, h('button', { class: 'btn small', onclick: () => patchApp(app.id, { notes: notes.value }, 'Notes saved') }, 'Save notes'))),
  );
}

function renderApps() {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const a of state.apps) counts[a.status] = (counts[a.status] || 0) + 1;
  $('#appStats').replaceChildren(
    h('div', { class: 'stat' }, h('b', {}, state.apps.length), h('span', {}, 'total')),
    ...STATUSES.filter((s) => s !== 'withdrawn' || counts[s]).map((s) => h('div', { class: 'stat' }, h('b', {}, counts[s]), h('span', {}, s))),
  );
  $('#appList').replaceChildren(
    ...(state.apps.length
      ? state.apps.map(appCard)
      : [h('div', { class: 'empty' }, h('h3', {}, 'No applications yet'), h('p', {}, 'Click “Apply” on a job, or use “Auto-apply to top matches”.'))]),
  );
}

function focusApp(id) {
  requestAnimationFrame(() => {
    const el = document.getElementById(`app-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const d = el.querySelector('details');
    if (d) d.open = true;
  });
}

// ---------------- Boot ----------------

async function refreshStatus() {
  state.status = await api('/api/status');
  const on = state.status.sources.filter((s) => s.enabled).map((s) => s.name);
  $('#statusLine').textContent = `${on.length} job source${on.length === 1 ? '' : 's'} · cover letters by ${state.status.claude ? 'Claude' : 'template'} · ${state.status.counts.jobs} jobs saved`;
  renderSources();
}

(async function boot() {
  try {
    await refreshStatus();
    state.profile = await api('/api/profile');
    fillProfile(state.profile);
    await Promise.all([loadJobs(), loadApps()]);
    let tab = state.profile.name && state.profile.skills.length ? 'jobs' : 'profile';
    try { tab = localStorage.getItem('jp.tab') || tab; } catch {}
    if (!state.profile.name) tab = 'profile';
    showTab(tab);
  } catch (e) {
    $('#statusLine').textContent = `Could not reach the server: ${e.message}`;
  }
})();
