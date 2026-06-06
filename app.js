/*
   UniScrape v3.2 - app.js
   Frontend client for the UniScrape backend extraction pipeline.
*/

// Backend extraction config
const EXTRACT_API_URL = "https://api.uniscrape.com/extract";
const EXTRACT_TIMEOUT_MS = 300000; // 5 minutes

const FINANCIAL_AID_STATEMENT = "This university offers some form of financial aid to prospective students. Please always check the specific requirements and restrictions on scholarship availability.";

// State
let allPrograms = [];
let sortCol = null;
let sortDir = 1;

let debugState = {
  rawHtml: "",
  selectedHtml: "",
  markdown: "",
  staticMarkdown: "",
  finalExtractionMarkdown: "",
  rootStrategy: "backend-extract",
  extractionPreview: "",
  warnings: [],
  stats: {},
  apiDiscovery: {
    selectedResponse: "",
    finalSource: "",
  },
  renderApi: {
    attempted: false,
    success: false,
    finalSource: "",
    stats: null,
    warnings: [],
    capturedApis: [],
    responseText: "",
    responseHtml: "",
    error: "",
  },
  backend: {
    pageType: "unknown",
    preparserRan: false,
    markdownCharsBeforePreparser: 0,
    markdownCharsAfterPreparser: 0,
    modelUsed: "",
    source: "",
  },
};

//DOM refs
const urlInput         = document.getElementById("urlInput");
const accessPasswordInput = document.getElementById("accessPassword");
const apiHint          = document.getElementById("apiHint");
const scrapeBtn        = document.getElementById("scrapeBtn");
const statusSection    = document.getElementById("statusSection");
const statusText       = document.getElementById("statusText");
const progressFill     = document.getElementById("progressFill");
const errorSection     = document.getElementById("errorSection");
const errorText        = document.getElementById("errorText");
const retryBtn         = document.getElementById("retryBtn");
const resultsSection   = document.getElementById("resultsSection");
const tableBody        = document.getElementById("tableBody");
const resultCount      = document.getElementById("resultCount");
const sourcePill       = document.getElementById("sourcePill");
const exportBtn        = document.getElementById("exportBtn");
const clearBtn         = document.getElementById("clearBtn");
const noResults        = document.getElementById("noResults");
const modal            = document.getElementById("modal");
const modalTitle       = document.getElementById("modalTitle");
const modalBody        = document.getElementById("modalBody");
const modalClose       = document.getElementById("modalClose");
const filterName       = document.getElementById("filterName");
const filterLevel      = document.getElementById("filterLevel");
const filterBroad      = document.getElementById("filterBroad");
const filterMode       = document.getElementById("filterMode");
const filterScholarship= document.getElementById("filterScholarship");
const filterDept       = document.getElementById("filterDept");
const debugOptionsEl   = document.getElementById("debugOptions");
const debugModeInput   = document.getElementById("debugMode");
const contentModeSelect= document.getElementById("contentMode");
const debugPanel       = document.getElementById("debugPanel");
const debugStatsEl     = document.getElementById("debugStats");
const debugWarningsEl  = document.getElementById("debugWarnings");
const debugWarningsBlock = document.getElementById("debugWarningsBlock");
const downloadRawBtn   = document.getElementById("downloadRawBtn");
const downloadSelectedBtn = document.getElementById("downloadSelectedBtn");
const downloadMarkdownBtn = document.getElementById("downloadMarkdownBtn");
const copyMarkdownBtn  = document.getElementById("copyMarkdownBtn");
const downloadPreviewBtn = document.getElementById("downloadPreviewBtn");
const downloadApiResponseBtn = document.getElementById("downloadApiResponseBtn");
const downloadFinalMdBtn = document.getElementById("downloadFinalMdBtn");

//Persist settings
if (accessPasswordInput) {
  accessPasswordInput.value = localStorage.getItem("uniscrape_access_password") || "";
  accessPasswordInput.addEventListener("change", () => {
    localStorage.setItem("uniscrape_access_password", accessPasswordInput.value.trim());
  });
}

