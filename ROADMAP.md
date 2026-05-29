# UniScrape - Development Roadmap

This document is the single source of truth for where UniScrape is, where it is going, and exactly how to get there. Every stage includes a detailed prompt that a future instance of Claude can read and use to write the code for that stage without needing any additional context. Do not skip stages. Each one is a dependency for the next.

When returning to development after any break, paste this full ROADMAP.md into the conversation first so complete context is available before any coding begins.

---

## Project Overview and Vision

UniScrape is a university program information extraction tool designed primarily for QS-style university profiling workflows. The purpose of the system is to automate the collection and structuring of university program data from institutional websites, particularly for international student audiences.

The long-term vision is NOT to build a generic web scraper.

The long-term vision is to build a reusable university information acquisition and institutional intelligence system that builds reusable institutional profiles, remembers previously crawled universities, updates data incrementally, reduces repeated extraction costs, separates institution-level and program-level knowledge, and supports multiple team members working simultaneously.

However the current priority is not enterprise scaling or SaaS infrastructure. The current priority is improving acquisition quality, reducing LLM dependency, and building a clean extraction architecture.

---

## Core Architectural Philosophy

The current architecture overuses the LLM. Right now Claude handles layout interpretation, relevance filtering, extraction, normalisation, semantic reasoning, deduplication, and structure understanding all in one pass. This is expensive and not scalable.

The architectural direction moving forward is:

> Deterministic systems should handle structure. AI should handle ambiguity.

The future pipeline should be:

```
Website
- acquisition layer (controlled crawler)
- preprocessing layer (HTML to markdown)
- deterministic extraction layer (regex, heuristics)
- AI semantic reasoning layer (Claude for ambiguity only)
- structured institutional intelligence output
```

NOT:

```
Website - giant HTML blob - Claude does everything
```

### What should be deterministic (no LLM needed)
- Crawling and link discovery
- Markdown conversion
- URL relevance scoring
- Page categorisation
- IELTS, TOEFL, PTE, GPA, SAT, ACT score extraction (regex)
- Currency detection
- Tuition amount extraction
- Intake month recognition
- Duration parsing
- Deduplication

### What should remain AI-handled
- Ambiguous admissions wording
- Semantic interpretation of program descriptions
- Nuanced scholarship language
- Edge cases and non-standard structures
- Cross-page reasoning and context merging
- Final structured field normalisation

---

## Context and Purpose

UniScrape is built to support QS-style university program data collection. The primary use case is profiling university programs for an international student audience. The most important data points are those relevant to international applicants: international tuition fees, entry requirements for international students, English language test scores, intake dates, scholarship and financial aid availability, and direct links to official program pages.

The tool must be efficient with API calls because cost scales directly with usage. Every architectural decision should treat cost per university as a real constraint.

**Infrastructure:**
- Cloudflare Worker proxy URL: https://uniscrape-proxy.itsvineth05.workers.dev
- Primary API: Anthropic (claude-sonnet-4-5)
- Fallback API: Google Gemini (gemini-1.5-pro-latest) - currently blocked in Sri Lanka
- Hosting: GitHub Pages (fully static, no backend until Stage 5b)

**Team usage:** Multiple team members can use the tool simultaneously with no conflict since each session runs independently in the user's browser. A shared Anthropic API key can be distributed to the team. No concurrent use issues exist at the current architecture level.

---

## Version History

### v1.0
- Basic single-page extraction
- Public CORS proxies (unreliable)
- Anthropic API only

### v2.0
- Cloudflare Worker proxy replacing public proxies
- Gemini API added as fallback
- Dual API selector with per-provider key storage in localStorage
- Expanded fields: start_date, duration, tuition_fee, currency, scholarship, rec_letter, entry_requirements
- Modal detail view
- CSV export

### v2.1
- API hint text cleaned up
- Version displayed in footer

### v2.2
- Extraction prompt fully rewritten with 35 structured fields
- Fees split by student type: fee_international, fee_domestic, fee_eu, fee_state, fee_out_of_state, fee_per
- Entry requirements expanded with IELTS, TOEFL, GRE, GMAT, work experience
- Application requirements: rec_letter, personal_statement, portfolio, interview
- Added: faculty, intake_dates, application_deadline, language_of_instruction, accreditation, scholarship_details
- Modal reorganised into sections
- Level normalisation: PgDip and PgCert moved into Master's

