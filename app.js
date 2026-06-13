/*
   UniScrape v4.0 - app.js
*/

// Backend extraction config
const EXTRACT_API_URL = "https://api.uniscrape.com/extract";
const VERIFY_ACCESS_API_URL = new URL("/verify-access", EXTRACT_API_URL).toString();
const EXTRACT_TIMEOUT_MS = 300000;
const VERIFY_ACCESS_TIMEOUT_MS = 15000;
const UNISCRAPE_ACCESS_CODE_KEY = "uniscrape.accessCode";
const LEGACY_UNISCRAPE_ACCESS_KEY_KEY = "uniscrape.accessKey";
const UNISCRAPE_ACCESS_VERIFIED_SESSION_KEY = "uniscrapeAccessVerified";
const UNISCRAPE_ACCESS_CODE_SESSION_KEY = "uniscrapeAccessCode";
const INVALID_ACCESS_CODE_MESSAGE = "Invalid access code.";
const ACCESS_CODE_VERIFY_ERROR_MESSAGE = "Could not verify access code. Please try again.";
const FINANCIAL_AID_STATEMENT = "This university offers some form of financial aid to prospective students. Please always check the specific requirements and restrictions on scholarship availability.";
const DEFAULT_CONTENT_MODE = "auto";

// State
let allPrograms = [];
let activeResultsMode = "audit";
let catalogModeEnabled = false;
let contentDiagnosticsEnabled = false;
let sortCol = null;
let sortDir = 1;
let copyValueIdCounter = 0;
const copyValueStore = new Map();
const COPY_FIELD_FEEDBACK_MS = 1000;

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
const contentDiagnosticsToggleInput = document.getElementById("contentDiagnosticsToggle");
const contentModeInputs = Array.from(document.querySelectorAll('input[name="contentMode"]'));
const settingsMenuToggle = document.getElementById("settingsMenuToggle");
const settingsMenuButton = document.querySelector(".settings-menu-button");
const settingsPanel = document.getElementById("settingsPanel");
const settingsMenuBackdrop = document.getElementById("settingsMenuBackdrop");
const catalogToggleInput = document.getElementById("catalogToggle");
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
const accessCodeModal = document.getElementById("accessCodeModal");
const accessCodeInput = document.getElementById("accessCodeInput");
const accessCodeToggle = document.getElementById("accessCodeToggle");
const accessCodeSubmit = document.getElementById("accessCodeSubmit");
const accessCodeCancel = document.getElementById("accessCodeCancel");
const accessCodeError = document.getElementById("accessCodeError");
const countLabel = document.querySelector(".count-label");
const filterBar = document.querySelector(".filter-bar");
const tableHeaderRow = document.querySelector("#programTable thead tr");

const AUDIT_TABLE_HEADER_HTML = `
  <th class="col-num">#</th>
  <th data-col="name">Program Name <span class="sort-icon">&#8597;</span></th>
  <th data-col="level">Level <span class="sort-icon">&#8597;</span></th>
  <th data-col="department">Department <span class="sort-icon">&#8597;</span></th>
  <th data-col="broad_subject">Subject Area <span class="sort-icon">&#8597;</span></th>
  <th data-col="mode">Mode <span class="sort-icon">&#8597;</span></th>
  <th data-col="location">Location <span class="sort-icon">&#8597;</span></th>
  <th data-col="intake_dates">Intakes <span class="sort-icon">&#8597;</span></th>
  <th data-col="fee_international">Intl. Fee <span class="sort-icon">&#8597;</span></th>
  <th data-col="scholarship">Scholarship <span class="sort-icon">&#8597;</span></th>
  <th>Details</th>
  <th>Link</th>
`;

const CATALOG_TABLE_HEADER_HTML = `
  <th class="col-num">#</th>
  <th>Course name</th>
  <th>University name</th>
  <th>Course URL</th>
  <th>Level of study</th>
  <th>Credits</th>
  <th>Credits unit</th>
  <th>Duration</th>
  <th>Fees</th>
  <th>Location</th>
  <th>Language</th>
  <th>Mode of study</th>
`;

const AUDIT_CSV_COLUMNS = [
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

const CATALOG_CSV_COLUMNS = [
  "courseName",
  "universityName",
  "courseUrl",
  "levelOfStudy",
  "credits",
  "creditsUnit",
  "duration",
  "fees",
  "location",
  "language",
  "modeOfStudy"
];

const ACCESS_CODE_SUBMIT_LABEL = "Unlock and Continue";
const ACCESS_CODE_CHECKING_LABEL = "Verifying...";
let pendingAccessCodeRequest = null;
let accessCodeChecking = false;

function showAccessCodeModalElement() {
  if (!accessCodeModal) return;
  accessCodeModal.removeAttribute("hidden");
  accessCodeModal.hidden = false;
  accessCodeModal.classList.remove("hidden");
  accessCodeModal.setAttribute("aria-hidden", "false");
}

function hideAccessCodeModalElement() {
  if (!accessCodeModal) return;
  accessCodeModal.classList.add("hidden");
  accessCodeModal.setAttribute("hidden", "");
  accessCodeModal.setAttribute("aria-hidden", "true");
}

function isAccessCodeModalOpen() {
  return Boolean(accessCodeModal && !accessCodeModal.hidden && !accessCodeModal.classList.contains("hidden"));
}

function syncAccessCodeVisibilityToggle() {
  if (!accessCodeInput || !accessCodeToggle) return;

  const isVisible = accessCodeInput.type === "text";
  accessCodeToggle.classList.toggle("is-visible", isVisible);
  accessCodeToggle.setAttribute("aria-label", isVisible ? "Hide access code" : "Show access code");
  accessCodeToggle.setAttribute("aria-pressed", String(isVisible));
}

//Persist settings
function readSessionValue(key) {
  try {
    return (sessionStorage.getItem(key) || "").trim();
  } catch {
    return "";
  }
}

function writeSessionValue(key, value) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Session storage can be unavailable in hardened browser modes.
  }
}

function removeSessionValue(key) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Ignore storage cleanup failures.
  }
}

function readLocalValue(key) {
  try {
    return (localStorage.getItem(key) || "").trim();
  } catch {
    return "";
  }
}

function removeLocalValue(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage cleanup failures.
  }
}

function getVerifiedAccessCode() {
  const accessCode = readSessionValue(UNISCRAPE_ACCESS_CODE_SESSION_KEY);
  const verified = readSessionValue(UNISCRAPE_ACCESS_VERIFIED_SESSION_KEY) === "true";
  return verified && accessCode ? accessCode : "";
}

function getAccessCodePrefill() {
  return getVerifiedAccessCode()
    || readLocalValue(UNISCRAPE_ACCESS_CODE_KEY)
    || readLocalValue(LEGACY_UNISCRAPE_ACCESS_KEY_KEY);
}

function saveAccessCode(accessCode) {
  const trimmedAccessCode = String(accessCode || "").trim();
  if (!trimmedAccessCode) {
    clearStoredAccessCode();
    return;
  }

  writeSessionValue(UNISCRAPE_ACCESS_VERIFIED_SESSION_KEY, "true");
  writeSessionValue(UNISCRAPE_ACCESS_CODE_SESSION_KEY, trimmedAccessCode);
  removeLocalValue(UNISCRAPE_ACCESS_CODE_KEY);
  removeLocalValue(LEGACY_UNISCRAPE_ACCESS_KEY_KEY);
}