let debugUiVisible = false;
let debugKeySeqIndex = 0;
let debugKeySeqAt = 0;

if (debugModeInput) {
  debugModeInput.checked = localStorage.getItem("uniscrape_debug") === "1";
  debugModeInput.addEventListener("change", () => {
    localStorage.setItem("uniscrape_debug", debugModeInput.checked ? "1" : "0");
    if (!debugModeInput.checked) hideDebugPanel();
  });
}
if (contentModeSelect) {
  contentModeSelect.value = localStorage.getItem("uniscrape_content_mode") || "auto";
  contentModeSelect.addEventListener("change", () => {
    localStorage.setItem("uniscrape_content_mode", contentModeSelect.value);
  });
}

loadDebugUiVisibility();
initDebugKeyboardShortcut();

if (downloadRawBtn) downloadRawBtn.addEventListener("click", () => downloadTextFile("uniscrape_raw_html.txt", debugState.rawHtml));
if (downloadSelectedBtn) downloadSelectedBtn.addEventListener("click", () => downloadTextFile("uniscrape_selected_html.txt", debugState.selectedHtml));
if (downloadMarkdownBtn) downloadMarkdownBtn.addEventListener("click", () => downloadTextFile("uniscrape_markdown.txt", debugState.markdown));
if (downloadPreviewBtn) downloadPreviewBtn.addEventListener("click", () => downloadTextFile("uniscrape_extraction_preview.txt", debugState.extractionPreview));
if (downloadApiResponseBtn) downloadApiResponseBtn.addEventListener("click", () => downloadTextFile("uniscrape_api_response.txt", debugState.apiDiscovery.selectedResponse || (debugState.renderApi.capturedApis?.length ? JSON.stringify(debugState.renderApi.capturedApis, null, 2) : "") || debugState.renderApi.responseHtml || debugState.renderApi.responseText));
if (downloadFinalMdBtn) downloadFinalMdBtn.addEventListener("click", () => downloadTextFile("uniscrape_final_extraction_markdown.txt", debugState.finalExtractionMarkdown || debugState.markdown));
if (copyMarkdownBtn) copyMarkdownBtn.addEventListener("click", copyMarkdownPreview);

let statusSequenceTimer = null;

function startStatusSequence(messages, intervalMs = 3500) {
  stopStatusSequence();

  if (!Array.isArray(messages) || !messages.length) {
    return;
  }

  let index = 0;
  showStatus(messages[index].text, messages[index].progress);

  statusSequenceTimer = setInterval(() => {
    index = Math.min(index + 1, messages.length - 1);
    showStatus(messages[index].text, messages[index].progress);

    if (index >= messages.length - 1) {
      stopStatusSequence();
    }
  }, intervalMs);
}

function stopStatusSequence() {
  if (statusSequenceTimer) {
    clearInterval(statusSequenceTimer);
    statusSequenceTimer = null;
  }
}

async function useBackendExtract(url, debugOnly) {
  const password = accessPasswordInput?.value?.trim() || "";

  if (!password) {
    throw new Error("Please enter the access password.");
  }

  const res = await fetch(EXTRACT_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      password,
      debug: debugOnly,
    }),
    signal: AbortSignal.timeout(EXTRACT_TIMEOUT_MS),
  });

  const data = await res.json().catch(() => null);

  if (res.status === 401) {
    throw new Error("Incorrect password. Please check and try again.");
  }

  if (res.status === 422) {
    updateDebugStateFromBackend(data);
    throw new Error(data?.detail || "Model returned no valid programs.");
  }

  if (!res.ok) {
    throw new Error(data?.detail || "Backend extraction failed with HTTP " + res.status);
  }

  if (!data) {
    throw new Error("Backend returned an empty response.");
  }

  updateDebugStateFromBackend(data);
  return data;
}