### v2.3
- Cloudflare Worker URL hardcoded
- New field: description (formatted HTML, marketing excluded)
- New field: location (campus city or name)
- Mode detection improved (distance learning = Online, physical classes = On-campus)
- Entry requirements expanded: entry_alevel, entry_ib, entry_sat, entry_act, entry_pte, entry_duolingo, entry_cambridge
- Application requirements now check full page including general admissions sections
- New field: financial_aid with sentinel/replacement pattern using standard statement
- CSV filename includes version number

### v2.3.1 (current)
- MAX_HTML_CHARS reduced from 120,000 to 80,000 (cost reduction ~20-40%)
- cleanHtml() expanded to strip nav, header, footer, aside, cookie banners, social widgets, SVG elements
- Two changes together reduce noise sent to API and lower cost per call

---

## Current State (v2.3.1)

### Current limitations
- Reads only one URL at a time, cannot follow links
- All data completeness depends on what is visible on that one listing page
- No persistence between sessions
- Raw HTML still sent to API despite cleaning (should be markdown)
- Claude handles too many tasks that could be deterministic
- No multi-model strategy (cheap model for simple tasks, Claude for reasoning)
- No institution-level vs program-level knowledge separation

### All fields currently extracted

PROGRAM IDENTIFICATION: name, url, level, department, faculty, location, mode, duration, language_of_instruction

DESCRIPTION: description (HTML-formatted, marketing excluded)

INTAKE AND DATES: intake_dates, application_deadline

FEES: fee_international, fee_domestic, fee_eu, fee_state, fee_out_of_state, fee_per, currency

FINANCIAL AID: financial_aid, scholarship, scholarship_details, accreditation

ENTRY REQUIREMENTS: entry_requirements_general, entry_requirements_international, entry_alevel, entry_ib, entry_gpa, entry_sat, entry_act, entry_ielts, entry_toefl, entry_pte, entry_duolingo, entry_cambridge, entry_other_english, entry_gre, entry_gmat, entry_work_experience

APPLICATION REQUIREMENTS: rec_letter, personal_statement, portfolio, interview

CLASSIFICATION (auto-filled): narrow_subject, broad_subject

### Main table columns
name, level, department, broad_subject, mode, location, intake_dates, fee_international, entry_ielts, scholarship, Details button, Link

---

## Cost Reference

### Per API call estimates (claude-sonnet-4-5, current pricing)
- Small page under 5,000 words: $0.01 - $0.02
- Medium page 5,000 to 15,000 words: $0.02 - $0.06
- Large page over 15,000 words: $0.06 - $0.15
- Note: v2.3.1 prompt is long due to field definitions. HTML to markdown conversion (Stage 2) is expected to cut these costs by 40-60%

### Per university estimates by stage

| Stage | Programs | Page visits | Estimated cost |
|---|---|---|---|
| v2.3.1 current (single page) | any | 1 | $0.02 - $0.08 |
| Stage 2 (two-level, 50 programs) | 50 | 51 | $0.50 - $2.00 |
| Stage 2 (two-level, 100 programs) | 100 | 101 | $1.00 - $4.00 |
| Stage 2 with markdown (50 programs) | 50 | 51 | $0.25 - $1.00 |
| Stage 3 (deterministic crawl, 100 programs) | 100 | 110-120 | $0.80 - $3.00 |

### Test run estimate for 7 test universities (Stage 2 with markdown)
Assuming average 60 programs per university, markdown preprocessing active:
- Conservative: 7 x $0.80 = $5.60
- Realistic: 7 x $1.50 = $10.50
- Worst case: 7 x $3.00 = $21.00

Recommendation: cap at 20-25 programs per university for initial testing to keep total under $10.

---

## Stage 1 - Foundation Stabilisation and Preprocessing Upgrade
### Goal: fix the two most impactful architectural problems before building anything new

This stage has two parts. The first is validating the existing tool. The second is implementing the HTML to markdown conversion which is the single highest ROI improvement available and should happen before Stage 2 crawling is built.

### Part A - Validation

**1.1 - Build the test library**
The file TEST_URLS.md contains seven universities selected for validation. Run the current v2.3.1 tool against each one and document: programs found, fields filled, fields empty, any errors, page structure type.

