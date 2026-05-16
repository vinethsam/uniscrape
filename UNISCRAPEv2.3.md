# UniScrape - Development Roadmap

This document outlines the full development plan for UniScrape from its current state
to a fully functional multi-level university crawler. Each stage builds directly on the
last. No stage should be started until the previous one is stable and tested.

---

## Context and purpose

The primary use case of UniScrape is profiling university programs for an international
student audience, which means the most important data points are those relevant to
international applicants: international tuition fees, entry requirements specifically
for international students, English language test scores, intake dates, scholarship
and financial aid availability, and direct links to official program pages.

The tool must be efficient with API calls because cost scales directly with usage.
Every architectural decision should treat cost per university as a real constraint.

Cloudflare Worker proxy URL: https://uniscrape-proxy.itsvineth05.workers.dev
Primary API: Anthropic (claude-sonnet-4-20250514)
Fallback API: Google Gemini (gemini-1.5-pro-latest) - currently blocked in Sri Lanka
Hosting: GitHub Pages (fully static, no backend)

---

## Version history

### v1.0
- Basic single-page extraction
- Public CORS proxies (unreliable, caused errors)
- Anthropic API only

### v2.0
- Switched to Cloudflare Worker as dedicated proxy
- Added Gemini API as alternative provider
- Dual API selector with per-provider key storage
- Expanded fields: start_date, duration, tuition_fee, currency, scholarship, rec_letter, entry_requirements
- Modal detail view (expandable per-row popup)
- CSV export

### v2.1
- API hint text cleaned up - removed pricing and credit card mentions
- Version displayed in footer

### v2.2
- Extraction prompt completely rewritten with 35 structured fields
- Fees split by student type: fee_international, fee_domestic, fee_eu, fee_state, fee_out_of_state, fee_per
- Entry requirements expanded: entry_gpa, entry_ielts, entry_toefl, entry_other_english, entry_gre, entry_gmat, entry_work_experience
- Application requirements: rec_letter, personal_statement, portfolio, interview
- Added: faculty, intake_dates, application_deadline, language_of_instruction, accreditation, scholarship_details
- Modal reorganised into sections: Program, Intakes, Fees, Entry Requirements, Application Requirements, Funding
- Table updated: shows name, level, department, broad_subject, mode, intake_dates, fee_international, entry_ielts, scholarship
- CSV export updated to include all 35 fields
- Level normalisation: PgDip and PgCert moved into Master's

### v2.3 (current)
- Cloudflare Worker URL hardcoded (no more placeholder)
- New field: description - extracts the official program description with preserved formatting
  - AI instructed to include only genuine program content
  - AI instructed to exclude: social media callouts, generic university marketing, navigation, cookie notices, footer text, calls to apply
  - Formatted using safe HTML only: strong, ul/li, ol/li, p
  - Rendered as a formatted block in the modal with its own section
  - Exported as plain text in CSV (HTML tags stripped on export)
- New field: location - physical campus city or name (e.g. "London", "Main Campus, Manchester", "Dubai Campus"). Online programs use "Online".
- Location added as a column in the main table
- Mode detection made smarter - prompt now explicitly maps common variations:
  - On-campus: in-person, face-to-face, classroom-based, physical classes, campus-based
  - Online: distance learning, distance education, e-learning, fully online, virtual, remote
  - Blended: hybrid, mixed-mode, partially online, flexible
- Entry requirements expanded further:
  - entry_alevel - A-level requirements (e.g. "AAB", "ABB including Mathematics")
  - entry_ib - International Baccalaureate Diploma score (e.g. "32 points overall")
  - entry_sat - SAT score requirement
  - entry_act - ACT score requirement
  - entry_pte - PTE Academic score (Pearson)
  - entry_duolingo - Duolingo English Test score
  - entry_cambridge - Cambridge English qualification (C1 Advanced, C2 Proficiency)
  - Prompt now instructs AI to check general admissions sections in addition to program-specific sections
- Application requirements (rec_letter, personal_statement, portfolio, interview) now instructed
  to check the entire page including general admissions sections, not just the program block