function clearStoredAccessCode() {
  removeSessionValue(UNISCRAPE_ACCESS_VERIFIED_SESSION_KEY);
  removeSessionValue(UNISCRAPE_ACCESS_CODE_SESSION_KEY);
  removeLocalValue(UNISCRAPE_ACCESS_CODE_KEY);
  removeLocalValue(LEGACY_UNISCRAPE_ACCESS_KEY_KEY);
}

let debugUiVisible = true;
let debugKeySeqIndex = 0;
let debugKeySeqAt = 0;
const buttonDefaultLabels = new WeakMap();

initSettingsMenu();

if (debugModeInput) {
  debugModeInput.checked = localStorage.getItem("uniscrape_debug") === "1";
  debugModeInput.addEventListener("change", () => {
    localStorage.setItem("uniscrape_debug", debugModeInput.checked ? "1" : "0");
  });
}
if (contentDiagnosticsToggleInput) {
  contentDiagnosticsToggleInput.checked = false;
  contentDiagnosticsToggleInput.addEventListener("change", () => {
    contentDiagnosticsEnabled = contentDiagnosticsToggleInput.checked;
    if (contentDiagnosticsEnabled) {
      renderDebugPanel();
    } else {
      hideDebugPanel();
    }
  });
}
if (catalogToggleInput) {
  catalogToggleInput.checked = false;
  catalogToggleInput.addEventListener("change", () => {
    catalogModeEnabled = catalogToggleInput.checked;
  });
}
if (contentModeInputs.length) {
  setSelectedContentMode(localStorage.getItem("uniscrape_content_mode") || DEFAULT_CONTENT_MODE);
  contentModeInputs.forEach(input => {
    input.addEventListener("change", () => {
      if (input.checked) localStorage.setItem("uniscrape_content_mode", getSelectedContentMode());
    });
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

function createInvalidAccessCodeError() {
  const error = new Error(INVALID_ACCESS_CODE_MESSAGE);
  error.code = "INVALID_ACCESS_CODE";
  return error;
}

function isInvalidAccessCodeError(error) {
  return error?.code === "INVALID_ACCESS_CODE";
}

async function verifyAccessCode(accessCode) {
  const trimmedAccessCode = String(accessCode || "").trim();

  if (!trimmedAccessCode) {
    throw new Error("Please enter an access code.");
  }

  const res = await fetch(VERIFY_ACCESS_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessCode: trimmedAccessCode }),
    signal: AbortSignal.timeout(VERIFY_ACCESS_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => null);

  if (res.status === 401 || res.status === 403 || data?.valid === false) {
    throw createInvalidAccessCodeError();
  }

  if (!res.ok) {
    throw new Error(data?.detail || "Access verification failed with HTTP " + res.status);
  }

  if (!data || typeof data !== "object") {
    throw new Error("Access verification returned an empty response.");
  }

  if (data.ok === false || data.valid === false) {
    throw createInvalidAccessCodeError();
  }

  if (data.valid !== true) {
    throw new Error("Access verification returned an unexpected response.");
  }

  return data;
}

async function sendBackendExtractRequest(url, debugOnly, accessCode, catalogMode = false) {
  const trimmedAccessCode = String(accessCode || "").trim();

  if (!trimmedAccessCode) {
    throw new Error("Please enter an access code.");
  }

  const payload = {
    url,
    password: trimmedAccessCode,
    debug: debugOnly,
  };

  if (catalogMode) {
    payload.extractionMode = "catalog";
  }

  const res = await fetch(EXTRACT_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(EXTRACT_TIMEOUT_MS),
  });

  if (res.status === 401) {
    throw createInvalidAccessCodeError();
  }

  return res;
}

async function readBackendExtractResponse(res) {
  const data = await res.json().catch(() => null);

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

async function useBackendExtract(url, debugOnly, accessCode, catalogMode = false) {
  const res = await sendBackendExtractRequest(url, debugOnly, accessCode, catalogMode);
  return readBackendExtractResponse(res);
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
scrapeBtn.addEventListener("click", handleExtractClick);
retryBtn.addEventListener("click", () => { clearError(); handleExtractClick(); });
urlInput.addEventListener("keydown", e => { if (e.key === "Enter") handleExtractClick(); });

function handleExtractClick() {
  const request = prepareExtractionRequest();
  if (!request) return;

  ensureAccessCodeThenRun(request);
}

function setButtonLoading(button, isLoading, loadingText, defaultLabel = "") {
  if (!button) return;

  const loading = Boolean(isLoading);
  const label = button.querySelector(".btn-label");
  if (!buttonDefaultLabels.has(button)) {
    buttonDefaultLabels.set(button, defaultLabel || (label ? label.textContent.trim() : button.textContent.trim()));
  }

  button.classList.toggle("is-loading", loading);
  if (loading) {
    button.setAttribute("aria-busy", "true");
    if (label) {
      label.textContent = loadingText;
    } else {
      button.textContent = loadingText;
    }
  } else {
    button.removeAttribute("aria-busy");
    const restoredLabel = buttonDefaultLabels.get(button);
    if (label) {
      label.textContent = restoredLabel;
    } else {
      button.textContent = restoredLabel;
    }
  }
}

function prepareExtractionRequest() {
  const url = urlInput.value.trim();
  const debugOnly = isDebugMode();
  const catalogMode = isCatalogMode();

  resetDebugState();
  clearError();
  hideResults();
  hideDebugPanel();

  if (!url) return showError("Please enter a URL.");

  try {
    new URL(url);
  } catch {
    showError("That does not look like a valid URL.");
    return null;
  }

  return { url, debugOnly, catalogMode };
}

function ensureAccessCodeThenRun(request) {
  const verifiedAccessCode = getVerifiedAccessCode();
  if (verifiedAccessCode) {
    runExtractionWithAccessCode(request, verifiedAccessCode);
    return;
  }

  openAccessCodeModal(request);
}

async function runExtractionWithAccessCode(request, accessCode) {
  const { url, debugOnly, catalogMode } = request;

  resetDebugState();
  clearError();
  hideResults();
  hideDebugPanel();

  setButtonLoading(scrapeBtn, true, "Extracting...", "Extract Programs");
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
    const result = await useBackendExtract(url, debugOnly, accessCode, catalogMode);

    if (debugOnly) {
      stopStatusSequence();
      renderDebugPanel();
      scrapeBtn.disabled = false;
      setButtonLoading(scrapeBtn, false, "", "Extract Programs");
      showStatus("Debug mode - content prepared. Model call skipped.", 100);
      setTimeout(() => hideStatus(), 1500);
      return;
    }

    if (isCatalogResponse(result)) {
      activeResultsMode = "catalog";
      programs = normalizeCatalogRows(result.catalogRows);
    } else {
      activeResultsMode = "audit";
      programs = Array.isArray(result.programs) ? result.programs : [];
    }

    if (!programs.length) {
      stopStatusSequence();
      scrapeBtn.disabled = false;
      setButtonLoading(scrapeBtn, false, "", "Extract Programs");
      if (shouldShowContentDiagnostics()) renderDebugPanel();
      const emptyMessage = activeResultsMode === "catalog"
        ? "No catalog rows were extracted. Turn on Content diagnostics to inspect what the backend received."
        : "No programs were extracted. Turn on Content diagnostics to inspect what the backend received.";
      return showError(emptyMessage);
    }
  } catch (e) {
    stopStatusSequence();
    scrapeBtn.disabled = false;
    setButtonLoading(scrapeBtn, false, "", "Extract Programs");
    if (shouldShowContentDiagnostics()) renderDebugPanel();
    if (isInvalidAccessCodeError(e)) {
      handleInvalidAccessCode(request);
      return;
    }
    return showError("Extraction failed: " + e.message);
  }

  stopStatusSequence();
  showStatus("Mapping subjects...", 82);

  if (activeResultsMode !== "catalog") {
    programs = programs.map(p => {
      p = mapSubjects(p);
      p = applyFinancialAidStatement(p);
      return p;
    });
  }

  showStatus("Rendering results...", 96);
  allPrograms = programs;

  await sleep(250);
  hideStatus();
  renderResults(url);
  if (shouldShowContentDiagnostics()) renderDebugPanel();
  scrapeBtn.disabled = false;
  setButtonLoading(scrapeBtn, false, "", "Extract Programs");
}

function openAccessCodeModal(request, options = {}) {
  if (!accessCodeModal || !accessCodeInput) return;

  const { errorMessage = "", preserveValue = false } = options;
  pendingAccessCodeRequest = request;
  if (!preserveValue) accessCodeInput.value = getAccessCodePrefill();
  accessCodeInput.type = "password";
  accessCodeInput.removeAttribute("aria-invalid");
  syncAccessCodeVisibilityToggle();
  setAccessCodeModalLoading(false);
  setAccessCodeModalError(errorMessage);
  showAccessCodeModalElement();
  setTimeout(() => {
    accessCodeInput.focus();
    if (errorMessage || preserveValue) accessCodeInput.select();
  }, 0);
}

function closeAccessCodeModal(options = {}) {
  const { force = false } = options;
  if (accessCodeChecking && !force) return;

  setAccessCodeModalLoading(false);
  hideAccessCodeModalElement();
  pendingAccessCodeRequest = null;
  if (accessCodeInput) {
    accessCodeInput.value = "";
    accessCodeInput.type = "password";
    accessCodeInput.removeAttribute("aria-invalid");
  }
  syncAccessCodeVisibilityToggle();
  setAccessCodeModalError("");
}

function setAccessCodeModalLoading(isLoading) {
  accessCodeChecking = Boolean(isLoading);

  if (accessCodeInput) accessCodeInput.disabled = accessCodeChecking;
  if (accessCodeToggle) accessCodeToggle.disabled = accessCodeChecking;
  if (accessCodeCancel) accessCodeCancel.disabled = accessCodeChecking;
  if (accessCodeSubmit) {
    accessCodeSubmit.disabled = accessCodeChecking;
    setButtonLoading(accessCodeSubmit, accessCodeChecking, ACCESS_CODE_CHECKING_LABEL, ACCESS_CODE_SUBMIT_LABEL);
  }
}

function setAccessCodeModalError(message) {
  if (!accessCodeError) return;
  accessCodeError.textContent = message || "";
  accessCodeError.classList.toggle("hidden", !message);
  if (message) {
    accessCodeInput?.setAttribute("aria-invalid", "true");
  } else {
    accessCodeInput?.removeAttribute("aria-invalid");
  }
}

function clearAccessCodeModalError() {
  setAccessCodeModalError("");
}

function clearAccessCodeInput() {
  if (!accessCodeInput) return;
  accessCodeInput.value = "";
  clearAccessCodeModalError();
  accessCodeInput.focus();
}

function handleInvalidAccessCode(request, options = {}) {
  const { keepModalOpen = false } = options;

  clearStoredAccessCode();
  stopStatusSequence();
  hideStatus();
  clearError();
  scrapeBtn.disabled = false;
  setButtonLoading(scrapeBtn, false, "", "Extract Programs");
  setAccessCodeModalLoading(false);

  if (keepModalOpen && isAccessCodeModalOpen()) {
    pendingAccessCodeRequest = request;
    setAccessCodeModalError(INVALID_ACCESS_CODE_MESSAGE);
    setTimeout(() => {
      accessCodeInput?.focus();
      accessCodeInput?.select();
    }, 0);
    return;
  }

  openAccessCodeModal(request, { errorMessage: INVALID_ACCESS_CODE_MESSAGE });
}

async function submitAccessCodeModal() {
  if (!isAccessCodeModalOpen() || accessCodeChecking) return;

  const accessCode = accessCodeInput?.value?.trim() || "";
  if (!accessCode) {
    setAccessCodeModalError("Enter an access code to continue.");
    return;
  }

  const request = pendingAccessCodeRequest;
  if (!request) return;

  setAccessCodeModalError("");
  setAccessCodeModalLoading(true);

  try {
    await verifyAccessCode(accessCode);
    saveAccessCode(accessCode);
    closeAccessCodeModal({ force: true });
    await nextFrame();
    runExtractionWithAccessCode(request, accessCode);
  } catch (e) {
    if (isInvalidAccessCodeError(e)) {
      handleInvalidAccessCode(request, { keepModalOpen: true });
      return;
    }

    setAccessCodeModalLoading(false);
    setAccessCodeModalError(ACCESS_CODE_VERIFY_ERROR_MESSAGE);
    setTimeout(() => {
      accessCodeInput?.focus();
      accessCodeInput?.select();
    }, 0);
  }
}

accessCodeSubmit?.addEventListener("click", submitAccessCodeModal);
accessCodeInput?.addEventListener("input", clearAccessCodeModalError);
accessCodeInput?.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    e.preventDefault();
    submitAccessCodeModal();
  }
});
accessCodeToggle?.addEventListener("click", () => {
  if (!accessCodeInput || !accessCodeToggle) return;
  const isHidden = accessCodeInput.type === "password";
  accessCodeInput.type = isHidden ? "text" : "password";
  syncAccessCodeVisibilityToggle();
  accessCodeInput.focus();
});
syncAccessCodeVisibilityToggle();
accessCodeCancel?.addEventListener("click", clearAccessCodeInput);
accessCodeModal?.addEventListener("click", e => {
  if (e.target === accessCodeModal) closeAccessCodeModal();
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && isAccessCodeModalOpen()) {
    closeAccessCodeModal();
  }
});

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