**1.2 - Document failure modes**
Categorise failures as: JavaScript-rendered page (Browserless not firing), single-page limitation (data on deeper pages), wrong level classification, missing URLs, truncation issues.

**1.3 - Small UI fixes**
- Retry button after any error
- More specific status messages showing character count being sent
- Visible notice when page was truncated

### Part B - HTML to Markdown Preprocessing (implement immediately)

This is the most impactful single change possible. Stop sending raw HTML to Claude. Convert it to clean semantic markdown first.

**Why this matters:**
- Raw HTML is extremely token-inefficient even after cleaning
- Claude performs significantly better on structured markdown than div soup
- Expected token reduction: 40-60% per call
- Expected accuracy improvement on extraction of structured fields

**Implementation approach (browser-compatible, no npm required):**

The cleanHtml function in app.js should be extended to convert HTML to markdown after DOM cleanup. Since the tool runs in the browser with no build step, use CDN-loaded libraries or implement a lightweight conversion directly.

Recommended approach:
1. Load Turndown from CDN (https://cdnjs.cloudflare.com/ajax/libs/turndown/7.1.2/turndown.min.js) in index.html
2. After existing HTML cleanup, extract the main content region (look for main, article, [role="main"], .main-content, #content, #main in that priority order - fall back to body if none found)
3. Convert extracted content to markdown using Turndown
4. Send markdown to API instead of HTML

The extraction prompt should also be updated to reflect that it is receiving markdown not HTML.

**Expected outcome:** 40-60% token reduction, improved extraction consistency, lower cost per call.

### Future prompt for Stage 1 fixes and markdown implementation
"I am working on UniScrape v2.3.1, a university program extraction tool. It is a fully static GitHub Pages site using plain HTML, CSS, and JavaScript with no build step and no npm. It uses a Cloudflare Worker at https://uniscrape-proxy.itsvineth05.workers.dev as a CORS proxy and supports the Anthropic API (claude-sonnet-4-5) and Google Gemini (gemini-1.5-pro-latest).

I want to make the following changes to app.js and index.html:

1. Add Turndown from CDN to index.html for HTML to markdown conversion
2. Update the cleanHtml() function to: extract the main content region by looking for main, article, [role=main], .main-content, #content, #main elements in priority order, fall back to body if none found, run existing cleanup (nav, footer, header, aside, script, style, svg removal), convert the result to markdown using Turndown, return markdown string instead of HTML string
3. Update the MAX_HTML_CHARS constant to apply to the markdown output not raw HTML (80,000 chars is appropriate for markdown)
4. Update the extraction prompt to state it is receiving cleaned markdown not raw HTML
5. Add a retry button that appears after any error without requiring the user to re-paste the URL
6. Make status messages more specific - show approximate character count being sent to the API

Here is the current app.js: [paste full app.js]
Here is the current index.html: [paste full index.html]"

---

## Stage 2 - Two-Level Crawling with Institution Context
### Goal: automatically visit each individual program page AND fetch institution-level context pages in one run

This is the most impactful capability upgrade. It has two components that work together.

### Component A - Two-level program crawling

Level 1 reads the listing page and collects program names and URLs only (cheap pass). Level 2 visits each individual program URL and runs full extraction. This alone transforms the tool because all the real data - fees, entry requirements, intakes, scholarships, descriptions - lives on individual program pages not listing pages.

### Component B - Institution-level context (new, based on architectural review)

Many critical fields are not on individual program pages. IELTS requirements, scholarship policies, international admissions info, and fee schedules are almost always on shared central pages that apply to all programs. The system should:

1. During or after the listing page fetch, extract all internal links
2. Score those links deterministically using keyword lists (see Stage 3 for full scoring logic)
3. Fetch the top 3-5 highest-scoring non-program pages (fees page, admissions page, scholarships page, international students page)
4. Extract institution-level fields from these pages once
5. Use these as fallback values for any program where that field was not found on the individual program page

This means if the university's central IELTS page says "6.5 overall for all programs", every program record gets that value in entry_ielts without needing to fetch it from each of 200 individual program pages.

### Key technical challenges

**Rate limiting** - configurable delay between requests, default 1500ms, adjustable 500ms to 5000ms.

**Cost control** - show estimated cost before crawl starts based on program count. Default cap of 25 programs for testing. Live spend tracker during crawl. Hard stop option.

**Progress visibility** - live counter showing program X of Y, progress bar, estimated time remaining.

**Per-program error handling** - log failures, skip, continue. Never stop the whole job for one error.

**Relative URL resolution** - resolve all relative URLs against the base domain before fetching.

**Markdown preprocessing** - both Level 1 and Level 2 pages should go through the markdown pipeline from Stage 1 before being sent to the API.

### Institution vs program knowledge split

Institution-level fields (fetch once, inherit across all programs if not found on program page):
- entry_ielts, entry_toefl, entry_pte, entry_duolingo, entry_cambridge, entry_other_english
- scholarship, scholarship_details, financial_aid
- entry_requirements_international (general university policy)
- fee_international, fee_domestic, fee_eu (if on a central fees page)
- currency

Program-level fields (fetch per program, always override institution-level if found):
- name, url, level, department, faculty, location, mode, duration, language_of_instruction
- description, intake_dates, application_deadline
- entry_requirements_general, entry_requirements_international (program-specific)
- entry_alevel, entry_ib, entry_gpa, entry_sat, entry_act, entry_gre, entry_gmat, entry_work_experience
- rec_letter, personal_statement, portfolio, interview
- accreditation

### New UI elements needed
- Pre-crawl settings: max programs cap (default 25), delay between requests
- Institution pages panel: shows which context pages were found and fetched
- Estimated cost display before crawl starts
- Confirmation step before proceeding
- Live progress counter and estimated time remaining
- Collapsible error log
- Pause button

### Future prompt for Stage 2
"UniScrape has HTML to markdown preprocessing working (Stage 1 complete). I want to upgrade it to two-level crawling with institution-level context. The tool is a fully static GitHub Pages site. Cloudflare Worker at https://uniscrape-proxy.itsvineth05.workers.dev handles all fetching.

The crawl should work as follows:

LEVEL 1 - fetch the listing page URL. Convert to markdown using the existing pipeline. Send to API with a lightweight prompt: extract only program names and their direct URLs. This should be cheap - under $0.02.

INSTITUTION CONTEXT - after Level 1, extract all internal links from the listing page. Score them using this keyword system:
HIGH VALUE (+2 each): tuition, fees, cost, admissions, entry, requirements, international, scholarships, funding, english, ielts, toefl, curriculum, modules, structure
LOW VALUE (-2 each): news, events, staff, research, library, careers, alumni, contact, login, jobs
Score both the URL path and the anchor text. Fetch the top 3-5 links scoring above +2. Convert each to markdown. Send each to the API with a prompt asking it to extract only institution-level fields: entry_ielts, entry_toefl, entry_pte, entry_cambridge, entry_other_english, scholarship, scholarship_details, financial_aid, fee_international, fee_domestic, fee_eu, currency, entry_requirements_international. Store as institution defaults.

LEVEL 2 - for each program URL from Level 1, fetch via Worker with configurable delay (default 1500ms). Convert to markdown. Send to API with the full extraction prompt (paste current buildPrompt() contents). For any field that returns empty string, check institution defaults and inherit the value. Mark inherited fields visually in the modal.

Cost control: show program count and estimated cost before starting. Default cap 25 programs. Live spend tracker. Hard stop option.
Progress: live counter program X of Y, progress bar, time remaining estimate.
Error handling: log failures per program, continue, show error log after completion.
Pause button: halt crawl and keep results so far.

All existing features - subject mapping, financial_aid sentinel replacement, filters, modal sections, CSV export - must continue working.

Here is the current app.js: [paste]
Here is the current index.html: [paste]
Here is the current styles.css: [paste]"

---

## Stage 3 - Deterministic Discovery Engine
### Goal: replace AI-guided navigation with a fast, cheap, deterministic link scoring system

This is the stage that replaces the AI navigation approach originally planned. Based on architectural review from multiple sources, the conclusion is clear: you do NOT need AI to decide which pages to crawl. Universities are predictable. A keyword scoring system correctly identifies the right pages on 90% of university websites without spending a single token.

### Why deterministic beats AI for navigation

If the LLM handles navigation: token cost skyrockets, consistency is unpredictable, debugging is nearly impossible, and every navigation decision costs money. If a deterministic system handles navigation: it is instant, free, explainable, and consistent. The LLM should only ever see curated semantically relevant content, never raw site structure.

### How the discovery engine works

1. User provides any URL on the university site (homepage, about page, study page, anywhere)
2. System fetches the page and extracts all internal anchor links
3. Each link is scored deterministically based on URL path and anchor text
4. Links scoring above a threshold are queued for fetching
5. System fetches queued pages and checks each one: does it contain a program listing?
6. If yes, hand off to Stage 2 two-level extractor
7. If no, extract its internal links and score those too (up to max depth)
8. Continue until a listing page is found or max depth is reached

### Scoring system

```
HIGH VALUE keywords (+2 each applied to URL and anchor text):
courses, programmes, programs, study, academics, undergraduate, postgraduate,
masters, bachelor, phd, doctorate, degrees, faculties, schools, departments,
tuition, fees, admissions, entry, requirements, international, scholarships,
ielts, toefl, curriculum, modules, structure, apply, enrol

LOW VALUE keywords (-2 each):
news, events, staff, research, library, careers, alumni, contact, login,
jobs, about, history, governance, press, media, social, instagram, twitter,
facebook, linkedin, youtube, cookie, privacy, accessibility, sitemap
```

### Crawl constraints
- Maximum depth: 4 hops from starting URL (user-adjustable 1-6)
- Maximum pages visited during discovery: 20 (user-adjustable)
- Domain lock: never follow links off the starting domain
- Visited URL tracking: never revisit a URL in the same session
- Minimum score threshold: links scoring below 0 are never followed

### Page type classification (deterministic)

Once a page is fetched, classify it before deciding what to do with it:

- PROGRAM_LISTING: contains multiple links that look like individual program pages
- TUITION_PAGE: URL or heading contains fee/tuition/cost keywords
- ADMISSIONS_PAGE: URL or heading contains admissions/entry/requirements keywords
- SCHOLARSHIP_PAGE: URL or heading contains scholarship/funding/bursary keywords
- INTERNATIONAL_PAGE: URL or heading contains international/overseas keywords
- NAVIGATION_PAGE: mostly links, few content blocks (keep following)
- IRRELEVANT: low keyword density, skip

Classification should be done with regex and keyword matching, not LLM calls.

### UI additions
- Starting URL input (any page on the university site)
- Max depth and max pages controls
- Live breadcrumb trail showing navigation path
- Link score display at each step
- Manual override: user can paste a URL to jump ahead at any point
- Fallback: if discovery fails, show user the last page visited and let them manually select a link

### Future prompt for Stage 3
"UniScrape has two-level crawling with institution context working (Stage 2 complete). I want to add a deterministic discovery engine so the user can paste any URL on a university site and the tool finds the program listing page automatically without using the AI for navigation.

The discovery engine should:

1. Fetch the starting URL via Cloudflare Worker at https://uniscrape-proxy.itsvineth05.workers.dev
2. Extract all anchor tags and their href and text content
3. Normalise all relative URLs to absolute using the starting domain
4. Score each link using this system (apply to both URL path and anchor text):
   HIGH VALUE (+2 each): courses, programmes, programs, study, academics, undergraduate, postgraduate, masters, bachelor, phd, degrees, faculties, schools, departments, tuition, fees, admissions, entry, requirements, international, scholarships, ielts, toefl, curriculum, modules, apply
   LOW VALUE (-2 each): news, events, staff, research, library, careers, alumni, contact, login, jobs, about, history, press, social, instagram, twitter, facebook, cookie, privacy, sitemap
5. Filter to links scoring above 0, sort by score descending
6. Fetch the top scoring link
7. Classify the fetched page as one of: PROGRAM_LISTING, TUITION_PAGE, ADMISSIONS_PAGE, SCHOLARSHIP_PAGE, INTERNATIONAL_PAGE, NAVIGATION_PAGE, IRRELEVANT - using only regex and keyword matching, no LLM
8. If PROGRAM_LISTING: hand off to Stage 2 two-level extractor
9. If not: extract links from this page, score them, follow the highest unvisited link
10. Enforce: max depth 4 (user-adjustable), max pages 20, domain lock, no revisits

Show a live breadcrumb trail with score at each hop. Show the user which link was chosen and why. If discovery fails within limits, show the last page and let the user manually select a link or paste a URL.

This should use zero LLM calls. All classification and navigation is deterministic.

Here is the current codebase: [paste all files]"

---

## Stage 4 - Model Abstraction and Multi-Model Strategy
### Goal: decouple extraction logic from any single API provider and use cheap models for simple tasks

This stage introduces a provider abstraction layer and a two-tier model strategy that significantly reduces cost.

### Why this matters

Currently the code is tightly coupled to Anthropic with a Gemini fallback. As new models emerge (DeepSeek, GPT-4o-mini, Qwen, local models) the architecture should support them without rewriting extraction logic. More importantly, not all tasks require Claude Sonnet. Page categorisation, relevance scoring assistance, and lightweight summarisation can be handled by much cheaper models.

### Provider abstraction layer

Replace direct API calls with a unified function:

```javascript
extractWithModel({
  provider,   // "anthropic" / "gemini" / "openrouter"
  model,      // model string
  prompt,     // system prompt
  content,    // user content (markdown)
  maxTokens
})
```

This function handles the different API shapes of each provider internally. All extraction logic calls this function rather than provider-specific functions.

### Two-tier model strategy

CHEAP TIER (for tasks that do not require reasoning):
- Page categorisation
- Relevance score confirmation
- Lightweight institution context extraction
- Deduplication checks
Recommended models: Gemini Flash, DeepSeek, GPT-4o-mini

REASONING TIER (for tasks that require interpretation):
- Full program detail extraction
- Ambiguous entry requirement parsing
- Description cleaning
- Cross-page context merging
Recommended model: Claude Sonnet

### Deterministic extraction layer (implement alongside model abstraction)

Move simple numeric and pattern-based fields OUT of the LLM entirely:

Fields suitable for regex extraction:
- entry_ielts: match patterns like "IELTS [0-9.]+" or "band score of [0-9.]+"
- entry_toefl: match "TOEFL [0-9]+" or "iBT [0-9]+"
- entry_pte: match "PTE [0-9]+" or "Pearson [0-9]+"
- currency: detect from symbols (£ GBP, $ USD, € EUR, RM MYR, S$ SGD, A$ AUD)
- duration: match "[0-9]+ year[s]?" or "[0-9]+ month[s]?"
- intake_dates: match month names near enrollment/start/intake keywords

These regex extractors run first. Only fields that regex fails on get sent to the LLM.

### Future prompt for Stage 4
"UniScrape has deterministic discovery and two-level crawling working. I want to add a provider abstraction layer and a deterministic pre-extraction step.

1. Create a unified extractWithModel(config) function that accepts provider (anthropic, gemini, openrouter), model string, system prompt, user content, and maxTokens. Handle the different API request/response shapes internally. Replace all existing direct API calls with this function.

2. Add an OpenRouter option to the provider dropdown in the UI. OpenRouter allows access to DeepSeek, GPT-4o-mini, and many other cheap models with one API key.

3. Implement a deterministic pre-extraction pass that runs BEFORE sending content to any LLM. Use regex to extract these fields from the markdown content if possible:
   - entry_ielts: patterns like IELTS followed by a number
   - entry_toefl: TOEFL followed by a number
   - entry_pte: PTE Academic followed by a number
   - currency: detect from £ $ € RM S$ A$ symbols
   - duration: X years or X months patterns
   Only fields that regex cannot fill get passed to the LLM prompt.

4. Add a model tier selector in settings: Standard (uses selected model for everything) vs Efficient (uses a cheap model for page categorisation and institution context, reserves selected model for full program extraction).

Here is the current codebase: [paste all files]"

---

## Stage 5 - Local Persistence and Session Management
### Goal: save results between sessions and build a running dataset over time

Right now every tab close loses all work. IndexedDB fixes this with zero infrastructure cost.

### What it adds
- Results saved to browser IndexedDB
- Each university gets a record with name, domain, crawl date, program count, all programs
- Dashboard home screen showing all saved universities
- Update (re-crawl), merge, and delete per record
- Content hashing: if a page has not changed since last crawl, skip re-extraction
- Global CSV export combining all saved universities

### Content hashing for cost reduction
Store SHA-256 hash of each page's markdown content alongside the extraction result. On re-crawl, if the hash matches the stored value, skip the API call and return the cached result. Universities update their websites infrequently. This could eliminate 70-80% of API calls on repeat runs.

### Future prompt for Stage 5
"UniScrape has multi-model extraction, deterministic discovery, and two-level crawling working. I want to add local persistence using browser IndexedDB.

Database structure:
- universities: id, name, domain, source_url, program_count, date_crawled, updated_at
- programs: id, university_id, content_hash, and all v2.3.1 fields (full list: name, url, level, department, faculty, location, mode, duration, language_of_instruction, description, intake_dates, application_deadline, fee_international, fee_domestic, fee_eu, fee_state, fee_out_of_state, fee_per, currency, financial_aid, scholarship, scholarship_details, accreditation, entry_requirements_general, entry_requirements_international, entry_alevel, entry_ib, entry_gpa, entry_sat, entry_act, entry_ielts, entry_toefl, entry_pte, entry_duolingo, entry_cambridge, entry_other_english, entry_gre, entry_gmat, entry_work_experience, rec_letter, personal_statement, portfolio, interview, narrow_subject, broad_subject)
- page_cache: url, content_hash, markdown_content, last_fetched

Content hashing: before fetching any page, check page_cache. If URL exists and hash matches current content, return cached markdown. Skip API call.

UI additions:
- Dashboard as default home screen: table of saved universities with name, program count, date crawled, actions
- Actions: View programs, Update (re-crawl), Delete, Export CSV
- Dashboard search bar
- New Extraction button
- After successful extraction: prompt to save with university name input
- Duplicate detection: warn if domain already exists in database
- Global Export All button combining all universities into one CSV with university_name as first column

Here is the current codebase: [paste all files]"

---

## Stage 5b - Multi-User Shared Workspace
### Goal: transform UniScrape from a personal tool into a shared team tool

This stage requires moving from GitHub Pages to a hosted backend. It is the most significant architectural change in the roadmap but does not require rewriting the frontend substantially.

### When to build this
Build Stage 5b when the team workflow genuinely requires shared data - meaning team members need to see each other's extractions in real time, or a central dataset needs to be maintained across multiple people. For the current workflow where each person exports a CSV and shares it separately, Stage 5 local persistence is sufficient.

### Important: concurrent use is already solved
Multiple people can open and use UniScrape simultaneously right now with zero conflict. Each browser session is fully independent. The gap Stage 5b solves is shared data visibility, not concurrent usage.

### What it adds
- Shared PostgreSQL database all team members read from and write to
- Simple account system with email and password login
- Any extraction one person runs is immediately visible to the whole team
- Each record shows who extracted it and when
- Duplicate detection across team members
- Team dashboard with contribution stats
- Role distinction: regular user vs admin
- Admin can set a shared API key for the team
- Global export pulls from the shared database

### Recommended stack
- Python with FastAPI (backend)
- PostgreSQL (Railway or Supabase free tier)
- Railway or Render for hosting ($0 to $7 per month)
- Existing frontend mostly unchanged, pointed at new backend

### Future prompt for Stage 5b
"UniScrape has local persistence working (Stage 5 complete) and I want to add a multi-user shared backend so a team of 4 to 6 people can contribute extractions to one shared dataset.

Backend (Python FastAPI):
- POST /auth/register - name, email, password
- POST /auth/login - return JWT
- GET /universities - list all with program counts, contributor, date. Supports search.
- POST /universities - save extraction (auth required)
- PUT /universities/:id - update record (auth required)
- DELETE /universities/:id - admin only
- GET /universities/:id/programs - all programs for a university
- GET /export/all - full dataset as CSV
- GET /export/:id - one university as CSV
- POST /settings/shared-key - admin sets shared API key

Database (PostgreSQL):
- users: id, name, email, password_hash, role (user/admin), created_at
- universities: id, name, domain, source_url, program_count, created_by, updated_by, created_at, updated_at
- programs: id, university_id, and all v2.3.1 fields

Frontend changes:
- Login screen if no valid JWT
- Dashboard shows shared universities
- Duplicate detection against shared database
- Team stats panel
- Admin panel for user management

Provide complete backend as a single Python file using FastAPI and SQLAlchemy, plus requirements.txt.
Here is the current frontend codebase: [paste all files]"

---

## Stage 6 - PDF and Document Extraction
### Goal: detect and extract data from PDF documents linked on program and institution pages

Many universities publish fee schedules, entry requirement tables, and program handbooks as PDFs.

### How it works
1. During any crawl, detect links ending in .pdf
2. Queue detected PDFs and offer to user after main crawl
3. Fetch PDFs via Cloudflare Worker
4. Use PDF.js (browser-based, free) to extract text content
5. Run deterministic pre-extraction (regex for scores, fees, dates) on extracted text
6. Send remaining ambiguous content to API for semantic extraction
7. Match extracted fields back to program records by name
8. Flag PDF-sourced fields with a PDF badge

### Known limitation
Scanned PDFs (image-based) cannot be read by PDF.js. Flag these for manual review.

### Future prompt for Stage 6
"UniScrape has multi-level crawling, persistence, and optionally shared backend working. I want to add PDF detection and extraction.

During any crawl, collect links pointing to .pdf files. After the main crawl, show these to the user with source program names. For selected PDFs:
1. Fetch via Worker at https://uniscrape-proxy.itsvineth05.workers.dev
2. Use PDF.js from CDN (https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js) to extract text
3. If no text extracted (scanned), flag as unreadable
4. Run deterministic regex extractors first (same as Stage 4 layer)
5. Send remaining content to API to extract: fee_international, fee_domestic, fee_eu, currency, entry_ielts, entry_toefl, entry_pte, entry_alevel, entry_ib, entry_gpa, application_deadline, scholarship, scholarship_details, accreditation, rec_letter, personal_statement, portfolio, interview
6. Apply financial_aid sentinel replacement
7. Match to program records by fuzzy name matching
8. Mark PDF-sourced fields with a PDF badge in table and modal

Here is the current codebase: [paste all files]"

---

## Stage 7 - Accuracy and Confidence Layer
### Goal: flag uncertain data so the team knows exactly what to trust

### How it works
- Each field gets a confidence tag: Confirmed / Inferred / Uncertain
- Confirmed: explicitly stated in the source
- Inferred: present but required interpretation
- Uncertain: not found on any fetched page
- Uncertain fields highlighted in table
- Review mode: step through flagged fields, show source text, confirm or correct
- Verified records marked in export

### Future prompt for Stage 7
"UniScrape has all previous stages working. I want to add confidence scoring and human review.

Each extracted field should return an object: value (string) and confidence (confirmed / inferred / uncertain). Confirmed = explicitly stated. Inferred = required interpretation. Uncertain = not found.

UI: inferred fields get subtle yellow tint, uncertain fields get subtle red tint. Modal shows confidence level per field. Review mode steps through flagged fields showing source text, lets user confirm, edit, or mark not found. Verified fields marked as Human Verified. CSV export includes _confidence column per field and overall verified column. If Stage 5b is active, save confidence and verification status to shared database.

Here is the current codebase: [paste all files]"

---

## Technology Stack

### Current (Stages 1 through 5)

| Tool | Purpose | Cost |
|---|---|---|
| GitHub Pages | Frontend hosting | Free |
| Cloudflare Worker | CORS proxy | Free (100k req/day) |
| Anthropic claude-sonnet-4-5 | Primary extraction | Pay per use |
| Google Gemini gemini-1.5-pro-latest | Fallback (blocked in Sri Lanka) | Free tier regional |
| Turndown (Stage 1) | HTML to markdown conversion | Free, CDN |
| PDF.js (Stage 6) | PDF text extraction | Free, CDN |
| IndexedDB (Stage 5) | Local browser database | Free, built-in |

### From Stage 5b onwards

| Tool | Purpose | Cost |
|---|---|---|
| Railway or Render | Backend server hosting | $0 to $7/month |
| Python with FastAPI | Backend framework | Free |
| PostgreSQL | Shared team database | $0 to $5/month free tier |

GitHub Pages is replaced by the backend server at Stage 5b. The Cloudflare Worker continues at all stages.

---

## Immediate Next Actions

1. Implement HTML to markdown conversion in app.js (Stage 1 Part B) - highest ROI change available right now
2. Add retry button and better status messages (Stage 1 Part A)
3. Run the seven test universities from TEST_URLS.md once Stage 1 is complete
4. Begin Stage 2 two-level crawling with institution context built in from the start

---

*UniScrape v2.3.1 - Roadmap last updated May 2026*
