# UniScrape - University Program Finder

A tool for extracting academic program listings directly from official university websites.
Paste a university's course listing page and get a filterable, searchable table of all their programs instantly. Completely browser based, no manual installation required.

---

## Getting started

### Step 1 - Get an API key

UniScrape uses the Google Gemini API to read and extract program data. You need a key to use it.

1. Go to **aistudio.google.com**
2. Sign in with your Google account
3. Click **Get API key**
4. Click **Create API key**
5. Copy the key - it starts with `AIza`

Alternatively, if you have an Anthropic API key (Recommended), that works too. You can switch between providers in the tool itself.

---

### Step 2 - Open the tool

Go to the UniScrape link; https://vinethsam.github.io/uniscrape/

---

### Step 3 - Enter your API key

1. In the **API Provider** dropdown, select whichever provider matches your key
2. Paste your key into the **API Key** field
3. Your key saves in your browser automatically - you only need to do this once

---

### Step 4 - Extract programs

1. Go to the university's website and find their full course or programme listing page
   - Look for pages titled "All programmes", "Our courses", "A-Z courses", or similar
   - The more programs listed on the page the better - look for a "View all" option if one exists
2. Copy that page's URL from your browser
3. Paste it into the URL field in UniScrape
4. Click **Extract Programs**
5. Wait a few seconds for the results to load

---

## Using the results

**Filtering** - use the filter bar above the table to narrow results by program name, level, subject area, study mode, scholarship availability, or department.

**Sorting** - click any column header to sort by that column. Click again to reverse the order.

**View all details** - click the **View all** button on any row to see the full details for that program in a popup, including entry requirements, fees, duration, and more if the university lists them.

**Export** - click **Export CSV** to download the full results as a spreadsheet.

---

## Things to keep in mind

- Results are only as complete as what the university lists on that page. If a field shows N/A it means the university did not include that information on the listing page.
- Always verify data against the official university website before entering it into any database.
- Some universities load their course listings dynamically, which may result in fewer programs being detected. If results seem incomplete, try finding a different listing page on the same site such as an A-Z page or a search results page.
- Data is sourced exclusively from the official URL you provide.

---

UniScrape v2.1