function updateDebugStateFromBackend(data) {
  if (!data || typeof data !== "object") return;

  if (data.markdown) {
    debugState.finalExtractionMarkdown = data.markdown;
    debugState.markdown = data.markdown;
  }

  if (data.renderStats) {
    debugState.renderApi.stats = data.renderStats;
    debugState.renderApi.attempted = true;
    debugState.renderApi.success = true;
  }

  if (Array.isArray(data.warnings)) {
    debugState.warnings = data.warnings;
    debugState.renderApi.warnings = data.warnings;
  }

  debugState.backend.pageType = data.pageType || "unknown";
  debugState.backend.preparserRan = Boolean(data.preparserRan);
  debugState.backend.markdownCharsBeforePreparser = Number(data.markdownCharsBeforePreparser || 0);
  debugState.backend.markdownCharsAfterPreparser = Number(data.markdownCharsAfterPreparser || 0);
  debugState.backend.modelUsed = data.modelUsed || "";
  debugState.backend.source = data.source || "backend";

  debugState.apiDiscovery.finalSource = data.source || "backend";
  debugState.renderApi.finalSource = data.source || "backend";
}

// Main flow
scrapeBtn.addEventListener("click", runScrape);
retryBtn.addEventListener("click", () => { clearError(); runScrape(); });
urlInput.addEventListener("keydown", e => { if (e.key === "Enter") runScrape(); });

async function runScrape() {
  const url = urlInput.value.trim();
  const debugOnly = isDebugMode();

  resetDebugState();
  clearError();
  hideResults();
  hideDebugPanel();

  if (!url) return showError("Please enter a URL.");

  try {
    new URL(url);
  } catch {
    return showError("That does not look like a valid URL.");
  }

  scrapeBtn.disabled = true;
  startStatusSequence([
    { text: "Connecting to UniScrape backend...", progress: 12 },
    { text: "Rendering page with Playwright...", progress: 24 },
    { text: "Capturing stable page content...", progress: 36 },
    { text: "Filtering noisy scripts and assets...", progress: 48 },
    { text: "Building extraction markdown...", progress: 60 },
    { text: "Sending content to the model...", progress: 72 },
    { text: "Parsing structured JSON response...", progress: 84 },
  ]);

  let programs = [];

  try {
    const result = await useBackendExtract(url, debugOnly);

    if (debugOnly) {
      stopStatusSequence();
      renderDebugPanel();
      scrapeBtn.disabled = false;
      showStatus("Debug mode - content prepared. Model call skipped.", 100);
      setTimeout(() => hideStatus(), 1500);
      return;
    }

    programs = Array.isArray(result.programs) ? result.programs : [];

    if (!programs.length) {
      stopStatusSequence();
      scrapeBtn.disabled = false;
      if (isDebugMode()) renderDebugPanel();
      return showError("No programs were extracted. Enable debug mode and re-run to inspect what the backend received.");
    }
  } catch (e) {
    stopStatusSequence();
    scrapeBtn.disabled = false;
    if (isDebugMode()) renderDebugPanel();
    return showError("Extraction failed: " + e.message);
  }

  stopStatusSequence();
  showStatus("Mapping subjects...", 82);

  programs = programs.map(p => {
    p = mapSubjects(p);
    p = applyFinancialAidStatement(p);
    return p;
  });

  showStatus("Rendering results...", 96);
  allPrograms = programs;

  await sleep(250);
  hideStatus();
  renderResults(url);
  scrapeBtn.disabled = false;
}

// Financial aid display helper
function applyFinancialAidStatement(p) {
  if (p.financial_aid === "FINANCIAL_AID_AVAILABLE") {
    p.financial_aid = FINANCIAL_AID_STATEMENT;
  }
  return p;
}

// Debug state and UI helpers
function resetDebugState() {
  debugState.rawHtml = "";
  debugState.selectedHtml = "";
  debugState.markdown = "";
  debugState.staticMarkdown = "";
  debugState.finalExtractionMarkdown = "";
  debugState.rootStrategy = "backend-extract";
  debugState.extractionPreview = "";
  debugState.warnings = [];
  debugState.stats = {};
  debugState.apiDiscovery = {
    selectedResponse: "",
    finalSource: "",
  };
  debugState.renderApi = {
    attempted: false,
    success: false,
    finalSource: "",
    stats: null,
    warnings: [],
    capturedApis: [],
    responseText: "",
    responseHtml: "",
    error: "",
  };
  debugState.backend = {
    pageType: "unknown",
    preparserRan: false,
    markdownCharsBeforePreparser: 0,
    markdownCharsAfterPreparser: 0,
    modelUsed: "",
    source: "",
  };
}

