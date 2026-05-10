/* ---------------------------------------------------------------
   UniScrape v2.0 - app.js
   Supports both Anthropic and Google Gemini APIs.
   Extracts programs from university pages via Cloudflare Worker proxy.
---------------------------------------------------------------- */

// ---- Config -----------------------------------------------------
const MAX_HTML_CHARS = 120000;

// IMPORTANT: Paste your Cloudflare Worker URL here.
// It looks like: https://uniscrape-proxy.yourname.workers.dev
const WORKER_URL = "YOUR_WORKER_URL_HERE";

const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
const GEMINI_MODEL    = "gemini-1.5-pro-latest";
const GEMINI_URL      = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// ---- State ------------------------------------------------------
let allPrograms = [];
let sortCol     = null;
let sortDir     = 1;

// ---- DOM refs ---------------------------------------------------
const urlInput        = document.getElementById("urlInput");
const apiProvider     = document.getElementById("apiProvider");
const apiKeyInput     = document.getElementById("apiKeyInput");
const apiHint         = document.getElementById("apiHint");
const scrapeBtn       = document.getElementById("scrapeBtn");
const statusSection   = document.getElementById("statusSection");
const statusText      = document.getElementById("statusText");
const progressFill    = document.getElementById("progressFill");
const errorSection    = document.getElementById("errorSection");
const errorText       = document.getElementById("errorText");
const resultsSection  = document.getElementById("resultsSection");
const tableBody       = document.getElementById("tableBody");
const resultCount     = document.getElementById("resultCount");
const sourcePill      = document.getElementById("sourcePill");
const exportBtn       = document.getElementById("exportBtn");
const clearBtn        = document.getElementById("clearBtn");
const noResults       = document.getElementById("noResults");
const modal           = document.getElementById("modal");
const modalTitle      = document.getElementById("modalTitle");
const modalBody       = document.getElementById("modalBody");
const modalClose      = document.getElementById("modalClose");

const filterName       = document.getElementById("filterName");
const filterLevel      = document.getElementById("filterLevel");
const filterBroad      = document.getElementById("filterBroad");
const filterMode       = document.getElementById("filterMode");
const filterScholarship= document.getElementById("filterScholarship");
const filterDept       = document.getElementById("filterDept");

// ---- Persist settings -------------------------------------------
apiProvider.value  = localStorage.getItem("uniscrape_provider") || "anthropic";
apiKeyInput.value  = localStorage.getItem("uniscrape_key_" + apiProvider.value) || "";
updateHint();

apiProvider.addEventListener("change", () => {
  localStorage.setItem("uniscrape_provider", apiProvider.value);
  apiKeyInput.value = localStorage.getItem("uniscrape_key_" + apiProvider.value) || "";
  updateHint();
});
apiKeyInput.addEventListener("change", () => {
  localStorage.setItem("uniscrape_key_" + apiProvider.value, apiKeyInput.value.trim());
});

function updateHint() {
  if (apiProvider.value === "anthropic") {
    apiHint.innerHTML = 'Get a key at - <a href="https://console.anthropic.com" target="_blank" rel="noopener">console.anthropic.com</a>';
  } else {
    apiHint.innerHTML = 'Get a key at - <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener">aistudio.google.com</a>';
  }
}

// ---- Main flow --------------------------------------------------
scrapeBtn.addEventListener("click", runScrape);
urlInput.addEventListener("keydown", e => { if (e.key === "Enter") runScrape(); });

