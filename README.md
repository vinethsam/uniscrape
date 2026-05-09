# UniScrape - University Program Finder

A browser-based tool that extracts academic program listings from official university websites.
No server needed - runs entirely on GitHub Pages.

---

## What it does

Paste a link to a university's course listing page and UniScrape will:

1. Fetch the page content via your own Cloudflare proxy
2. Send it to the Gemini API for extraction
3. Match each program to a subject category using the subject mapping file
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

## PART 1 - Set up the Cloudflare Worker (do this first)

The tool needs a small proxy to fetch university pages on your behalf.
This gets around browser security restrictions and is completely free.

### Step 1 - Create a free Cloudflare account

Go to **cloudflare.com** and sign up. No credit card needed.

### Step 2 - Create a Worker

1. After logging in, click **Workers & Pages** in the left sidebar
2. Click **Create** then click **Create Worker**
3. You can rename it to `uniscrape-proxy` or leave the random name
4. Click **Deploy** to get past the initial screen

### Step 3 - Replace the worker code

1. Click **Edit code** (the button that appears after deploying)
2. Delete everything currently in the editor
3. Open the `worker.js` file from this project and copy all of its contents
4. Paste it into the Cloudflare editor
5. Click **Deploy** in the top right corner

### Step 4 - Copy your worker URL

After deploying, your worker URL appears at the top of the screen. It looks like this:

```
https://uniscrape-proxy.YOUR-SUBDOMAIN.workers.dev
```

Copy that full URL and save it somewhere - you need it in the next step.

### Step 5 - Add the worker URL to app.js

1. Open the `app.js` file in any text editor (Notepad is fine)
2. Find this line near the very top of the file:

```
const WORKER_URL = "YOUR_WORKER_URL_HERE";
```

3. Replace `YOUR_WORKER_URL_HERE` with the URL you copied, keeping the quotes around it

It should look like this when done:

```
const WORKER_URL = "https://uniscrape-proxy.abc123.workers.dev";
```

4. Save the file

---

## PART 2 - Get a free Gemini API key

1. Go to **aistudio.google.com**
2. Sign in with your Google account
3. Click **Get API key** in the left sidebar
4. Click **Create API key**
5. Copy the key - it starts with `AIza`

You will paste this key into the tool when you use it. It saves in your browser automatically after the first time.

---

## PART 3 - Put it on GitHub Pages

### Step 1 - Create a GitHub account

Go to **github.com** and sign up if you do not have an account yet.

### Step 2 - Create a new repository

1. Click the **+** icon in the top-right corner of GitHub
2. Click **New repository**
3. Name it: `uniscrape`
4. Select **Public**
5. Do not tick any other boxes
6. Click **Create repository**

### Step 3 - Upload the files

1. On the page that appears, click the link that says **uploading an existing file**
2. Drag and drop all 5 files into the upload box:
   - `index.html`
   - `styles.css`
   - `app.js` (the one you already edited with your worker URL in Part 1)
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
3. A green box will appear showing your live URL:
   `https://YOUR-USERNAME.github.io/uniscrape/`
4. Share that link with your team - it works for everyone instantly

---

## Tips for best results

- Use a page that lists ALL programs at once. Look for links like `/courses/`, `/programmes/`, `/study/all`, or an A-Z listing page.
- If results come back empty, the university site may load programs with JavaScript after the page opens. Try finding a static listing or search results page.
- Always review extracted data before entering it into your database. This tool speeds up research but is not a replacement for human review.

---

## File structure

```
uniscrape/
- index.html         - Main page and layout
- styles.css         - Visual styling
- app.js             - All application logic (fetch, extract, render)
- worker.js          - Cloudflare Worker proxy script (deployed separately)
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
