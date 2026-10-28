# Job Search Portal

A personal job search portal that runs on your own computer. You enter your skills and the programming languages you know, and it:

1. **Searches** several live job boards for matching postings.
2. **Scores** each job against your profile (skills, experience, role, location) and sorts by fit.
3. **Applies**: for each job you pick, or every top match at once with **⚡ Auto-apply**, it writes a tailored cover letter, a CV with your skills reordered for that job, and a "Why this role?" answer.
4. **Tracks** every application (prepared → applied → interview → offer / rejected), with CSV export.

The workflow is based on [ai-job-search](https://github.com/ai-job-search-dev/ai-job-search) (`/setup` → `/scrape` → `/rank` → `/apply` → `/outcome`), rebuilt as a browser app that doesn't need the Claude Code CLI.

## Quick start

You need Node.js 18 or newer. There is nothing to install with npm: the portal has no dependencies.

```bash
cd job-portal
```

```bash
npm start
```

Open **http://localhost:4321**, then:

1. **Profile**: add your name, programming languages (with level), skills, target job titles, locations, and a few achievements. Click **Save profile**.
2. **Find jobs**: click **Search jobs**. Leave Keywords empty to search for your first target role.
3. Click **Apply** on a job, or **⚡ Auto-apply to top matches** to prepare applications for every eligible job at or above your threshold (60 by default, change it on your Profile).
4. **Applications**: click **Submit ↗**. This copies your cover letter and opens the employer's application page. If the posting lists an email address, **✉ Email** opens a ready-to-send email draft instead. Once you've submitted, mark the application as applied.

To try it with no internet access, run it with sample jobs:

```bash
npm run demo
```

### Why the last click is yours

The portal prepares everything, but you click the final Submit on the employer's site. That's deliberate:

- Every employer uses a different form (Workday, Greenhouse, Lever, Naukri, …), often behind a login and a CAPTCHA.
- LinkedIn, Naukri and Indeed don't allow automated applications in their terms, and accounts that use bots get banned.
- An application sent without you seeing it can go to a scam posting, or include a claim you wouldn't make.

## Job sources

| Source | Coverage | Setup |
|---|---|---|
| Remotive | Remote tech jobs, worldwide | none |
| Remote OK | Remote jobs, worldwide | none |
| Arbeitnow | Europe, many remote roles | none |
| Jobicy | Remote jobs | none |
| **Adzuna** | **On-site and remote jobs in India**, UK, US, EU and more | free API key |
| Paste a job | Anything else: Naukri, LinkedIn, company career pages | none, click **+ Paste a job** |

**For jobs in India, turn on Adzuna.** Get a free key at https://developer.adzuna.com, then:

```bash
ADZUNA_APP_ID=xxxx ADZUNA_APP_KEY=yyyy ADZUNA_COUNTRY=in npm start
```

## Better cover letters with Claude (optional)

Without any setup, cover letters come from a built-in template that uses only facts from your profile. For letters written for each posting, give the portal an Anthropic API key:

```bash
ANTHROPIC_API_KEY=sk-ant-... npm start
```

The default model is `claude-opus-5-5`. To use a different one, set `CLAUDE_MODEL`. Claude is told to use only facts from your profile, never to claim skills you lack, and to ignore any instructions written inside the job posting. If the API call fails, the portal falls back to the template.

## How the fit score works

The score uses the weights from ai-job-search's evaluation framework. The behavioural dimension is left out because it needs an interview-built profile.

| Dimension | Weight | How it's measured |
|---|---|---|
| Skills | 40% | Skills and languages found in the posting that you have. A skill named in the job title counts 3×. |
| Role | 35% | How closely the job title matches your target titles |
| Experience | 25% | Your years vs. "X+ years" in the posting, or the seniority in the title |
| Location | pass / fail | Remote vs. your work mode and preferred locations. Region-restricted remote jobs get a flag. |

Verdicts: **Strong Fit** 75+, **Good Fit** 60–74, **Moderate** 45–59, **Weak** 30–44, **Poor** below 30. If a job's title or company contains one of your exclude keywords, it is never auto-applied.

## Safety

- **Postings are treated as untrusted.** Each one is converted to plain text, and hidden HTML and invisible Unicode characters are removed. Lines that look like instructions to an AI ("ignore previous instructions…") are flagged with a ⚠ on the job card. Posting text is never rendered as HTML.
- **Your data stays local.** Your profile, jobs and applications are stored in `job-portal/data/`, which is git-ignored. The server listens on `127.0.0.1` only and refuses cross-origin and non-localhost requests.
- `job-portal/.htaccess` blocks Apache from serving this folder, in case the repo is deployed to a PHP host.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4321` | HTTP port |
| `HOST` | `127.0.0.1` | Interface to listen on |
| `DATA_DIR` | `./data` | Where profile, jobs and applications are stored |
| `JOB_SOURCES` | all | Comma list to limit sources, e.g. `remotive,adzuna`. `demo` runs offline sample data. |
| `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` / `ADZUNA_COUNTRY` | — / — / `in` | Enable Adzuna |
| `ANTHROPIC_API_KEY` / `CLAUDE_MODEL` | — / `claude-opus-5-5` | Claude-written cover letters |

## Development

```bash
npm test
```

| Path | What it holds |
|---|---|
| `server.js` | HTTP server and JSON API |
| `lib/sources.js` | Job board adapters, normalisation, de-duplication |
| `lib/skills.js` | Skill dictionary and extraction (handles C++, C#, .NET, Node.js, Go) |
| `lib/scoring.js` | Fit scoring |
| `lib/generate.js` | Cover letter, CV and pitch generation (template or Claude) |
| `lib/text.js` | HTML-to-text and posting integrity checks |
| `public/` | The single-page UI, in plain JavaScript |

To add a job board, add an entry to `SOURCES` in `lib/sources.js` that returns raw jobs with `title`, `company`, `location`, `remote`, `url` and `description`.