- New field: financial_aid
  - AI flags availability using a sentinel value "FINANCIAL_AID_AVAILABLE"
  - JavaScript automatically replaces this with the standard statement:
    "This university offers some form of financial aid to prospective students.
    Please always check the specific requirements and restrictions on scholarship availability."
  - financial_aid covers bursaries, grants, and funding support beyond just scholarships
- CSV filename now includes version: uniscrape-v2.3_YYYY-MM-DD.csv

---

## Current state (v2.3)

### All fields currently extracted

PROGRAM IDENTIFICATION
- name - full official program name
- url - direct link to the program's own page
- level - Bachelor's / Master's / PhD / Doctorate / Foundation / Certificate / Diploma / Other
- department - department name
- faculty - faculty or college (higher level than department)
- location - campus city or name
- mode - On-campus / Online / Blended
- duration - full program length
- language_of_instruction - teaching language

DESCRIPTION
- description - official program description (HTML-formatted, social media and marketing excluded)

INTAKE AND DATES
- intake_dates - all available start months or semesters
- application_deadline - application closing date

FEES (split by student type)
- fee_international - international/overseas student fee
- fee_domestic - local/home student fee
- fee_eu - EU student fee (UK universities)
- fee_state - in-state fee (US public universities)
- fee_out_of_state - out-of-state fee (US public universities)
- fee_per - per year / per semester / per credit / total
- currency - ISO code (GBP, USD, EUR, AUD, MYR, SGD, CAD, etc.)

FINANCIAL AID AND SCHOLARSHIPS
- financial_aid - standard statement if any financial aid mentioned
- scholarship - Yes / No / ""
- scholarship_details - description of available scholarships
- accreditation - professional body accreditation

ENTRY REQUIREMENTS
- entry_requirements_general - general academic requirements
- entry_requirements_international - international-specific requirements
- entry_alevel - A-level requirements
- entry_ib - IB Diploma score
- entry_gpa - minimum GPA
- entry_sat - SAT score
- entry_act - ACT score
- entry_ielts - IELTS band score and component requirements
- entry_toefl - TOEFL score
- entry_pte - PTE Academic score
- entry_duolingo - Duolingo English Test score
- entry_cambridge - Cambridge English qualification
- entry_other_english - other accepted English qualifications
- entry_gre - GRE requirement
- entry_gmat - GMAT requirement
- entry_work_experience - work experience requirement

APPLICATION REQUIREMENTS
- rec_letter - references or recommendation letters (Yes / No / "")
- personal_statement - personal statement or statement of purpose (Yes / No / "")
- portfolio - portfolio or work samples (Yes / No / "")
- interview - interview or audition (Yes / No / "")

CLASSIFICATION (auto-filled from subject_mapping.js)
- narrow_subject
- broad_subject

### Main table columns
name, level, department, broad_subject, mode, location, intake_dates,
fee_international, entry_ielts, scholarship, Details button, Link

### Modal sections
Program - name, level, faculty, department, broad_subject, narrow_subject, mode,
location, duration, language, accreditation, URL
Program Description - rendered HTML block
Intakes and Deadlines - intake_dates, application_deadline
Tuition Fees - currency, fee_per, fee_international, fee_domestic, fee_eu, fee_state, fee_out_of_state
Financial Aid - financial_aid, scholarship, scholarship_details
Entry Requirements - all entry_ fields
Application Requirements - rec_letter, personal_statement, portfolio, interview

### Current limitations
- Reads only one URL at a time, cannot follow links or navigate between pages
- Data completeness depends entirely on what is visible on that single listing page
- No memory between sessions - results are lost when the tab is closed
- No way to save, compare, or build on previous results

---

## Priority data fields for all future stages

All fields listed in the current state section above are the baseline.
Every future stage must preserve all existing fields and add to them, never remove.
The following principles apply to all future extraction prompts:

- Always split fees by student type wherever possible
- Always check general admissions sections in addition to program-specific sections
  when looking for entry requirements and application requirements
- Mode must always use the smart normalisation mapping (distance learning = Online, etc.)
- Description must always filter out social media, marketing, and non-program content
- Financial aid must always use the sentinel/replacement pattern
- Level must always classify PgDip and PgCert as Master's

---

## Cost reference