async function runScrape() {
  const url    = urlInput.value.trim();
  const apiKey = apiKeyInput.value.trim();
  const provider = apiProvider.value;

  clearError();
  hideResults();

  if (!url)    return showError("Please enter a URL.");
  if (!apiKey) return showError("Please enter your API key.");
  try { new URL(url); } catch { return showError("That does not look like a valid URL."); }

  if (WORKER_URL === "YOUR_WORKER_URL_HERE") {
    return showError("Worker URL not set. Open app.js and paste your Cloudflare Worker URL into the WORKER_URL variable at the top.");
  }

  scrapeBtn.disabled = true;
  showStatus("Fetching page content...", 10);

  let html;
  try {
    html = await fetchWithWorker(url);
  } catch (e) {
    scrapeBtn.disabled = false;
    return showError("Could not fetch the page: " + e.message + ". Make sure your Cloudflare Worker is deployed and the URL is correct.");
  }

  showStatus("Extracting program data...", 40);

  let programs;
  try {
    if (provider === "anthropic") {
      programs = await extractWithAnthropic(html, url, apiKey);
    } else {
      programs = await extractWithGemini(html, url, apiKey);
    }
  } catch (e) {
    scrapeBtn.disabled = false;
    return showError("Extraction failed: " + e.message);
  }

  showStatus("Mapping subjects...", 82);
  programs = programs.map(p => mapSubjects(p));

  showStatus("Rendering results...", 96);
  allPrograms = programs;

  await sleep(250);
  hideStatus();
  renderResults(url);
  scrapeBtn.disabled = false;
}

// ---- Fetch via Cloudflare Worker --------------------------------
async function fetchWithWorker(url) {
  const proxyUrl = WORKER_URL.replace(/\/$/, "") + "?url=" + encodeURIComponent(url);
  let res;
  try {
    res = await fetch(proxyUrl, { signal: AbortSignal.timeout(25000) });
  } catch (e) {
    throw new Error("Could not reach the proxy worker: " + e.message);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "Worker returned HTTP " + res.status);
  if (!data?.contents || typeof data.contents !== "string") throw new Error("Unexpected response from worker.");
  return data.contents;
}

// ---- Shared extraction prompt -----------------------------------
function buildPrompt(sourceUrl) {
  return `You are a precise data extraction tool. Extract all academic programs from the university HTML page below.

Return ONLY a valid JSON array. No markdown, no code fences, no explanation - just the raw JSON array.

Each object must have exactly these keys:
- "name"             : full program name (string)
- "url"              : direct URL to this specific program page. Resolve relative URLs against ${sourceUrl}. Use "" if not found.
- "department"       : department or school name if mentioned, otherwise ""
- "level"            : exactly one of: "Bachelor's", "Master's", "PhD / Doctorate", "Foundation", "Certificate / Diploma", "Other"
- "mode"             : exactly one of: "On-campus", "Online", "Blended", "" (use "" if not stated)
- "start_date"       : start date or intake period if mentioned (e.g. "September 2025", "January / September"), otherwise ""
- "duration"         : duration of the program if mentioned (e.g. "3 years", "18 months"), otherwise ""
- "tuition_fee"      : tuition fee if mentioned. Include the amount and any distinction between local/international if stated. Otherwise ""
- "currency"         : currency of the tuition fee if mentioned (e.g. "GBP", "USD", "EUR"), otherwise ""
- "scholarship"      : "Yes" if scholarships are mentioned for this program, "No" if explicitly stated none, "" if not mentioned
- "rec_letter"       : "Yes" if a recommendation letter is required, "No" if explicitly not required, "" if not mentioned
- "entry_requirements": brief summary of entry requirements if stated, otherwise ""
- "narrow_subject"   : leave as "" (filled in automatically)
- "broad_subject"    : leave as "" (filled in automatically)

Rules:
- Only include genuine academic programs. Skip news, events, staff pages, login links, FAQs, etc.
- Do not invent data. If a field is not on the page use "".
- Remove duplicates - same name and level = include once.
- Normalise level: BSc / BA / BEng / BComm = "Bachelor's" - MSc / MA / MBA / MRes / PgDip / PgCert = "Master's" - PhD / DPhil / DBA / Doctorate = "PhD / Doctorate"
- Return every program you can find.

Source URL: ${sourceUrl}`;
}

// ---- Anthropic extraction ---------------------------------------
async function extractWithAnthropic(rawHtml, sourceUrl, apiKey) {
  const cleaned = cleanHtml(rawHtml);
  const prompt  = buildPrompt(sourceUrl);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 8192,
      system: prompt,
      messages: [{ role: "user", content: "HTML:\n" + cleaned }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Anthropic API error " + res.status);
  }

  const data = await res.json();
  return parseJsonResponse(data?.content?.[0]?.text ?? "");
}

