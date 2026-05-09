# UniScrape - University Program Finder

A browser-based tool that extracts academic program listings from official university websites.
No server needed - runs entirely on GitHub Pages https://vinethsam.github.io/uniscrape/

---

## What it does

Paste a link to a university's course listing page and UniScrape will:

1. Fetch the page content
2. Send it to the Gemini API for extraction
3. Match each program to a subject category using your subject mapping file
4. Display a filterable, sortable table of all programs found
5. Let you export the results as a CSV file

### Fields extracted per program

| Field | Description |
|---|---|
| Program Name | Full name of the course or programme |
| Level | Bachelor's / Master's / PhD / Foundation / Certificate / Other |
| Department | School or department if listed on the page |
| Broad Subject | Top-level subject category from the mapping file |
| Narrow Subject | More specific subject from the mapping file |
| Mode | On-campus / Online / Blended (only if stated on the page) |
| URL | Direct link to the program's page on the official site |

---

## How to get this running on GitHub Pages

Follow these steps exactly. It takes about 5 minutes.

### Step 1 - Create a GitHub account

Go to **github.com** and sign up if you don't have an account yet.

### Step 2 - Create a new repository

1. Click the **+** icon in the top-right corner of GitHub
2. Click **New repository**
3. Name it: `uniscrape`
4. Select **Public**
5. Do not tick any other boxes
6. Click **Create repository**

### Step 3 - Upload the files

1. On the page that appears after creating the repo, click the link that says **uploading an existing file**
2. Drag and drop all 5 files into the upload box:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `subject_mapping.js`
   - `README.md`
3. Wait for all 5 files to finish uploading
4. Scroll down and click the green **Commit changes** button

### Step 4 - Turn on GitHub Pages

1. Click **Settings** in the top menu of your repository
2. In the left sidebar, scroll down and click **Pages**
3. Under **Branch**, click the dropdown that says **None** and change it to **main**
4. Make sure the folder next to it shows **/ (root)**
5. Click **Save**

### Step 5 - Get your live link

1. Stay on the Pages settings page and wait about 60 seconds
2. Refresh the page
3. A green box will appear at the top showing your live URL - it will look like this:
   `https://YOUR-USERNAME.github.io/uniscrape/`
4. Share that link with your team - it works for everyone with no setup needed on their end

---

## How to get a free Gemini API key

1. Go to **aistudio.google.com**
2. Sign in with your Google account
3. Click **Get API key** in the left sidebar
4. Click **Create API key**
5. Copy the key - it starts with `AIza`
6. Paste it into the API Key field in the UniScrape tool

The key is saved in your browser automatically after you enter it the first time.
Each team member needs to enter their own key (or you can share one key with the team).
The free tier is generous enough for this use case - no credit card required.

---

## Tips for best results

- Use a page that lists ALL programs at once, not a single course page. Look for links like `/courses/`, `/programmes/`, `/study/all`, or an A-Z listing page.
- If results come back empty or incomplete, the university's site may be loading programs dynamically with JavaScript. In that case, try finding a static listing page or a search results page.
- Always review the extracted data before entering it into your database. This tool speeds up the research step but is not a replacement for human review.

---

## File structure

```
uniscrape/
- index.html         - Main page and layout
- styles.css         - Visual styling
- app.js             - All application logic (fetch, extract, render)
- subject_mapping.js - Subject taxonomy with 4000+ program entries
- README.md          - This file
```

---

## Adding more fields later

The extraction logic is in `app.js` inside the `prompt` string in the `extractWithGemini` function.
To add a new field (e.g. fees, duration, entry requirements):

1. Add the new key and description to the prompt's JSON field list
2. Add a column header `<th>` in `index.html`
3. Add the cell `<td>` in the `renderTable` function in `app.js`
4. Add the field name to the `cols` array in the export section of `app.js`

---

## Notes on accuracy

Accuracy is high on clean, structured listing pages and will vary across universities.
Pages that load content entirely through JavaScript after the page opens may return incomplete results.
Data is always sourced from the official URL you provide - no third-party sources are used.
