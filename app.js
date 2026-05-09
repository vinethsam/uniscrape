/* ---------------------------------------------------------------
   UniScrape - app.js
   Fetches a university programs page via CORS proxy, sends the
   HTML to the Gemini API for structured extraction, maps subjects
   using subject_mapping.js, and renders a filterable table.
---------------------------------------------------------------- */

// ---- Config -----------------------------------------------------
const GEMINI_MODEL  = "gemini-2.0-flash";
const GEMINI_URL    = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const MAX_HTML_CHARS = 120000;

// IMPORTANT: After deploying worker.js to Cloudflare, paste your
// worker URL here. It will look like:
// https://uniscrape-proxy.YOUR-SUBDOMAIN.workers.dev
const WORKER_URL = "https://uniscrape-proxy.itsvineth05.workers.dev/";

// ---- State ------------------------------------------------------
let allPrograms = [];
let sortCol     = null;
let sortDir     = 1;

// ---- DOM refs ---------------------------------------------------
const urlInput       = document.getElementById("urlInput");
const apiKeyInput    = document.getElementById("apiKeyInput");
const scrapeBtn      = document.getElementById("scrapeBtn");
const statusSection  = document.getElementById("statusSection");
const statusText     = document.getElementById("statusText");
const progressFill   = document.getElementById("progressFill");
const errorSection   = document.getElementById("errorSection");
const errorText      = document.getElementById("errorText");
const resultsSection = document.getElementById("resultsSection");
const tableBody      = document.getElementById("tableBody");
const resultCount    = document.getElementById("resultCount");
const sourcePill     = document.getElementById("sourcePill");
const exportBtn      = document.getElementById("exportBtn");
const clearBtn       = document.getElementById("clearBtn");
const noResults      = document.getElementById("noResults");

const filterName     = document.getElementById("filterName");
const filterLevel    = document.getElementById("filterLevel");
const filterBroad    = document.getElementById("filterBroad");
const filterMode     = document.getElementById("filterMode");
const filterDept     = document.getElementById("filterDept");

// ---- Persist API key --------------------------------------------
apiKeyInput.value = localStorage.getItem("uniscrape_gemini_key") || "";
apiKeyInput.addEventListener("change", () => {
  localStorage.setItem("uniscrape_gemini_key", apiKeyInput.value.trim());
});

// ---- Main flow --------------------------------------------------
scrapeBtn.addEventListener("click", runScrape);
urlInput.addEventListener("keydown", e => { if (e.key === "Enter") runScrape(); });

async function runScrape() {
  const url    = urlInput.value.trim();
  const apiKey = apiKeyInput.value.trim();

  clearError();
  hideResults();

  if (!url)    return showError("Please enter a URL.");
  if (!apiKey) return showError("Please enter your Gemini API key. Get one free at aistudio.google.com.");
  try { new URL(url); } catch { return showError("That doesn't look like a valid URL."); }

  scrapeBtn.disabled = true;
  showStatus("Fetching page content...", 10);

  let html;
  try {
    html = await fetchWithProxy(url);
  } catch (e) {
    scrapeBtn.disabled = false;
    return showError(
      "Could not fetch the page: " + e.message +
      ". Try pasting the URL of the university's full programme listing page instead of a single course page."
    );
  }

  showStatus("Extracting program data...", 40);

  let programs;
  try {
    programs = await extractWithGemini(html, url, apiKey);
  } catch (e) {
    scrapeBtn.disabled = false;
    return showError("Extraction failed: " + e.message);
  }

  showStatus("Mapping subjects...", 80);
  programs = programs.map(p => mapSubjects(p));

  showStatus("Rendering results...", 96);
  allPrograms = programs;

  await sleep(300);
  hideStatus();
  renderResults(url);
  scrapeBtn.disabled = false;
}

// ---- Fetch via Cloudflare Worker --------------------------------
async function fetchWithProxy(url) {
  if (!WORKER_URL || WORKER_URL === "YOUR_WORKER_URL_HERE") {
    throw new Error(
      "Worker URL not set. Open app.js and paste your Cloudflare Worker URL into the WORKER_URL variable at the top of the file."
    );
  }

  const proxyUrl = `${WORKER_URL.replace(/\/$/, "")}?url=${encodeURIComponent(url)}`;

  let res;
  try {
    res = await fetch(proxyUrl, { signal: AbortSignal.timeout(25000) });
  } catch (e) {
    throw new Error("Could not reach the proxy worker: " + e.message);
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(data?.error ?? "Worker returned HTTP " + res.status);
  }

  if (!data?.contents || typeof data.contents !== "string") {
    throw new Error("Unexpected response from worker.");
  }

  return data.contents;
}