### Per API call estimates (Anthropic claude-sonnet, current pricing)
- Small page under 5000 words: $0.01 - $0.02
- Medium page 5000 to 15000 words: $0.02 - $0.06
- Large page over 15000 words: $0.06 - $0.15
- These estimates cover both input and output tokens combined
- Note: the v2.3 prompt is significantly longer than earlier versions due to the
  expanded field set. This increases input token cost slightly per call.

### Per university estimates by stage

| Stage | Programs | Page visits | Estimated cost |
|---|---|---|---|
| v2.3 current (single page) | any | 1 | $0.02 - $0.08 |
| Stage 2 (two-level, 50 programs) | 50 | 51 | $0.80 - $2.50 |
| Stage 2 (two-level, 100 programs) | 100 | 101 | $1.60 - $5.00 |
| Stage 2 (two-level, 200 programs) | 200 | 201 | $3.20 - $10.00 |
| Stage 3 (with navigation, 100 programs) | 100 | 110 - 125 | $2.00 - $6.50 |
| Stage 4 (add PDFs, 5 docs per uni) | - | +5 docs | add $0.15 - $0.60 |

### Test run estimate for 15 universities (Stage 2, v2.3 prompt)
Assuming an average of 80 programs per university and mostly medium-sized pages:
- Conservative estimate: 15 x $1.30 = $19.50
- Realistic estimate: 15 x $3.00 = $45.00
- Worst case (large universities, deep pages): 15 x $8.00 = $120.00

Recommendation: cap at 20 programs per university for initial testing.
At 20 programs per university across 15 universities the cost should stay under $15.

### Cost control measures to build in at Stage 2
- Max programs cap per run (user-adjustable, default 25 for testing)
- Estimated cost display before the crawl starts based on program count
- Live cost tracker showing spend so far during a crawl
- Hard stop if cost exceeds a user-set limit

---

## Stage 1 - Stabilise the foundation
### Goal: get the tool working end to end before adding anything new

This stage is about environment and validation, not new features. Do not skip it.
Everything after this depends on having a confirmed working baseline.

### Tasks

**1.1 - Get the Anthropic API key**
Sign up at console.anthropic.com and add a minimum of $5 credit.
Test the tool against at least five universities with clean listing pages.
Document results in TEST_URLS.md (see 1.2).

**1.2 - Build a test library**
Create a file called TEST_URLS.md in the repository.
Collect 10 to 15 university listing page URLs covering different structures:
- Clean flat list (all programs on one page, A-Z)
- Paginated list (programs split across multiple pages)
- Department-based (must navigate into each department to find programs)
- JavaScript-heavy (programs load dynamically, not in raw HTML)
- Mixed (some programs listed, some requiring a click deeper)

For each URL note: university name, country, expected program count, structure type.

**1.3 - Document failure modes**
Run the current v2.3 tool against every URL in the test library.
For each result record: how many programs found, which fields were mostly empty,
any errors encountered, and what page structure caused the problem.
This becomes the known issues list going into Stage 2.

**1.4 - Small UI fixes based on real usage**
- Add a retry button that appears after any error
- Make status messages more specific (e.g. "Sending 47,000 characters to API..." rather than just "Extracting...")
- Add a visible notice if the page was truncated due to size

### Future prompt for Stage 1 fixes
"I am working on UniScrape v2.3, a university program extraction tool. It is a fully
static GitHub Pages site using plain HTML, CSS, and JavaScript. It uses a Cloudflare
Worker at https://uniscrape-proxy.itsvineth05.workers.dev as a CORS proxy and supports
the Anthropic API (claude-sonnet-4-20250514) and Google Gemini (gemini-1.5-pro-latest).

I have tested it against these URLs and found these failure patterns: [list URLs and
failure descriptions]. Please fix the following issues without changing the extraction
prompt, field structure, or modal layout: [list issues]. Also add a retry button after
any error and make status messages more descriptive about what step is running and how
much data is being sent to the API. Here is the current app.js: [paste full app.js]"

---

## Stage 2 - Two-level crawling
### Goal: automatically visit each individual program page and extract full details

