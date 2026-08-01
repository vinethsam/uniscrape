# UniScrape

UniScrape is a web application for extracting structured university programme information from official university websites. Users provide an official university catalogue, course search, or programme-listing URL, and UniScrape returns structured rows for review and export.

The app is intended for university programme research, catalogue building, and audit work. It discovers programme links, can follow programme detail pages when Depth-1 extraction is enabled, and combines deterministic cleanup with LLM-assisted extraction through the UniScrape backend.

## How It Works

1. The user signs in with Google and submits a university URL.
2. UniScrape sends the request to the production extraction API.
3. The backend loads and cleans the seed page, including rendered pages where supported.
4. Programme links and page data are discovered, normalized, and checked for pagination or embedded data.
5. Optional Depth-1 processing visits discovered programme detail pages to enrich the result rows.
6. Deterministic processing and LLM-assisted extraction produce structured rows for display, filtering, append, and CSV export.

## Current Features

- **Google Sign-In and approval:** users sign in with Google; new users may enter a display name and wait for account approval. Admin users have a Team Access panel for pending and approved users.
- **Audit mode:** the default detailed extraction mode for admissions, English requirements, fees, intakes, scholarships, application requirements, description, provenance, and related audit fields.
- **Catalog mode:** a lighter catalogue-oriented output for course name, university, URL, level, credits, duration, fees, location, language, and mode of study. In the current UI this is enabled by the settings toggle labelled `'Bassa' mode`.
- **Depth-1 extraction:** an optional setting that asks the backend to visit discovered programme detail pages instead of relying only on the initial listing page.
- **Programme discovery:** the backend returns final rows and diagnostics for discovered programme candidates, detail-page attempts, skipped pages, partial extraction, and completion status.
- **Rendered-page and embedded-data handling:** the production API is used for page acquisition and reports diagnostics for rendering, captured API responses, embedded page data, selected HTML, and markdown when available.
- **Pagination handling:** background job diagnostics can report listing pages fetched and pagination queues. Pagination and load-more coverage varies by university site and access controls.
- **Background jobs:** universal and UCAS extractions start as jobs when the backend route is available, with status polling, progressive row rendering, warnings, and a cancel control. The frontend falls back to the synchronous crawl route if a job route is unavailable.
- **UCAS mode:** supported UCAS course/search URLs automatically switch to a UCAS catalogue table with UCAS points, fees, fee status, provider, mode, start date, location, and course URL. UCAS security or rate-limit pages are surfaced as warnings.
- **Append:** users can add another seed URL to the current working table. Existing rows are retained, and incoming rows are deduplicated by normalized URL when possible, otherwise by name plus university/provider.
- **Search, sorting, and filters:** Audit results can be searched by programme name, sorted by table headers, and filtered by level, subject area, mode, scholarship availability, and department. Catalog and UCAS results use compact tables without the audit filter bar.
- **Detail views and copy controls:** Audit rows include a "View all" detail modal with provenance fields and per-field copy buttons for values such as programme descriptions.
- **Diagnostics:** Debug mode and Content diagnostics can expose backend diagnostics and downloads for raw HTML, selected HTML, markdown, extraction preview, API response data, and final extraction markdown when those values are returned.
- **CSV export:** Audit, Catalog, and UCAS tables can be downloaded as CSV files. XLSX export is not implemented in this checkout.
- **Language fields:** language values are displayed and exported when returned by the backend; there is no separate translation workflow in the current frontend.

Extracted programme rows are kept in the current browser page state until they are cleared or the page is reloaded. The frontend stores the Google session token and display name in browser storage, but it does not save extracted result tables persistently to a user account. Downloading CSV is the supported way to keep a copy of results from this checkout.

## Using UniScrape

1. Open [https://www.uniscrape.com/](https://www.uniscrape.com/).
2. Sign in with Google.
3. If prompted, enter your display name and wait for account approval.
4. Use the default Audit mode, or enable Catalog mode from settings.
5. Enter an official university listing, catalogue, course-search, or supported UCAS URL.
6. Configure available settings such as Depth-1 extraction, Content body, Debug mode, or Content diagnostics.
7. Run the extraction.
8. Review results, open detail views, filter Audit rows, append another seed URL, clear the table, or export CSV.

## Running Locally

This checkout contains the static frontend and frontend parser tests. The FastAPI backend source, `requirements.txt`, `.env.example`, deployment files, and backend benchmark modules are not included here.

Serve the frontend from the repository root:

```bash
python -m http.server 8000
```

Then open [http://127.0.0.1:8000/](http://127.0.0.1:8000/). The local frontend is configured to call the production UniScrape API, so extraction still requires network access and an approved Google account.

No local environment variables are required by the checked-in frontend. There is no npm install or build step.

Run the frontend response-parser tests with Node's built-in test runner:

```bash
node --test tests/frontend-response-parser.test.js
```

No opt-in Depth-1 benchmark command is documented here because this checkout does not include a `benchmarks.depth1` module. Live extraction and any live benchmarks contact real university websites and should be run intentionally.

## Architecture

```text
Static frontend configured for https://www.uniscrape.com/
        |
        v
Production UniScrape API at https://api.uniscrape.com/
        |
        v
HTTP / rendered page acquisition
        |
        v
Discovery, pagination, and optional Depth-1 detail processing
        |
        v
Deterministic cleanup and LLM-assisted structured extraction
        |
        v
Structured tables, diagnostics, append, and CSV export
```

## Project Status

UniScrape is under active development. Extraction coverage varies between university websites because their structures, JavaScript behavior, pagination patterns, and access controls differ.

No `LICENSE` file is included in this checkout.