// ---- Gemini extraction ------------------------------------------
async function extractWithGemini(rawHtml, sourceUrl, apiKey) {
  // Clean up HTML to reduce token usage
  let cleaned = rawHtml
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s{3,}/g, "  ");

  if (cleaned.length > MAX_HTML_CHARS) {
    cleaned = cleaned.slice(0, MAX_HTML_CHARS) + "\n\n[...page truncated...]";
  }

  const prompt = `You are a precise data extraction tool. Extract all academic programs from the university page HTML below.

Return ONLY a valid JSON array. No markdown, no code fences, no explanation - just the raw JSON array.

Each object in the array must have exactly these keys:
- "name"       : full program name (string)
- "url"        : direct URL to this specific program's page. If the link is relative, make it absolute using the base URL ${sourceUrl}. Use "" if not found.
- "department" : department or school name if mentioned on the page, otherwise ""
- "level"      : must be exactly one of: "Bachelor's", "Master's", "PhD / Doctorate", "Foundation", "Certificate / Diploma", "Other"
- "mode"       : must be exactly one of: "On-campus", "Online", "Blended", "" (use "" if not stated)

Rules:
- Only include genuine academic programs. Skip news, events, staff pages, login links, etc.
- Do not invent data. If something is not on the page, use "".
- Remove duplicates. If the same program appears twice with the same name and level, include it once.
- Normalise level values: BSc / BA / BEng / BComm = "Bachelor's" -- MSc / MA / MBA / MRes / PgDip / PgCert = "Master's" -- PhD / DPhil / DBA / Doctorate = "PhD / Doctorate"
- Return as many programs as you can find in the HTML.

Source URL: ${sourceUrl}

HTML:
${cleaned}`;

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message ?? ("API error " + res.status);
    throw new Error(msg);
  }

  const data = await res.json();
  const raw  = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  // Strip any accidental markdown fences
  const jsonStr = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    // Try to find a JSON array anywhere in the response
    const match = jsonStr.match(/\[[\s\S]*\]/);
    if (match) {
      try { parsed = JSON.parse(match[0]); }
      catch { throw new Error("Could not parse the response as JSON. The page may not contain a recognisable program listing."); }
    } else {
      throw new Error("No program data found. Try pasting a URL that lists all programs on one page.");
    }
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Unexpected response shape. Expected an array of programs.");
  }

  return parsed;
}

// ---- Subject mapping --------------------------------------------
function mapSubjects(program) {
  if (typeof SUBJECT_MAP === "undefined") {
    return { ...program, narrow_subject: "", broad_subject: "" };
  }

  const key = (program.name ?? "").toLowerCase().trim();

  // 1. Exact match
  if (SUBJECT_MAP[key]) {
    const s = SUBJECT_MAP[key];
    return { ...program, narrow_subject: s.narrow || "", broad_subject: s.broad || "" };
  }

  // 2. Partial match - mapping key contained in program name
  const found = Object.entries(SUBJECT_MAP).find(([k]) =>
    k.length > 4 && (key.includes(k) || k.includes(key))
  );
  if (found) {
    const s = found[1];
    return { ...program, narrow_subject: s.narrow || "", broad_subject: s.broad || "" };
  }

  return { ...program, narrow_subject: "", broad_subject: "" };
}

// ---- Render results ---------------------------------------------
function renderResults(sourceUrl) {
  let host;
  try { host = new URL(sourceUrl).hostname; } catch { host = sourceUrl; }
  sourcePill.textContent = host;
  resultsSection.classList.remove("hidden");
  applyFiltersAndRender();

  [filterName, filterLevel, filterBroad, filterMode, filterDept].forEach(el => {
    el.removeEventListener("input", applyFiltersAndRender);
    el.addEventListener("input", applyFiltersAndRender);
  });
}