This is the single most impactful upgrade possible. The listing page typically contains
only program names and links. All the real detail - fees, entry requirements, intakes,
scholarships, description - lives on each individual program's own page. Without this
stage, most rows in the table will have empty fields for everything that actually matters.

### How it works
1. Fetch the listing page via the Cloudflare Worker
2. Send it to the API with a lightweight pass-one prompt: extract program names and their
   direct URLs only - nothing else. This is fast and cheap.
3. Present the user with the program count and an estimated cost, and ask them to confirm
   before proceeding
4. For each URL found, fetch that individual program page via the Worker with a
   configurable delay between requests
5. Send each individual program page to the API with the full v2.3 extraction prompt
   requesting all fields
6. Merge all results into one unified table

### Key technical challenges

**Rate limiting** - visiting 200 pages in quick succession will trigger blocks on some
university websites. Build in a configurable delay between requests. Default 1500ms.
Make it adjustable in the UI from 500ms to 5000ms.

**Cost control** - each page visit is an API call. Add a max programs cap the user sets
before starting. Default 25 for testing. Show estimated cost before crawl starts.
Track and display live spend during the crawl.

**Progress visibility** - a 100-program crawl at 1.5s delay takes at least 2.5 minutes.
Show a live counter "Fetching program 23 of 100" with a progress bar and estimated time
remaining based on average time per program so far. Never let the user wonder if it froze.

**Per-program error handling** - if one individual program page fails, log the failure
and skip that program. Never stop the whole job for one error.

**Relative URL resolution** - individual program links are often relative paths.
Resolve all relative URLs against the base domain before fetching.

### New UI elements needed
- Pre-crawl settings panel: max programs cap, delay between requests
- Cost estimate display before crawl starts (based on program count from pass one)
- Confirmation step: "Found 147 programs. Estimated cost: $2.50 - $5.00. Proceed?"
- Live progress: "Fetching program X of Y - estimated cost so far: $Z"
- Error log panel: collapsible list of failed URLs and reasons
- Pause button that halts the crawl and keeps results collected so far

### Future prompt for Stage 2
"I am building UniScrape, a university program data extraction tool. It is a fully
static GitHub Pages site using plain HTML, CSS, and JavaScript. It uses a Cloudflare
Worker at https://uniscrape-proxy.itsvineth05.workers.dev as a CORS proxy. It supports
the Anthropic API (model: claude-sonnet-4-20250514) and Google Gemini (gemini-1.5-pro-latest).

I want to upgrade it from single-page extraction to two-level crawling:

Pass 1 - fetch the listing page URL provided by the user. Send the cleaned HTML to
the API with a lightweight prompt that extracts only program names and their direct URLs.
Nothing else. This should be a cheap and fast pass.

Pass 2 - show the user the program count found and an estimated cost range. Ask them
to confirm before proceeding. Then for each program URL found, fetch that individual
page via the Cloudflare Worker with a configurable delay between requests (default 1500ms,
user-adjustable between 500ms and 5000ms). Send each page to the API using the full
extraction prompt (which I will paste below) requesting all fields.

The full extraction prompt to use for each individual program page is as follows:
[paste the full buildPrompt() function contents from app.js]

Additional requirements:
- Max programs cap input (default 25, no upper limit)
- Show estimated cost before crawl: base estimate of $0.03 per program for conservative,
  $0.08 per program for worst case
- Track and display live estimated spend during the crawl
- Hard stop option if spend exceeds a user-set limit
- Live counter showing program X of Y with progress bar and estimated time remaining
- Collapsible error log for any URLs that failed
- Pause button that halts the crawl and keeps all results gathered so far
- Resolve all relative URLs to absolute before fetching
- The financial_aid sentinel replacement, subject mapping, and all existing filters,
  modal sections, and CSV export must continue to work exactly as in v2.3

Here is the current app.js: [paste]
Here is the current index.html: [paste]
Here is the current styles.css: [paste]"

---

## Stage 3 - Intelligent site navigation
### Goal: start from any university homepage and let the tool find the programs itself

At Stage 2 the user still needs to manually find the right listing page URL.
Stage 3 removes that requirement. Paste the university homepage and the tool
navigates the site structure on its own to find where programs are listed.