function initSettingsMenu() {
  if (!settingsMenuToggle || !settingsPanel || !settingsMenuButton) return;

  setSettingsMenuOpen(false);

  settingsMenuToggle.addEventListener("change", () => {
    setSettingsMenuOpen(settingsMenuToggle.checked);
  });

  settingsMenuButton.addEventListener("keydown", e => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    setSettingsMenuOpen(!isSettingsMenuOpen());
  });

  document.addEventListener("click", e => {
    if (!isSettingsMenuOpen()) return;
    if (e.target.closest(".settings-menu")) return;
    setSettingsMenuOpen(false);
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && isSettingsMenuOpen()) {
      setSettingsMenuOpen(false);
    }
  });
}

function isSettingsMenuOpen() {
  return Boolean(settingsPanel && !settingsPanel.hidden);
}

function setSettingsMenuOpen(isOpen) {
  if (!settingsMenuToggle || !settingsPanel || !settingsMenuButton) return;

  settingsMenuToggle.checked = Boolean(isOpen);
  settingsPanel.hidden = !isOpen;
  if (settingsMenuBackdrop) settingsMenuBackdrop.hidden = !isOpen;
  settingsMenuButton.setAttribute("aria-expanded", String(Boolean(isOpen)));
  settingsMenuButton.setAttribute("aria-label", isOpen ? "Close settings menu" : "Open settings menu");
}

function isDebugMenuVisible() {
  return isSettingsMenuOpen();
}

function loadDebugUiVisibility() {
  debugUiVisible = true;
  debugOptionsEl?.classList.add("debug-options--visible");
}

function applyDebugUiVisibility() {
  debugUiVisible = true;
  debugOptionsEl?.classList.add("debug-options--visible");
}