function isDebugMenuVisible() {
  return debugUiVisible;
}

function loadDebugUiVisibility() {
  const stored = localStorage.getItem("uniscrape_debug_visible");
  const isDevHost = location.hostname === "localhost" || location.hostname === "127.0.0.1";

  debugUiVisible = isDevHost && stored === "1";
  localStorage.setItem("uniscrape_debug_visible", debugUiVisible ? "1" : "0");
  applyDebugUiVisibility();
}

function applyDebugUiVisibility() {
  if (!debugOptionsEl) return;

  debugOptionsEl.classList.toggle("debug-options--visible", debugUiVisible);

  if (!debugUiVisible) {
    hideDebugPanel();
    if (debugModeInput) {
      debugModeInput.checked = false;
      localStorage.setItem("uniscrape_debug", "0");
    }
  }
}

function toggleDebugUiVisibility(forceVisible = null) {
  debugUiVisible = forceVisible === null ? !debugUiVisible : Boolean(forceVisible);
  localStorage.setItem("uniscrape_debug_visible", debugUiVisible ? "1" : "0");
  applyDebugUiVisibility();

  if (debugUiVisible && isDebugMode() && (debugState.finalExtractionMarkdown || debugState.markdown)) {
    renderDebugPanel();
  }
}

function initDebugKeyboardShortcut() {
  const SEQ_WINDOW_MS = 1500;
  const matchesStep = (e, step) => {
    if (step === 0) return e.key === "Shift";
    if (step === 1) return e.key.toLowerCase() === "d";
    if (step === 2) return e.key.toLowerCase() === "b";
    return false;
  };

  document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "d") {
      e.preventDefault();
      toggleDebugUiVisibility();
      return;
    }

    if (e.target.closest("input, textarea, select")) return;
    if (e.repeat) return;

    const now = Date.now();
    if (debugKeySeqIndex > 0 && now - debugKeySeqAt > SEQ_WINDOW_MS) {
      debugKeySeqIndex = 0;
    }

    if (!matchesStep(e, debugKeySeqIndex)) {
      debugKeySeqIndex = matchesStep(e, 0) ? 1 : 0;
      debugKeySeqAt = now;
      return;
    }

    debugKeySeqAt = now;
    debugKeySeqIndex++;

    if (debugKeySeqIndex >= 3) {
      debugKeySeqIndex = 0;
      e.preventDefault();
      toggleDebugUiVisibility();
    }
  });
}

window.uniScrapeShowDebug = () => toggleDebugUiVisibility(true);
window.uniScrapeHideDebug = () => toggleDebugUiVisibility(false);
window.uniScrapeToggleDebug = () => toggleDebugUiVisibility();

function isDebugMode() {
  return debugUiVisible && Boolean(debugModeInput?.checked);
}