// ---- Gemini extraction ------------------------------------------
async function extractWithGemini(rawHtml, sourceUrl, apiKey) {
  const cleaned = cleanHtml(rawHtml);
  const prompt  = buildPrompt(sourceUrl) + "\n\nHTML:\n" + cleaned;

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Gemini API error " + res.status);
  }

  const data = await res.json();
  return parseJsonResponse(data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "");
}

// ---- Shared helpers ---------------------------------------------
function cleanHtml(raw) {
  let c = raw
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s{3,}/g, "  ");
  if (c.length > MAX_HTML_CHARS) c = c.slice(0, MAX_HTML_CHARS) + "\n\n[...truncated...]";
  return c;
}

function parseJsonResponse(raw) {
  const jsonStr = raw
    .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    const match = jsonStr.match(/\[[\s\S]*\]/);
    if (match) {
      try { parsed = JSON.parse(match[0]); }
      catch { throw new Error("Could not parse response as JSON. Try a page that lists all programs on one page."); }
    } else {
      throw new Error("No program data found. Try a URL that lists all programs on one page.");
    }
  }
  if (!Array.isArray(parsed)) throw new Error("Unexpected response shape.");
  return parsed;
}

// ---- Subject mapping --------------------------------------------
function mapSubjects(program) {
  if (typeof SUBJECT_MAP === "undefined") return { ...program };
  const key = (program.name ?? "").toLowerCase().trim();
  if (SUBJECT_MAP[key]) {
    const s = SUBJECT_MAP[key];
    return { ...program, narrow_subject: s.narrow || "", broad_subject: s.broad || "" };
  }
  const found = Object.entries(SUBJECT_MAP).find(([k]) => k.length > 4 && (key.includes(k) || k.includes(key)));
  if (found) {
    const s = found[1];
    return { ...program, narrow_subject: s.narrow || "", broad_subject: s.broad || "" };
  }
  return { ...program, narrow_subject: program.narrow_subject || "", broad_subject: program.broad_subject || "" };
}

// ---- Render -----------------------------------------------------
function renderResults(sourceUrl) {
  let host;
  try { host = new URL(sourceUrl).hostname; } catch { host = sourceUrl; }
  sourcePill.textContent = host;
  resultsSection.classList.remove("hidden");
  applyFiltersAndRender();

  [filterName, filterLevel, filterBroad, filterMode, filterScholarship, filterDept].forEach(el => {
    el.removeEventListener("input", applyFiltersAndRender);
    el.addEventListener("input", applyFiltersAndRender);
  });
}

function applyFiltersAndRender() {
  const name   = filterName.value.toLowerCase();
  const level  = filterLevel.value;
  const broad  = filterBroad.value;
  const mode   = filterMode.value;
  const schol  = filterScholarship.value;
  const dept   = filterDept.value.toLowerCase();

  let filtered = allPrograms.filter(p => {
    if (name  && !p.name?.toLowerCase().includes(name))       return false;
    if (level && p.level !== level)                            return false;
    if (broad && p.broad_subject !== broad)                    return false;
    if (mode  && p.mode !== mode)                              return false;
    if (schol && p.scholarship !== schol)                      return false;
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

  tableBody.innerHTML = programs.map((p, i) => `
    <tr>
      <td class="col-num">${i + 1}</td>
      <td class="name-cell">${esc(p.name ?? "-")}</td>
      <td>${levelBadge(p.level)}</td>
      <td>${p.department ? esc(p.department) : '<span class="nil">-</span>'}</td>
      <td>${p.broad_subject ? `<span class="chip">${esc(p.broad_subject)}</span>` : '<span class="nil">-</span>'}</td>
      <td>${p.mode ? `<span class="chip">${esc(p.mode)}</span>` : '<span class="nil">-</span>'}</td>
      <td>${p.start_date ? esc(p.start_date) : '<span class="nil">-</span>'}</td>
      <td>${feeCell(p)}</td>
      <td>${scholarshipCell(p.scholarship)}</td>
      <td><button class="expand-btn" data-idx="${i}">View all</button></td>
      <td>${p.url
        ? `<a class="url-link" href="${esc(p.url)}" target="_blank" rel="noopener">Visit -&gt;</a>`
        : '<span class="nil">-</span>'}</td>
    </tr>
  `).join("");

  // Attach expand buttons - store filtered list so index matches
  tableBody._filtered = programs;
  tableBody.querySelectorAll(".expand-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const p = tableBody._filtered[parseInt(btn.dataset.idx)];
      openModal(p);
    });
  });
}