### How it works
1. Load the starting URL
2. Ask the API to identify links most likely to lead toward academic program listings
3. Follow the highest-confidence link
4. At each new page ask: have we reached a program listing? If yes, hand off to Stage 2.
   If no, identify the next best link to follow.
5. Continue up to the configured max depth

### Key technical challenges
- Max depth limit (default 5) to prevent runaway costs
- Visited URL tracking to prevent loops
- Domain locking - never follow links off the university's domain
- Breadcrumb trail showing the path taken so user can understand and correct it
- Fallback if no listing found within depth limit

### Future prompt for Stage 3
"UniScrape v2.3 has two-level crawling working (Stage 2 complete). I want to add
intelligent site navigation so the user can paste a university homepage URL and the
tool finds the program listing page automatically.

The navigator should:
1. Fetch the starting URL via the Cloudflare Worker at https://uniscrape-proxy.itsvineth05.workers.dev
2. Send the cleaned HTML to the Anthropic API with a navigation prompt: given this
   university webpage, identify up to three links most likely to lead toward a page
   listing academic programs. Prioritise links containing: courses, programmes, study,
   academics, departments, faculties, schools, undergraduate, postgraduate, admissions.
   Ignore: news, events, research, staff, alumni, login, careers, about, contact, social
   media, external sites. Return a JSON array with keys: url (absolute), label (link text),
   confidence (high/medium/low), reason (one sentence explanation).
3. Follow the highest confidence link
4. At each new page ask the API: does this page contain a list of academic programs with
   links to individual program pages? Answer yes or no with a brief reason.
5. If yes, hand off to the Stage 2 two-level extractor
6. If no, repeat navigation from step 2
7. Maximum navigation depth: 5 hops (user-adjustable)
8. Lock to starting domain - never follow external links
9. Track all visited URLs and never revisit

UI requirements:
- Breadcrumb trail showing the path taken as navigation progresses
- Show which link was chosen at each step and the AI's stated reason
- If navigation fails within the depth limit, show the last page reached, list links
  found there, and let the user manually select one to continue from
- Manual override input to paste a URL and skip ahead at any point

Here is the current codebase: [paste all files]"

---

## Stage 4 - PDF and document extraction
### Goal: detect and extract data from PDF documents linked on program pages

Many universities publish fee schedules, entry requirement tables, and program handbooks
as downloadable PDFs rather than on web pages.

### How it works
1. During Level 2 crawls, detect links pointing to PDF files
2. Collect them into a PDF queue and offer to the user after the main crawl
3. Fetch selected PDFs via the Cloudflare Worker
4. Use PDF.js (open source, browser-based) to extract text content
5. Send extracted text to the API to pull out any program-relevant fields
6. Match data back to existing program records by name
7. Flag fields updated from a PDF source with a PDF badge

### Known limitation
Scanned PDFs (image-based) cannot be read by PDF.js. These get flagged for manual review.

### Future prompt for Stage 4
"UniScrape has intelligent navigation and two-level crawling working. I want to add
PDF detection and extraction.

During any Level 2 crawl, scan each program page for anchor tags pointing to PDF files
(href ending in .pdf). Collect these into a PDF queue.

After the main crawl completes, show the PDF queue with file names and source program
names. Let the user select which to extract.

For each selected PDF:
1. Fetch via the Cloudflare Worker at https://uniscrape-proxy.itsvineth05.workers.dev
2. Use PDF.js (cdnjs: https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js)
   to extract all text in the browser
3. If no text extracted (scanned PDF), flag as unreadable and skip
4. Send text to Anthropic API to extract any of these fields if present:
   fee_international, fee_domestic, fee_eu, fee_state, fee_out_of_state, currency,
   fee_per, financial_aid, entry_ielts, entry_toefl, entry_pte, entry_alevel, entry_ib,
   entry_gpa, entry_sat, entry_act, entry_gre, entry_gmat, application_deadline,
   scholarship, scholarship_details, accreditation, rec_letter, personal_statement,
   portfolio, interview. Return a JSON object with only the fields found.