function applyFiltersAndRender() {
  const name  = filterName.value.toLowerCase();
  const level = filterLevel.value;
  const broad = filterBroad.value;
  const mode  = filterMode.value;
  const dept  = filterDept.value.toLowerCase();

  let filtered = allPrograms.filter(p => {
    if (name  && !p.name?.toLowerCase().includes(name))       return false;
    if (level && p.level !== level)                            return false;
    if (broad && p.broad_subject !== broad)                    return false;
    if (mode  && p.mode !== mode)                              return false;
    if (dept  && !p.department?.toLowerCase().includes(dept))  return false;
    return true;
  });

  if (sortCol) {
    filtered = [...filtered].sort((a, b) => {
      const av = (a[sortCol] ?? "").toLowerCase();
      const bv = (b[sortCol] ?? "").toLowerCase();
      return av < bv ? -sortDir : av > bv ? sortDir : 0;
    });
  }

  resultCount.textContent = filtered.length;
  renderTable(filtered);
}

function renderTable(programs) {
  if (programs.length === 0) {
    tableBody.innerHTML = "";
    noResults.classList.remove("hidden");
    return;
  }
  noResults.classList.add("hidden");

  tableBody.innerHTML = programs.map(p => `
    <tr>
      <td class="name-cell">${esc(p.name ?? "-")}</td>
      <td>${levelBadge(p.level)}</td>
      <td>${p.department ? esc(p.department) : '<span class="nil">-</span>'}</td>
      <td>${p.broad_subject  ? `<span class="chip">${esc(p.broad_subject)}</span>`  : '<span class="nil">-</span>'}</td>
      <td>${p.narrow_subject ? `<span class="chip">${esc(p.narrow_subject)}</span>` : '<span class="nil">-</span>'}</td>
      <td>${p.mode ? `<span class="chip">${esc(p.mode)}</span>` : '<span class="nil">-</span>'}</td>
      <td>${p.url
        ? `<a class="url-link" href="${esc(p.url)}" target="_blank" rel="noopener">Visit -&gt;</a>`
        : '<span class="nil">-</span>'}</td>
    </tr>
  `).join("");
}

function levelBadge(level) {
  const cls = {
    "Bachelor's":       "level-bachelor",
    "Master's":         "level-master",
    "PhD / Doctorate":  "level-phd",
    "Foundation":       "level-foundation",
  }[level] ?? "level-other";
  return `<span class="level-badge ${cls}">${esc(level ?? "-")}</span>`;
}

function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---- Sorting ----------------------------------------------------
document.querySelectorAll("th[data-col]").forEach(th => {
  th.addEventListener("click", () => {
    const col = th.dataset.col;
    sortDir = sortCol === col ? sortDir * -1 : 1;
    sortCol = col;
    document.querySelectorAll("th").forEach(t => t.classList.remove("sorted-asc", "sorted-desc"));
    th.classList.add(sortDir === 1 ? "sorted-asc" : "sorted-desc");
    applyFiltersAndRender();
  });
});

// ---- Export CSV -------------------------------------------------
exportBtn.addEventListener("click", () => {
  if (!allPrograms.length) return;
  const cols = ["name", "level", "department", "broad_subject", "narrow_subject", "mode", "url"];
  const rows = [
    cols.join(","),
    ...allPrograms.map(p =>
      cols.map(c => `"${String(p[c] ?? "").replace(/"/g, '""')}"`).join(",")
    ),
  ];
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const a    = document.createElement("a");
  a.href     = URL.createObjectURL(blob);
  a.download = `uniscrape_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
});

// ---- Clear ------------------------------------------------------
clearBtn.addEventListener("click", () => {
  allPrograms = [];
  urlInput.value = "";
  hideResults();
  clearError();
  [filterName, filterLevel, filterBroad, filterMode, filterDept].forEach(el => el.value = "");
});

// ---- Helpers ----------------------------------------------------
function showStatus(msg, pct) {
  statusSection.classList.remove("hidden");
  statusText.textContent   = msg;
  progressFill.style.width = pct + "%";
}
function hideStatus()  { statusSection.classList.add("hidden"); progressFill.style.width = "0%"; }
function showError(msg){ errorSection.classList.remove("hidden"); errorText.textContent = msg; hideStatus(); }
function clearError()  { errorSection.classList.add("hidden"); }
function hideResults() { resultsSection.classList.add("hidden"); }
function sleep(ms)     { return new Promise(r => setTimeout(r, ms)); }