function toggleDebugUiVisibility(forceVisible = null) {
  const shouldOpen = forceVisible === null ? !isSettingsMenuOpen() : Boolean(forceVisible);
  setSettingsMenuOpen(shouldOpen);
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
  return Boolean(debugModeInput?.checked);
}

function isCatalogMode() {
  catalogModeEnabled = Boolean(catalogToggleInput?.checked);
  return catalogModeEnabled;
}

function shouldShowContentDiagnostics() {
  contentDiagnosticsEnabled = Boolean(contentDiagnosticsToggleInput?.checked);
  return contentDiagnosticsEnabled;
}

function getSelectedContentMode() {
  const selected = contentModeInputs.find(input => input.checked);
  return selected?.value || DEFAULT_CONTENT_MODE;
}

function setSelectedContentMode(value) {
  const nextValue = contentModeInputs.some(input => input.value === value) ? value : DEFAULT_CONTENT_MODE;
  contentModeInputs.forEach(input => {
    input.checked = input.value === nextValue;
  });
  localStorage.setItem("uniscrape_content_mode", nextValue);
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
  if (!shouldShowContentDiagnostics() || !debugPanel || !debugStatsEl) return;

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
//Subject mapping

const SUBJECT_RULES = [

  // Business and Management Studies
  {
    broad: "Business and Management Studies",
    narrow: "Business and Management Studies",
    priority: 100,
    strong: [
      "business administration", "business management", "business studies", "management studies",
      "international business", "global business", "business enterprise", "business entrepreneurship",
      "entrepreneurship", "innovation and entrepreneurship", "enterprise and entrepreneurship",
      "business leadership", "strategic management", "general management", "management practice",
      "business strategy", "organisational management", "organizational management", "business operations",
      "operations management", "project management", "bba", "mba", "dba", "executive mba",
      "master of business administration", "doctor of business administration"
    ],
    medium: [
      "business", "management", "leadership", "strategy", "operations", "enterprise",
      "entrepreneurial", "organisational", "organizational", "commercial management",
      "corporate management", "global management", "innovation management"
    ]
  },
  {
    broad: "Business and Management Studies",
    narrow: "Accounting and Finance",
    priority: 115,
    strong: [
      "accounting and finance", "finance and accounting", "accountancy", "accounting", "finance",
      "banking and finance", "international finance", "corporate finance", "financial management",
      "financial accounting", "management accounting", "forensic accounting", "professional accounting",
      "investment management", "financial economics", "financial technology", "fintech",
      "banking", "risk management", "audit", "auditing", "taxation", "tax accounting"
    ],
    medium: [
      "financial", "investment", "investments", "bank", "banks", "capital markets", "portfolio",
      "wealth management", "insurance", "actuarial finance", "risk", "audit", "tax"
    ]
  },
  {
    broad: "Business and Management Studies",
    narrow: "Marketing",
    priority: 112,
    strong: [
      "marketing", "digital marketing", "marketing management", "brand management", "branding",
      "advertising", "public relations", "consumer behaviour", "consumer behavior",
      "marketing communications", "integrated marketing", "social media marketing", "fashion marketing",
      "luxury brand management", "retail marketing", "strategic marketing"
    ],
    medium: ["brand", "brands", "consumer", "advertising", "promotion", "retail", "market research", "communications"]
  },
  {
    broad: "Business and Management Studies",
    narrow: "Business Analytics",
    priority: 118,
    strong: [
      "business analytics", "business data analytics", "management analytics", "analytics for business",
      "business intelligence", "decision analytics", "marketing analytics", "people analytics",
      "financial analytics", "digital business analytics"
    ],
    medium: ["analytics", "business intelligence", "data-driven management", "decision science"]
  },
  {
    broad: "Business and Management Studies",
    narrow: "Human Resource Management",
    priority: 112,
    strong: [
      "human resource management", "human resources", "hrm", "people management", "talent management",
      "employment relations", "industrial relations", "organisational behaviour", "organizational behavior",
      "organisational psychology for business", "workplace psychology"
    ],
    medium: ["human resource", "hr", "talent", "employee", "workforce", "employment relations"]
  },
  {
    broad: "Business and Management Studies",
    narrow: "Supply Chain Management",
    priority: 113,
    strong: [
      "supply chain management", "logistics and supply chain", "logistics management", "procurement",
      "purchasing and supply", "operations and supply chain", "global supply chain", "shipping and logistics",
      "transport and logistics", "maritime logistics", "distribution management"
    ],
    medium: ["supply chain", "logistics", "procurement", "purchasing", "distribution", "transport management", "shipping"]
  },
  {
    broad: "Business and Management Studies",
    narrow: "Hospitality and Leisure Management",
    priority: 110,
    strong: [
      "hospitality management", "hotel management", "tourism management", "travel and tourism",
      "international tourism", "global tourism", "tourism and hospitality", "events management",
      "event management", "leisure management", "recreation management", "resort management",
      "culinary management", "food and beverage management"
    ],
    medium: ["hospitality", "tourism", "hotel", "hotels", "events", "event", "leisure", "resort", "culinary", "travel"]
  },
  {
    broad: "Business and Management Studies",
    narrow: "Real Estate",
    priority: 106,
    strong: ["real estate", "property management", "property development", "real estate investment", "estate management", "built environment management"],
    medium: ["property", "real estate", "valuation", "surveying practice"]
  },
  {
    broad: "Business and Management Studies",
    narrow: "Fashion Management",
    priority: 118,
    strong: [
      "fashion management", "fashion business", "fashion marketing", "fashion merchandising",
      "luxury fashion management", "fashion buying", "fashion retail", "fashion communication",
      "luxury brand management", "fashion entrepreneurship"
    ],
    medium: ["fashion business", "fashion marketing", "fashion retail", "merchandising", "luxury brand"]
  },
  {
    broad: "Business and Management Studies",
    narrow: "Sports Management",
    priority: 110,
    strong: ["sports management", "sport management", "sport business", "sports business", "sport marketing", "football business", "sports administration"],
    medium: ["sports industry", "sport industry", "club management", "sport development"]
  },
  {
    broad: "Business and Management Studies",
    narrow: "Healthcare Management",
    priority: 110,
    strong: ["healthcare management", "health care management", "health administration", "healthcare administration", "hospital management", "health services management"],
    medium: ["healthcare leadership", "health service", "hospital administration", "clinical leadership"]
  },

  // Economics, social sciences, law, media, education
  {
    broad: "Social Sciences and Management",
    narrow: "Economics and Econometrics",
    priority: 108,
    strong: ["economics", "econometrics", "economic policy", "financial economics", "business economics", "international economics", "development economics", "applied economics", "political economy"],
    medium: ["economic", "econometric", "macroeconomics", "microeconomics", "labour economics", "labor economics"]
  },
  {
    broad: "Social Sciences and Management",
    narrow: "Law and Legal Studies",
    priority: 112,
    strong: ["law", "legal studies", "llb", "llm", "juris doctor", "commercial law", "international law", "business law", "criminal law", "human rights law", "legal practice", "paralegal", "criminology and law"],
    medium: ["legal", "justice", "jurisprudence", "regulation", "compliance", "intellectual property"]
  },
  {
    broad: "Social Sciences and Management",
    narrow: "Communication and Media Studies",
    priority: 108,
    strong: ["communication and media", "media studies", "communications", "mass communication", "journalism", "digital media", "media production", "public relations", "broadcast journalism", "film and media", "sports journalism"],
    medium: ["media", "journalism", "broadcast", "content creation", "digital communication", "communication"]
  },
  {
    broad: "Social Sciences and Management",
    narrow: "Education and Training",
    priority: 108,
    strong: ["education", "teaching", "teacher education", "early childhood education", "primary education", "secondary education", "tesol", "tefl", "special educational needs", "education leadership", "pedagogy"],
    medium: ["teacher", "teaching", "learning", "curriculum", "pedagogy", "early years", "childhood education"]
  },
  {
    broad: "Social Sciences and Management",
    narrow: "Politics",
    priority: 106,
    strong: ["politics", "political science", "international relations", "public policy", "global affairs", "diplomacy", "governance", "security studies", "war studies", "peace and conflict"],
    medium: ["political", "policy", "diplomatic", "government", "geopolitics", "international affairs"]
  },
  {
    broad: "Social Sciences and Management",
    narrow: "Sociology",
    priority: 105,
    strong: ["sociology", "social research", "social studies", "social theory", "criminology", "social justice", "gender studies", "youth studies"],
    medium: ["social", "society", "criminological", "community studies", "inequality"]
  },
  {
    broad: "Social Sciences and Management",
    narrow: "Social Policy and Administration",
    priority: 105,
    strong: ["social policy", "public administration", "public management", "social work", "welfare", "community development", "policy administration"],
    medium: ["public sector", "administration", "welfare", "social care", "public service"]
  },
  {
    broad: "Social Sciences and Management",
    narrow: "Anthropology",
    priority: 102,
    strong: ["anthropology", "social anthropology", "cultural anthropology", "medical anthropology"],
    medium: ["anthropological", "ethnography", "ethnographic"]
  },
  {
    broad: "Social Sciences and Management",
    narrow: "Development Studies",
    priority: 104,
    strong: ["development studies", "international development", "global development", "sustainable development", "humanitarian action", "ngo management"],
    medium: ["development", "humanitarian", "poverty", "sustainability policy"]
  },
  {
    broad: "Social Sciences and Management",
    narrow: "Library and Information Management",
    priority: 104,
    strong: ["library and information", "information management", "library science", "archives", "records management", "information governance"],
    medium: ["library", "archive", "records", "information services"]
  },
  {
    broad: "Social Sciences and Management",
    narrow: "Statistics and Operational Research",
    priority: 113,
    strong: ["statistics", "statistical science", "operational research", "operations research", "data statistics", "applied statistics", "medical statistics", "statistical modelling"],
    medium: ["statistical", "stats", "quantitative methods", "operations research", "optimisation", "optimization"]
  },

  // Computing, data, games, engineering and technology
  {
    broad: "Engineering and Technology",
    narrow: "Computer Science and Information Systems",
    priority: 115,
    strong: [
      "computer science", "computing", "software engineering", "information systems", "information technology",
      "cyber security", "cybersecurity", "network security", "computer networks", "cloud computing",
      "web development", "mobile app development", "computer games programming", "games programming",
      "game development", "game programming", "internet of things", "iot", "human computer interaction",
      "hci", "digital technology", "software development", "computer applications"
    ],
    medium: ["software", "programming", "developer", "coding", "networking", "database", "it", "information system", "computer"]
  },
  {
    broad: "Engineering and Technology",
    narrow: "Data Science and Artificial Intelligence",
    priority: 120,
    strong: [
      "data science", "artificial intelligence", "machine learning", "deep learning", "data analytics",
      "big data", "ai", "data engineering", "applied artificial intelligence", "robotics and ai",
      "intelligent systems", "computational intelligence", "data mining", "predictive analytics"
    ],
    medium: ["analytics", "algorithm", "algorithms", "neural networks", "data", "machine intelligence", "automation"]
  },
  {
    broad: "Engineering and Technology",
    narrow: "Engineering - Mechanical",
    priority: 110,
    strong: ["mechanical engineering", "mechatronics", "automotive engineering", "aerospace engineering", "manufacturing engineering", "robotics engineering", "thermal engineering"],
    medium: ["mechanical", "mechatronic", "automotive", "aerospace", "manufacturing", "robotics", "cad", "cam"]
  },
  {
    broad: "Engineering and Technology",
    narrow: "Engineering - Electrical and Electronic",
    priority: 110,
    strong: ["electrical engineering", "electronic engineering", "electrical and electronic", "electronics", "telecommunications engineering", "communications engineering", "power engineering", "embedded systems"],
    medium: ["electrical", "electronic", "electronics", "telecommunications", "power systems", "embedded", "circuits"]
  },
  {
    broad: "Engineering and Technology",
    narrow: "Engineering - Civil and Structural",
    priority: 110,
    strong: ["civil engineering", "structural engineering", "construction engineering", "construction management", "built environment", "quantity surveying", "surveying", "architectural engineering"],
    medium: ["civil", "structural", "construction", "surveying", "infrastructure", "building services"]
  },
  {
    broad: "Engineering and Technology",
    narrow: "Engineering - Chemical",
    priority: 110,
    strong: ["chemical engineering", "process engineering", "biochemical engineering", "petrochemical engineering", "food process engineering"],
    medium: ["chemical", "process", "biochemical", "petrochemical"]
  },
  {
    broad: "Engineering and Technology",
    narrow: "Engineering - Petroleum",
    priority: 110,
    strong: ["petroleum engineering", "oil and gas engineering", "reservoir engineering", "energy engineering", "offshore engineering"],
    medium: ["petroleum", "oil and gas", "reservoir", "offshore", "energy systems"]
  },
  {
    broad: "Engineering and Technology",
    narrow: "Engineering - Mineral and Mining",
    priority: 110,
    strong: ["mining engineering", "mineral engineering", "minerals engineering", "metallurgical engineering", "metallurgy", "geotechnical engineering"],
    medium: ["mining", "mineral", "minerals", "metallurgy", "geotechnical"]
  },
  {
    broad: "Engineering and Technology",
    narrow: "Materials Sciences",
    priority: 108,
    strong: ["materials science", "materials engineering", "advanced materials", "polymer science", "nanotechnology", "nanoscience", "textile technology"],
    medium: ["materials", "polymer", "nanotech", "nanoscience", "textile materials"]
  },

  // Arts, design, architecture, humanities and creative subjects
  {
    broad: "Arts and Humanities",
    narrow: "Art and Design",
    priority: 116,
    strong: [
      "art and design", "graphic design", "fashion design", "game art", "games art", "game art design",
      "illustration", "animation", "visual communication", "visual arts", "fine art", "fine arts",
      "digital art", "digital design", "interior design", "product design", "industrial design",
      "textile design", "jewellery design", "jewelry design", "photography", "creative practice",
      "concept art", "motion graphics", "ux design", "user experience design", "ui design",
      "user interface design", "design communication", "design studies"
    ],
    medium: ["design", "art", "creative", "visual", "illustration", "animation", "fashion", "textile", "photography", "graphics", "ux", "ui"]
  },
  {
    broad: "Arts and Humanities",
    narrow: "Architecture and Built Environment",
    priority: 110,
    strong: ["architecture", "architectural design", "landscape architecture", "urban design", "urban planning", "town planning", "spatial planning", "built environment"],
    medium: ["architectural", "urban", "planning", "landscape", "spatial", "built environment"]
  },
  {
    broad: "Arts and Humanities",
    narrow: "Performing Arts",
    priority: 110,
    strong: ["performing arts", "drama", "theatre", "theater", "acting", "dance", "musical theatre", "music performance", "screen acting", "performance studies"],
    medium: ["performance", "drama", "theatre", "theater", "acting", "dance", "stage", "audition"]
  },
  {
    broad: "Arts and Humanities",
    narrow: "Music",
    priority: 108,
    strong: ["music", "music production", "music technology", "sound design", "audio production", "composition", "music business", "music performance"],
    medium: ["musical", "audio", "sound", "composition", "songwriting"]
  },
  {
    broad: "Arts and Humanities",
    narrow: "English Language and Literature",
    priority: 105,
    strong: ["english literature", "english language", "creative writing", "comparative literature", "literature", "writing", "english studies"],
    medium: ["literary", "poetry", "novel", "fiction", "writing"]
  },
  {
    broad: "Arts and Humanities",
    narrow: "Modern Languages",
    priority: 105,
    strong: ["modern languages", "translation", "interpreting", "french", "spanish", "german", "chinese", "japanese", "arabic", "language studies", "linguistics and language"],
    medium: ["language", "translation", "interpreting", "bilingual", "multilingual"]
  },
  {
    broad: "Arts and Humanities",
    narrow: "Linguistics",
    priority: 106,
    strong: ["linguistics", "applied linguistics", "language sciences", "phonetics", "sociolinguistics", "discourse analysis"],
    medium: ["linguistic", "phonology", "syntax", "semantics"]
  },
  {
    broad: "Arts and Humanities",
    narrow: "History",
    priority: 103,
    strong: ["history", "modern history", "ancient history", "military history", "public history", "historical studies"],
    medium: ["historical", "heritage", "medieval", "renaissance"]
  },
  {
    broad: "Arts and Humanities",
    narrow: "Philosophy",
    priority: 103,
    strong: ["philosophy", "ethics", "logic", "metaphysics", "political philosophy"],
    medium: ["philosophical", "ethical theory"]
  },
  {
    broad: "Arts and Humanities",
    narrow: "Theology, Divinity and Religious Studies",
    priority: 103,
    strong: ["theology", "divinity", "religious studies", "religion", "biblical studies", "islamic studies", "christian studies"],
    medium: ["religious", "faith", "scripture", "ministry"]
  },
  {
    broad: "Arts and Humanities",
    narrow: "Archaeology",
    priority: 103,
    strong: ["archaeology", "archeology", "archaeological science", "heritage archaeology"],
    medium: ["archaeological", "archeological", "excavation"]
  },
  {
    broad: "Arts and Humanities",
    narrow: "Art History",
    priority: 103,
    strong: ["art history", "history of art", "curating", "museum studies", "heritage studies"],
    medium: ["curatorial", "museum", "gallery", "heritage"]
  },
  {
    broad: "Arts and Humanities",
    narrow: "Classics and Ancient History",
    priority: 103,
    strong: ["classics", "classical studies", "ancient history", "greek and roman", "latin", "ancient civilisation", "ancient civilization"],
    medium: ["classical", "ancient", "latin"]
  },

  // Life sciences and medicine
  {
    broad: "Life Sciences and Medicine",
    narrow: "Psychology",
    priority: 114,
    strong: ["psychology", "clinical psychology", "counselling psychology", "counseling psychology", "forensic psychology", "developmental psychology", "educational psychology", "sport psychology", "health psychology", "neuropsychology"],
    medium: ["psychological", "cognitive", "behavioural", "behavioral", "mental health", "counselling", "counseling"]
  },
  {
    broad: "Life Sciences and Medicine",
    narrow: "Medicine",
    priority: 114,
    strong: ["medicine", "medical degree", "mbbs", "mbchb", "md", "doctor of medicine", "clinical medicine", "surgery", "physician associate", "public health", "global health"],
    medium: ["medical", "clinical", "health sciences", "health science", "surgery", "physician"]
  },
  {
    broad: "Life Sciences and Medicine",
    narrow: "Nursing",
    priority: 114,
    strong: ["nursing", "adult nursing", "mental health nursing", "child nursing", "children's nursing", "midwifery", "registered nurse", "nurse education"],
    medium: ["nurse", "midwife", "clinical nursing"]
  },
  {
    broad: "Life Sciences and Medicine",
    narrow: "Pharmacy and Pharmacology",
    priority: 112,
    strong: ["pharmacy", "pharmacology", "pharmaceutical science", "pharmaceutical sciences", "clinical pharmacy", "drug discovery", "medicinal chemistry", "pharmaceutics"],
    medium: ["pharmaceutical", "pharmacological", "drug", "medicines"]
  },
  {
    broad: "Life Sciences and Medicine",
    narrow: "Biological Sciences",
    priority: 110,
    strong: ["biological sciences", "biology", "biomedical science", "biochemistry", "molecular biology", "microbiology", "genetics", "cell biology", "biotechnology", "neuroscience", "immunology"],
    medium: ["biological", "biomedical", "biochemistry", "microbial", "genetic", "molecular", "cellular", "neuroscience", "bioscience"]
  },
  {
    broad: "Life Sciences and Medicine",
    narrow: "Dentistry",
    priority: 112,
    strong: ["dentistry", "dental surgery", "dental science", "oral health", "orthodontics", "dental hygiene", "dental therapy"],
    medium: ["dental", "orthodontic", "oral"]
  },
  {
    broad: "Life Sciences and Medicine",
    narrow: "Veterinary Science",
    priority: 112,
    strong: ["veterinary science", "veterinary medicine", "veterinary nursing", "animal health", "veterinary physiotherapy"],
    medium: ["veterinary", "vet", "animal health"]
  },
  {
    broad: "Life Sciences and Medicine",
    narrow: "Anatomy and Physiology",
    priority: 108,
    strong: ["anatomy", "physiology", "human physiology", "sports physiology", "exercise physiology", "pathophysiology"],
    medium: ["anatomical", "physiological", "human body"]
  },
  {
    broad: "Life Sciences and Medicine",
    narrow: "Agriculture and Forestry",
    priority: 108,
    strong: ["agriculture", "agricultural science", "forestry", "animal science", "plant science", "crop science", "food science", "agribusiness", "horticulture"],
    medium: ["agricultural", "forest", "forestry", "crop", "plant", "animal production", "horticultural"]
  },

  // Natural sciences
  {
    broad: "Natural Sciences",
    narrow: "Mathematics",
    priority: 108,
    strong: ["mathematics", "applied mathematics", "pure mathematics", "mathematical sciences", "financial mathematics", "computational mathematics"],
    medium: ["maths", "math", "mathematical", "calculus", "algebra"]
  },
  {
    broad: "Natural Sciences",
    narrow: "Chemistry",
    priority: 108,
    strong: ["chemistry", "applied chemistry", "analytical chemistry", "organic chemistry", "inorganic chemistry", "chemical sciences", "forensic chemistry"],
    medium: ["chemical", "chemist", "molecular chemistry"]
  },
  {
    broad: "Natural Sciences",
    narrow: "Physics and Astronomy",
    priority: 108,
    strong: ["physics", "astronomy", "astrophysics", "theoretical physics", "applied physics", "particle physics", "space science"],
    medium: ["physical science", "astronomical", "quantum", "space"]
  },
  {
    broad: "Natural Sciences",
    narrow: "Environmental Sciences",
    priority: 108,
    strong: ["environmental science", "environmental sciences", "environmental management", "climate science", "sustainability", "conservation", "ecology", "environmental studies"],
    medium: ["environment", "environmental", "climate", "sustainable", "ecological", "conservation"]
  },
  {
    broad: "Natural Sciences",
    narrow: "Geography",
    priority: 106,
    strong: ["geography", "human geography", "physical geography", "geographical sciences", "gis", "geographic information systems"],
    medium: ["geographical", "geospatial", "spatial analysis", "gis"]
  },
  {
    broad: "Natural Sciences",
    narrow: "Earth and Marine Sciences",
    priority: 106,
    strong: ["earth sciences", "earth science", "marine science", "marine biology", "oceanography", "earth and marine", "coastal science"],
    medium: ["marine", "ocean", "coastal", "earth systems"]
  },
  {
    broad: "Natural Sciences",
    narrow: "Geology",
    priority: 106,
    strong: ["geology", "geological sciences", "applied geology", "engineering geology"],
    medium: ["geological", "rocks", "sedimentology"]
  },
  {
    broad: "Natural Sciences",
    narrow: "Geophysics",
    priority: 106,
    strong: ["geophysics", "geophysical sciences", "seismology"],
    medium: ["geophysical", "seismic", "seismology"]
  }
];

const SPECIALIZATION_RULES = [
  // MBA / business master's / DBA specializations commonly shown by TopMBA and business schools.
  { value: "Finance", keywords: ["finance", "corporate finance", "investment", "banking", "financial management", "private equity", "risk management"] },
  { value: "Marketing", keywords: ["marketing", "digital marketing", "brand management", "market analysis", "consumer behaviour", "consumer behavior"] },
  { value: "Strategy", keywords: ["strategy", "strategic management", "business strategy", "strategic leadership"] },
  { value: "Operations Management", keywords: ["operations management", "operations", "service management", "product and service management"] },
  { value: "Supply Chain Management", keywords: ["supply chain", "logistics", "procurement", "purchasing"] },
  { value: "Human Resource Management", keywords: ["human resource", "human resources", "hrm", "people management", "talent management"] },
  { value: "International Business", keywords: ["international business", "global business", "global management"] },
  { value: "Entrepreneurship and Innovation", keywords: ["entrepreneurship", "innovation", "innovation and entrepreneurship", "startup", "start-up"] },
  { value: "Business Analytics", keywords: ["business analytics", "data analytics", "analytics", "business intelligence"] },
  { value: "Technology Management", keywords: ["technology management", "it management", "information systems", "technology and analytics", "digital transformation"] },
  { value: "Healthcare Management", keywords: ["healthcare management", "healthcare administration", "health administration", "hospital management"] },
  { value: "Project Management", keywords: ["project management", "programme management", "program management"] },
  { value: "Leadership", keywords: ["leadership", "executive leadership", "strategic leadership"] },
  { value: "Real Estate", keywords: ["real estate", "property", "real estate investment"] },
  { value: "Sports Management", keywords: ["sports management", "sport management", "sport business"] },

  // Postgraduate/doctoral/professional academic specializations.
  { value: "Clinical Psychology", keywords: ["clinical psychology"] },
  { value: "Counselling Psychology", keywords: ["counselling psychology", "counseling psychology"] },
  { value: "Forensic Psychology", keywords: ["forensic psychology"] },
  { value: "Cyber Security", keywords: ["cyber security", "cybersecurity", "information security"] },
  { value: "Artificial Intelligence", keywords: ["artificial intelligence", "machine learning", "deep learning"] },
  { value: "Data Science", keywords: ["data science", "big data", "data engineering"] },
  { value: "Sustainable Development", keywords: ["sustainable development", "sustainability"] },
  { value: "Public Health", keywords: ["public health", "global health"] }
];

function normaliseSubjectText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/\b(ba|bsc|ma|msc|mba|bba|beng|meng|llb|llm|phd|dphil|dba|md|hons|honours|honors)\b/g, " ")
    .replace(/\b(bachelor|bachelors|master|masters|degree|undergraduate|postgraduate|program|programme|course)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function subjectPhraseScore(text, phrase, weight) {
  const cleanPhrase = normaliseSubjectText(phrase);
  if (!cleanPhrase) return 0;
  if (text === cleanPhrase) return weight + 8;
  if (text.includes(cleanPhrase)) return weight;

  const words = cleanPhrase.split(" ").filter(w => w.length > 2);
  if (words.length >= 2 && words.every(w => text.includes(w))) {
    return Math.max(1, Math.floor(weight * 0.6));
  }

  return 0;
}

function isPostgraduateOrProfessional(program) {
  const level = String(program?.level || "").toLowerCase();
  const name = String(program?.name || "").toLowerCase();
  return (
    level.includes("master") ||
    level.includes("phd") ||
    level.includes("doctor") ||
    /\b(mba|dba|msc|ma|llm|mres|mphil|phd|dphil|md|pgdip|pgcert)\b/i.test(name)
  );
}

function specializationIsExplicit(program) {
  const blob = [
    program?.name,
    program?.description,
    program?.department,
    program?.faculty,
  ].filter(Boolean).join(" ").toLowerCase();

  return /(speciali[sz]ation|concentration|track|pathway|stream|option|major|focus area|career track)/i.test(blob);
}

function detectSpecialization(program, matchedRule) {
  const allowSpecialization = isPostgraduateOrProfessional(program) || specializationIsExplicit(program);
  if (!allowSpecialization) return "";

  const weightedText = normaliseSubjectText([
    program?.name || "",
    program?.description || "",
    program?.department || "",
    program?.faculty || "",
  ].join(" "));

  let best = { value: "", score: 0 };

  for (const rule of SPECIALIZATION_RULES) {
    let score = 0;
    for (const phrase of rule.keywords || []) score += subjectPhraseScore(weightedText, phrase, 14);
    if (score > best.score) best = { value: rule.value, score };
  }

  // Avoid returning a specialization that simply duplicates the chosen narrow subject.
  if (best.score >= 14 && best.value !== matchedRule?.narrow) return best.value;
  return "";
}

function mapSubjects(program) {
  const titleText = normaliseSubjectText(program?.name || "");
  const contextText = normaliseSubjectText([
    program?.department || "",
    program?.faculty || "",
    program?.description || "",
  ].join(" "));

  // Programme title is the strongest evidence. Context helps break ties only.
  const combinedText = `${titleText} ${titleText} ${titleText} ${contextText}`.trim();

  let best = null;

  for (const rule of SUBJECT_RULES) {
    let score = Number(rule.priority || 0) * 0.05;

    for (const phrase of rule.strong || []) {
      score += subjectPhraseScore(titleText, phrase, 22);
      score += subjectPhraseScore(contextText, phrase, 6);
    }

    for (const phrase of rule.medium || []) {
      score += subjectPhraseScore(titleText, phrase, 10);
      score += subjectPhraseScore(contextText, phrase, 3);
    }

    if (!best || score > best.score) {
      best = { rule, score };
    }
  }

  // Conservative fallback: never force a bad subject if there is no real evidence.
  if (!best || best.score < 18) {
    return {
      ...program,
      broad_subject: "",
      narrow_subject: "",
      specialization: program?.specialization || "",
    };
  }

  const specialization = detectSpecialization(program, best.rule);

  return {
    ...program,
    broad_subject: best.rule.broad || "",
    narrow_subject: best.rule.narrow || "",
    specialization,
  };
}

//Render results
function isCatalogResponse(result) {
  return result?.extractionMode === "catalog";
}

function normalizeCatalogRows(rows) {
  if (!Array.isArray(rows)) return [];

  return rows.map(row => ({
    courseName: row?.courseName || "",
    universityName: row?.universityName || "",
    courseUrl: row?.courseUrl || "",
    levelOfStudy: row?.levelOfStudy || "",
    credits: row?.credits || "",
    creditsUnit: row?.creditsUnit || "",
    duration: row?.duration || "",
    fees: row?.fees || "",
    location: row?.location || "",
    language: row?.language || "",
    modeOfStudy: row?.modeOfStudy || "",
  }));
}

function isCatalogResults() {
  return activeResultsMode === "catalog";
}

function renderResults(sourceUrl) {
  let host;
  try { host = new URL(sourceUrl).hostname; } catch { host = sourceUrl; }
  sourcePill.textContent = host;
  if (countLabel) countLabel.textContent = isCatalogResults() ? "catalog rows found from" : "programs found from";
  filterBar?.classList.toggle("hidden", isCatalogResults());
  noResults.textContent = isCatalogResults() ? "No catalog rows to display." : "No programs match your filters.";
  setResultsTableMode(activeResultsMode);
  resultsSection.classList.remove("hidden");
  applyFiltersAndRender();

  if (!isCatalogResults()) {
    [filterName, filterLevel, filterBroad, filterMode, filterScholarship, filterDept].forEach(el => {
      el.removeEventListener("input", applyFiltersAndRender);
      el.addEventListener("input", applyFiltersAndRender);
    });
  }
}

function applyFiltersAndRender() {
  if (isCatalogResults()) {
    resultCount.textContent = allPrograms.length;
    renderCatalogTable(allPrograms);
    return;
  }

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

function setResultsTableMode(mode) {
  if (!tableHeaderRow) return;
  const nextMode = mode === "catalog" ? "catalog" : "audit";
  if (tableHeaderRow.dataset.mode === nextMode) return;

  tableHeaderRow.innerHTML = nextMode === "catalog"
    ? CATALOG_TABLE_HEADER_HTML
    : AUDIT_TABLE_HEADER_HTML;
  tableHeaderRow.dataset.mode = nextMode;
  bindSortableHeaders();
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

function renderCatalogTable(rows) {
  if (rows.length === 0) {
    tableBody.innerHTML = "";
    noResults.classList.remove("hidden");
    return;
  }
  noResults.classList.add("hidden");

  tableBody.innerHTML = rows.map((row, i) => `
    <tr>
      <td class="col-num">${i + 1}</td>
      <td class="name-cell">${catalogCell(row.courseName)}</td>
      <td>${catalogCell(row.universityName)}</td>
      <td class="catalog-url-cell">${catalogUrlCell(row.courseUrl)}</td>
      <td>${catalogCell(row.levelOfStudy)}</td>
      <td>${catalogCell(row.credits)}</td>
      <td>${catalogCell(row.creditsUnit)}</td>
      <td>${catalogCell(row.duration)}</td>
      <td>${catalogCell(row.fees)}</td>
      <td>${catalogCell(row.location)}</td>
      <td>${catalogCell(row.language)}</td>
      <td>${catalogCell(row.modeOfStudy)}</td>
    </tr>
  `).join("");
}

function catalogCell(value) {
  return value ? esc(value) : '<span class="nil">-</span>';
}

function catalogUrlCell(value) {
  if (!value) return '<span class="nil">-</span>';
  const safeUrl = esc(value);
  return `<a class="url-link" href="${safeUrl}" target="_blank" rel="noopener">${safeUrl}</a>`;
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

async function copyTextToClipboard(value) {
  const text = String(value || "").trim();
  if (!text) return false;

  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the textarea fallback below.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  } finally {
    document.body.removeChild(textarea);
  }

  return ok;
}

function copyButton(label, value, options = {}) {
  const id = registerCopyValue(value, options);
  if (!id) return "";

  return `
    <button type="button" class="copy copy-field-button" data-copy-id="${esc(id)}" aria-label="${esc(label)}">
      <svg class="clipboard" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <rect x="8" y="2" width="8" height="4" rx="1"></rect>
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
      </svg>
      <svg class="checkmark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M20 6 9 17l-5-5"></path>
      </svg>
    </button>
  `;
}

function registerCopyValue(value, options = {}) {
  const text = normalizeCopyValue(value, options);
  if (!text) return "";

  const id = `copy-${copyValueIdCounter += 1}`;
  copyValueStore.set(id, text);
  return id;
}

function normalizeCopyValue(value, { isHtml = false } = {}) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const text = isHtml ? htmlToPlainText(raw) : raw;
  const normalized = text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return isPlaceholderCopyValue(normalized) ? "" : normalized;
}

function htmlToPlainText(html) {
  const temp = document.createElement("div");
  temp.innerHTML = String(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n");
  return temp.textContent || "";
}

function isPlaceholderCopyValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "n/a" || normalized === "na" || normalized === "-";
}

function bindFieldCopyButtons(root) {
  root.querySelectorAll(".copy-field-button").forEach(button => {
    button.addEventListener("click", handleFieldCopyClick);
  });
}

async function handleFieldCopyClick(event) {
  const button = event.currentTarget;
  const value = copyValueStore.get(button.dataset.copyId);
  if (!value) return;

  try {
    const copied = await copyTextToClipboard(value);
    if (!copied) throw new Error("Clipboard copy returned false.");
    showCopyButtonState(button, "is-copied");
  } catch (error) {
    console.warn("Could not copy field value.", error);
    showCopyButtonState(button, "is-copy-error");
  }
}

function showCopyButtonState(button, stateClass) {
  clearTimeout(button._copyStateTimer);
  button.classList.remove("is-copied", "is-copy-error");
  button.classList.add(stateClass);
  button._copyStateTimer = setTimeout(() => {
    button.classList.remove(stateClass);
  }, COPY_FIELD_FEEDBACK_MS);
}

//Modal
function openModal(p) {
  copyValueStore.clear();
  modalTitle.textContent = p.name ?? "Program Details";

  const section = (title, action = "") => `
    <div class="modal-section-title${action ? " modal-section-title-with-action" : ""}">
      <span>${title}</span>
      ${action ? `<span class="modal-field-actions modal-description-actions">${action}</span>` : ""}
    </div>
  `;

  const row = (key, val, isHtml) => {
    const display = val
      ? (isHtml ? val : esc(String(val)))
      : '<span class="nil">N/A</span>';

    return `<div class="modal-row"><span class="modal-key">${key}</span><span class="modal-val">${display}</span></div>`;
  };

  // Description gets its own styled block - rendered as HTML since it may contain formatting
  const descCopyButton = copyButton("Copy program description", p.description, { isHtml: true });
  const descBlock = p.description
    ? `${section("Program Description", descCopyButton)}<div class="modal-description">${p.description}</div>`
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

  bindFieldCopyButtons(modalBody);
  modal.classList.remove("hidden");
}

modalClose.addEventListener("click", () => modal.classList.add("hidden"));
modal.addEventListener("click", e => { if (e.target === modal) modal.classList.add("hidden"); });
document.addEventListener("keydown", e => { if (e.key === "Escape") modal.classList.add("hidden"); });

//Sorting
function bindSortableHeaders() {
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
}

bindSortableHeaders();

//Export CSV
exportBtn.addEventListener("click", () => {
  if (!allPrograms.length) return;
  const cols = isCatalogResults() ? CATALOG_CSV_COLUMNS : AUDIT_CSV_COLUMNS;
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
  const exportType = isCatalogResults() ? "catalog" : "audit";
  a.download = `uniscrape-${exportType}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
});

//Clear
clearBtn.addEventListener("click", () => {
  allPrograms = [];
  activeResultsMode = "audit";
  sortCol = null;
  sortDir = 1;
  urlInput.value = "";
  setResultsTableMode("audit");
  filterBar?.classList.remove("hidden");
  if (countLabel) countLabel.textContent = "programs found from";
  noResults.textContent = "No programs match your filters.";
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
function nextFrame()   { return new Promise(r => requestAnimationFrame(r)); }
function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