5. Apply the financial_aid sentinel replacement to any financial_aid values returned
6. Match extracted fields to existing program records by fuzzy program name matching
7. Mark any field updated from a PDF with a small PDF badge in the table cell

Here is the current codebase: [paste all files]"

---

## Stage 5 - Local data persistence and session management
### Goal: save results between sessions and build a running dataset over time

Right now every time the tab is closed all results are lost.

### How it works
- IndexedDB (built into every browser, free, no server needed)
- Each university gets a saved record with all its programs
- Dashboard shows all previously profiled universities
- Records are updatable, mergeable, and deletable
- Global export combines everything into one CSV

### Future prompt for Stage 5
"UniScrape has multi-level crawling and PDF extraction working. I want to add local
data persistence using the browser's IndexedDB API.

Database structure:
- universities: id, name, domain, date_crawled, program_count, source_url
- programs: id, university_id, and all v2.3 fields (full list below):
  name, url, level, department, faculty, location, mode, duration,
  language_of_instruction, description, intake_dates, application_deadline,
  fee_international, fee_domestic, fee_eu, fee_state, fee_out_of_state, fee_per, currency,
  financial_aid, scholarship, scholarship_details, accreditation,
  entry_requirements_general, entry_requirements_international,
  entry_alevel, entry_ib, entry_gpa, entry_sat, entry_act,
  entry_ielts, entry_toefl, entry_pte, entry_duolingo, entry_cambridge, entry_other_english,
  entry_gre, entry_gmat, entry_work_experience,
  rec_letter, personal_statement, portfolio, interview,
  narrow_subject, broad_subject

UI additions:
- Dashboard as default home screen: table of saved universities with name, domain,
  program count, date last crawled, and action buttons
- Actions per record: View programs, Update (re-crawl), Delete, Export CSV
- Dashboard search bar to filter by university name or country
- New Extraction button opens the current extraction flow
- After any successful extraction, prompt to save with a university name input
  (pre-filled from page title if detectable)
- Global Export All button combining all saved universities into one CSV with
  university_name as the first column

Existing per-crawl export must continue to work.
Here is the current codebase: [paste all files]"

---

## Stage 6 - Accuracy and confidence layer
### Goal: flag uncertain data so the team knows exactly what to trust and what to verify

### How it works
- Each field gets a confidence tag: Confirmed / Inferred / Uncertain
- Uncertain fields highlighted in the table
- Review mode lets user step through flagged fields and confirm or correct them
- Verified records marked in the export

### Future prompt for Stage 6
"UniScrape has multi-level crawling, PDF extraction, and local persistence working.
I want to add confidence scoring and a human review layer.

Changes to the extraction prompt: each field should return an object with keys:
value (the extracted string) and confidence (confirmed / inferred / uncertain).
Confirmed = explicitly stated. Inferred = required interpretation. Uncertain = not found.

UI changes:
- Inferred fields: subtle yellow tint in table cell
- Uncertain fields: subtle red tint in table cell
- Modal shows confidence level next to each field value
- Review mode: step through flagged fields one at a time, show surrounding source text,
  let user confirm, edit, or mark as not found
- Verified fields marked as Human Verified in modal and export
- CSV export includes _confidence column per field and an overall verified column

Here is the current codebase: [paste all files]"

---

## Technology stack

| Tool | Purpose | Cost |
|---|---|---|
| GitHub Pages | Hosting | Free |
| Cloudflare Worker | CORS proxy (itsvineth05.workers.dev) | Free (100k req/day) |
| Anthropic API | Primary extraction (claude-sonnet-4-20250514) | Pay per use |
| Google Gemini API | Fallback (currently blocked in Sri Lanka) | Free tier (region dependent) |
| PDF.js | PDF text extraction (Stage 4) | Free, open source |
| IndexedDB | Local browser database (Stage 5) | Free, built into every browser |

No backend server is required at any stage of this roadmap.

---

## What to do right now

1. Get the Anthropic API key - console.anthropic.com - minimum $5 to begin testing
2. Build TEST_URLS.md with 10 to 15 real university listing URLs
3. Run v2.3 against those URLs and document results
4. Return to this roadmap and begin Stage 1 validation tasks

---

*UniScrape v2.3 - Last updated May 2026*