function feeCell(p) {
  if (!p.tuition_fee) return '<span class="nil">-</span>';
  const curr = p.currency ? ` ${esc(p.currency)}` : "";
  return `<span class="chip">${esc(p.tuition_fee)}${curr}</span>`;
}

function scholarshipCell(val) {
  if (val === "Yes") return '<span class="chip chip-green">Yes</span>';
  if (val === "No")  return '<span class="chip chip-red">No</span>';
  return '<span class="nil">-</span>';
}

function levelBadge(level) {
  const cls = {
    "Bachelor's":      "level-bachelor",
    "Master's":        "level-master",
    "PhD / Doctorate": "level-phd",
    "Foundation":      "level-foundation",
  }[level] ?? "level-other";
  return `<span class="level-badge ${cls}">${esc(level ?? "-")}</span>`;
}

// ---- Modal ------------------------------------------------------
function openModal(p) {
  modalTitle.textContent = p.name ?? "Program Details";
  const fields = [
    ["Program Name",       p.name],
    ["Level",              p.level],
    ["Department",         p.department],
    ["Broad Subject",      p.broad_subject],
    ["Narrow Subject",     p.narrow_subject],
    ["Mode",               p.mode],
    ["Start Date",         p.start_date],
    ["Duration",           p.duration],
    ["Tuition Fee",        p.tuition_fee ? `${p.tuition_fee}${p.currency ? " " + p.currency : ""}` : ""],
    ["Scholarship",        p.scholarship],
    ["Rec. Letter",        p.rec_letter],
    ["Entry Requirements", p.entry_requirements],
    ["Program URL",        p.url ? `<a class="url-link" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.url)}</a>` : ""],
  ];

  modalBody.innerHTML = fields.map(([key, val]) => `
    <div class="modal-row">
      <span class="modal-key">${key}</span>
      <span class="modal-val">${val ? (key === "Program URL" ? val : esc(String(val))) : '<span class="nil">N/A</span>'}</span>
    </div>
  `).join("");

  modal.classList.remove("hidden");
}

modalClose.addEventListener("click", () => modal.classList.add("hidden"));
modal.addEventListener("click", e => { if (e.target === modal) modal.classList.add("hidden"); });
document.addEventListener("keydown", e => { if (e.key === "Escape") modal.classList.add("hidden"); });

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
  const cols = ["name", "level", "department", "broad_subject", "narrow_subject", "mode",
                "start_date", "duration", "tuition_fee", "currency", "scholarship",
                "rec_letter", "entry_requirements", "url"];
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
  [filterName, filterLevel, filterBroad, filterMode, filterScholarship, filterDept].forEach(el => el.value = "");
});

// ---- Helpers ----------------------------------------------------
function showStatus(msg, pct) {
  statusSection.classList.remove("hidden");
  statusText.textContent   = msg;
  progressFill.style.width = pct + "%";
}
function hideStatus()  { statusSection.classList.add("hidden"); progressFill.style.width = "0%"; }
function showError(m)  { errorSection.classList.remove("hidden"); errorText.textContent = m; hideStatus(); }
function clearError()  { errorSection.classList.add("hidden"); }
function hideResults() { resultsSection.classList.add("hidden"); }
function sleep(ms)     { return new Promise(r => setTimeout(r, ms)); }
function esc(str) {
  return String(str)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