function downloadTextFile(filename, content) {
  const blob = new Blob([content || ""], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
}

async function copyMarkdownPreview() {
  if (!copyMarkdownBtn) return;
  const source = debugState.finalExtractionMarkdown || debugState.markdown || "";
  const text = source.slice(0, 8000) + (source.length > 8000 ? "\n\n[...]" : "");
  try {
    await navigator.clipboard.writeText(text);
    copyMarkdownBtn.textContent = "Copied!";
    setTimeout(() => { copyMarkdownBtn.textContent = "Copy Markdown Preview"; }, 2000);
  } catch {
    alert("Could not copy to clipboard.");
  }
}

function renderDebugPanel() {
  if (!isDebugMode() || !debugPanel || !debugStatsEl) return;

  const rd = debugState.renderApi || {};
  const be = debugState.backend || {};
  const stats = rd.stats || {};
  const markdown = debugState.finalExtractionMarkdown || debugState.markdown || "";

  debugStatsEl.innerHTML = [
    `<div><span class="debug-k">Final extraction markdown</span> ${markdown.length.toLocaleString()} chars</div>`,
    `<div><span class="debug-k">Backend page type</span> ${esc(be.pageType || "unknown")}</div>`,
    `<div><span class="debug-k">Backend preparser ran</span> ${be.preparserRan ? "yes" : "no"}</div>`,
    be.markdownCharsBeforePreparser ? `<div><span class="debug-k">Markdown before preparser</span> ${Number(be.markdownCharsBeforePreparser).toLocaleString()} chars</div>` : "",
    be.markdownCharsAfterPreparser ? `<div><span class="debug-k">Markdown after preparser</span> ${Number(be.markdownCharsAfterPreparser).toLocaleString()} chars</div>` : "",
    be.modelUsed ? `<div><span class="debug-k">Model used</span> ${esc(be.modelUsed)}</div>` : "",
    `<div><span class="debug-k">Final content source</span> ${esc(be.source || rd.finalSource || "backend")}</div>`,
    stats.snapshotChosen ? `<div><span class="debug-k">Snapshot chosen</span> ${esc(stats.snapshotChosen)}</div>` : "",
    stats.initialSnapshotScore !== undefined ? `<div><span class="debug-k">Initial snapshot score</span> ${stats.initialSnapshotScore}</div>` : "",
    stats.interactedSnapshotScore !== undefined ? `<div><span class="debug-k">Interacted snapshot score</span> ${stats.interactedSnapshotScore}</div>` : "",
    stats.finalPageUrl ? `<div><span class="debug-k">Final page URL</span> ${esc(stats.finalPageUrl)}</div>` : "",
    stats.textLength !== undefined ? `<div><span class="debug-k">Render text length</span> ${Number(stats.textLength).toLocaleString()} chars</div>` : "",
    stats.linkCount !== undefined ? `<div><span class="debug-k">Render links</span> ${stats.linkCount}</div>` : "",
    stats.programLinkCount !== undefined ? `<div><span class="debug-k">Render program links</span> ${stats.programLinkCount}</div>` : "",
    stats.programCardCount !== undefined ? `<div><span class="debug-k">Render program cards</span> ${stats.programCardCount}</div>` : "",
    stats.capturedApiCount !== undefined ? `<div><span class="debug-k">Captured APIs</span> ${stats.capturedApiCount}</div>` : "",
    stats.htmlLength !== undefined ? `<div><span class="debug-k">Rendered HTML</span> ${Number(stats.htmlLength).toLocaleString()} chars</div>` : "",
    stats.renderTimeMs !== undefined ? `<div><span class="debug-k">Render time</span> ${Number(stats.renderTimeMs).toLocaleString()} ms</div>` : "",
    rd.error ? `<div><span class="debug-k">Backend error</span> ${esc(rd.error)}</div>` : "",
  ].filter(Boolean).join("");

  const warnings = [];
  if (Array.isArray(debugState.warnings)) warnings.push(...debugState.warnings);
  if (Array.isArray(rd.warnings)) warnings.push(...rd.warnings.map(w => "Render backend: " + w));

  if (warnings.length && debugWarningsEl) {
    debugWarningsEl.innerHTML = warnings.map(w => `<li>${esc(w)}</li>`).join("");
    debugWarningsBlock?.classList.remove("hidden");
  } else if (debugWarningsEl) {
    debugWarningsEl.innerHTML = "";
    debugWarningsBlock?.classList.add("hidden");
  }

  const hasApi = Boolean(debugState.apiDiscovery.selectedResponse || rd.responseHtml || rd.responseText || rd.capturedApis?.length);
  downloadApiResponseBtn?.classList.toggle("hidden", !hasApi);
  downloadFinalMdBtn?.classList.toggle("hidden", !markdown);

  debugPanel.classList.remove("hidden");
}

function hideDebugPanel() {
  debugPanel?.classList.add("hidden");
}

//Subject mapping
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

//Render results
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
  const name  = filterName.value.toLowerCase();
  const level = filterLevel.value;
  const broad = filterBroad.value;
  const mode  = filterMode.value;
  const schol = filterScholarship.value;
  const dept  = filterDept.value.toLowerCase();

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
      <td>${p.location ? esc(p.location) : '<span class="nil">-</span>'}</td>
      <td>${p.intake_dates ? esc(p.intake_dates) : '<span class="nil">-</span>'}</td>
      <td>${feeCell(p)}</td>
      <td>${p.entry_ielts ? esc(p.entry_ielts) : '<span class="nil">-</span>'}</td>
      <td>${scholarshipCell(p.scholarship)}</td>
      <td><button class="expand-btn" data-idx="${i}">View all</button></td>
      <td>${p.url
        ? `<a class="url-link" href="${esc(p.url)}" target="_blank" rel="noopener">Visit -&gt;</a>`
        : '<span class="nil">-</span>'}</td>
    </tr>
  `).join("");

  tableBody._filtered = programs;
  tableBody.querySelectorAll(".expand-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      openModal(tableBody._filtered[parseInt(btn.dataset.idx)]);
    });
  });
}

function feeCell(p) {
  if (!p.fee_international && !p.fee_domestic) return '<span class="nil">-</span>';
  const curr = p.currency ? ` ${esc(p.currency)}` : "";
  if (p.fee_international) return `<span class="chip">${esc(p.fee_international)}${curr}</span>`;
  return `<span class="chip">${esc(p.fee_domestic)}${curr}</span>`;
}

function scholarshipCell(val) {
  if (val === "Yes") return '<span class="chip chip-green">Yes</span>';
  if (val === "No")  return '<span class="chip chip-red">No</span>';
  return '<span class="nil">-</span>';
}

function levelBadge(level) {
  const cls = {
    "Bachelor's":         "level-bachelor",
    "Master's":           "level-master",
    "PhD / Doctorate":    "level-phd",
    "Foundation":         "level-foundation",
    "Certificate / Diploma": "level-other",
  }[level] ?? "level-other";
  return `<span class="level-badge ${cls}">${esc(level ?? "-")}</span>`;
}

//Modal
function openModal(p) {
  modalTitle.textContent = p.name ?? "Program Details";

  const section = (title) => `<div class="modal-section-title">${title}</div>`;

  const row = (key, val, isHtml) => {
    const display = val
      ? (isHtml ? val : esc(String(val)))
      : '<span class="nil">N/A</span>';
    return `<div class="modal-row"><span class="modal-key">${key}</span><span class="modal-val">${display}</span></div>`;
  };

  // Description gets its own styled block - rendered as HTML since it may contain formatting
  const descBlock = p.description
    ? `${section("Program Description")}<div class="modal-description">${p.description}</div>`
    : "";

  modalBody.innerHTML = `
    ${section("Program")}
    ${row("Name",           p.name)}
    ${row("Level",          p.level)}
    ${row("Faculty",        p.faculty)}
    ${row("Department",     p.department)}
    ${row("Broad Subject",  p.broad_subject)}
    ${row("Narrow Subject", p.narrow_subject)}
    ${row("Mode",           p.mode)}
    ${row("Location",       p.location)}
    ${row("Duration",       p.duration)}
    ${row("Language",       p.language_of_instruction)}
    ${row("Accreditation",  p.accreditation)}
    ${row("Program URL",    p.url ? `<a class="url-link" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.url)}</a>` : "", true)}

    ${descBlock}

    ${section("Intakes and Deadlines")}
    ${row("Intake Dates",          p.intake_dates)}
    ${row("Application Deadline",  p.application_deadline)}

    ${section("Tuition Fees")}
    ${row("Currency",              p.currency)}
    ${row("Fee Period",            p.fee_per)}
    ${row("International",         p.fee_international)}
    ${row("Domestic / Local",      p.fee_domestic)}
    ${row("EU Students",           p.fee_eu)}
    ${row("In-State (US)",         p.fee_state)}
    ${row("Out-of-State (US)",     p.fee_out_of_state)}

    ${section("Financial Aid")}
    ${row("Financial Aid",         p.financial_aid)}
    ${row("Scholarship Available", p.scholarship)}
    ${row("Scholarship Details",   p.scholarship_details)}

    ${section("Entry Requirements")}
    ${row("General Requirements",        p.entry_requirements_general)}
    ${row("International Requirements",  p.entry_requirements_international)}
    ${row("A-Levels",                    p.entry_alevel)}
    ${row("IB Diploma",                  p.entry_ib)}
    ${row("GPA",                         p.entry_gpa)}
    ${row("SAT",                         p.entry_sat)}
    ${row("ACT",                         p.entry_act)}
    ${row("IELTS",                       p.entry_ielts)}
    ${row("TOEFL",                       p.entry_toefl)}
    ${row("PTE Academic",                p.entry_pte)}
    ${row("Duolingo",                    p.entry_duolingo)}
    ${row("Cambridge English",           p.entry_cambridge)}
    ${row("Other English",               p.entry_other_english)}
    ${row("GRE",                         p.entry_gre)}
    ${row("GMAT",                        p.entry_gmat)}
    ${row("Work Experience",             p.entry_work_experience)}

    ${section("Application Requirements")}
    ${row("References / Rec. Letters", p.rec_letter)}
    ${row("Personal Statement",        p.personal_statement)}
    ${row("Portfolio",                 p.portfolio)}
    ${row("Interview",                 p.interview)}
  `;

  modal.classList.remove("hidden");
}

modalClose.addEventListener("click", () => modal.classList.add("hidden"));
modal.addEventListener("click", e => { if (e.target === modal) modal.classList.add("hidden"); });
document.addEventListener("keydown", e => { if (e.key === "Escape") modal.classList.add("hidden"); });

//Sorting
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

//Export CSV
exportBtn.addEventListener("click", () => {
  if (!allPrograms.length) return;
  const cols = [
    "name", "level", "faculty", "department", "broad_subject", "narrow_subject",
    "location", "mode", "duration", "language_of_instruction",
    "intake_dates", "application_deadline",
    "fee_international", "fee_domestic", "fee_eu", "fee_state", "fee_out_of_state", "fee_per", "currency",
    "financial_aid", "scholarship", "scholarship_details",
    "entry_requirements_general", "entry_requirements_international",
    "entry_alevel", "entry_ib", "entry_gpa", "entry_sat", "entry_act",
    "entry_ielts", "entry_toefl", "entry_pte", "entry_duolingo", "entry_cambridge", "entry_other_english",
    "entry_gre", "entry_gmat", "entry_work_experience",
    "rec_letter", "personal_statement", "portfolio", "interview",
    "accreditation", "description", "url"
  ];
  const rows = [
    cols.join(","),
    ...allPrograms.map(p =>
      cols.map(c => {
        // Strip HTML tags from description for CSV readability
        let val = String(p[c] ?? "");
        if (c === "description") val = val.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
        return `"${val.replace(/"/g, '""')}"`;
      }).join(",")
    ),
  ];
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const a    = document.createElement("a");
  a.href     = URL.createObjectURL(blob);
  a.download = `uniscrape-v3.1_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
});

//Clear
clearBtn.addEventListener("click", () => {
  allPrograms = [];
  urlInput.value = "";
  hideResults();
  clearError();
  hideDebugPanel();
  [filterName, filterLevel, filterBroad, filterMode, filterScholarship, filterDept].forEach(el => el.value = "");
});

//Helpers
function showStatus(msg, pct) {
  statusSection.classList.remove("hidden");
  statusText.textContent   = msg;
  progressFill.style.width = pct + "%";
}
function hideStatus()  { statusSection.classList.add("hidden"); progressFill.style.width = "0%"; }
function showError(m)  {
  errorSection.classList.remove("hidden");
  errorText.textContent = m;
  retryBtn.classList.remove("hidden");
  hideStatus();
}
function clearError()  {
  errorSection.classList.add("hidden");
  retryBtn.classList.add("hidden");
}
function hideResults() { resultsSection.classList.add("hidden"); }
function sleep(ms)     { return new Promise(r => setTimeout(r, ms)); }
function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}