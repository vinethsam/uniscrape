/*
   UniScrape v4.0 - app.js
*/

// Backend extraction config
const EXTRACT_API_URL = "https://api.uniscrape.com/crawl";
const UCAS_JOBS_API_URL = new URL("/ucas/jobs", EXTRACT_API_URL).toString();
const FRONTEND_BUILD_MARKER = "frontend_response_parser_trace_v1";
console.debug("[uniscrape] frontend build", FRONTEND_BUILD_MARKER);

const {
  getFinalRowsFromResponse,
  getUcasDiagnostics,
  hasUcasSecurityPage,
  isUcasResponse,
  isUcasUrl,
  normalizeUcasRows,
} = globalThis.UniScrapeResponseParser || {};

if (
  typeof getFinalRowsFromResponse !== "function" ||
  typeof getUcasDiagnostics !== "function" ||
  typeof hasUcasSecurityPage !== "function" ||
  typeof isUcasResponse !== "function" ||
  typeof isUcasUrl !== "function" ||
  typeof normalizeUcasRows !== "function"
) {
  throw new Error("UniScrape response parser failed to load.");
}

const VERIFY_ACCESS_API_URL = new URL("/verify-access", EXTRACT_API_URL).toString();
const AUTH_GOOGLE_URL = "https://api.uniscrape.com/auth/google";
const AUTH_SETNAME_URL = "https://api.uniscrape.com/auth/set-name-with-token";
const AUTH_STATUS_URL = "https://api.uniscrape.com/auth/status";
const ADMIN_PENDING_URL = "https://api.uniscrape.com/admin/pending";
const ADMIN_APPROVED_URL = "https://api.uniscrape.com/admin/approved";
const ADMIN_APPROVE_URL = "https://api.uniscrape.com/admin/approve";
const ADMIN_REJECT_URL = "https://api.uniscrape.com/admin/reject";
const GOOGLE_CLIENT_ID = "658260663487-sng89uf5tvo0t6915bemcrjl8fb7mchs.apps.googleusercontent.com";
const EXTRACT_TIMEOUT_MS = 300000;
const UCAS_JOB_REQUEST_TIMEOUT_MS = 30000;
const UCAS_JOB_RUNNING_POLL_MS = 4000;
const UCAS_JOB_WAITING_POLL_MIN_MS = 10000;
const UCAS_JOB_WAITING_POLL_MAX_MS = 30000;
const VERIFY_ACCESS_TIMEOUT_MS = 15000;
const UNISCRAPE_ACCESS_CODE_KEY = "uniscrape.accessCode";
const LEGACY_UNISCRAPE_ACCESS_KEY_KEY = "uniscrape.accessKey";
const UNISCRAPE_ACCESS_VERIFIED_SESSION_KEY = "uniscrapeAccessVerified";
const UNISCRAPE_ACCESS_CODE_SESSION_KEY = "uniscrapeAccessCode";
const INVALID_ACCESS_CODE_MESSAGE = "Invalid access code.";
const ACCESS_CODE_VERIFY_ERROR_MESSAGE = "Could not verify access code. Please try again.";
const FINANCIAL_AID_STATEMENT = "This university offers some form of financial aid to prospective students. Please always check the specific requirements and restrictions on scholarship availability.";
const DEFAULT_CONTENT_MODE = "auto";
const DEPTH_ONE_REQUEST_DEFAULTS = Object.freeze({
  enrich_detail_fields: true,
  include_non_award_short_courses: false,
  expand_detail_accordions: true,
  expand_enrichment_accordions: true,
  use_scoped_enrichment_cache: true,
  return_partial_on_timeout: true,
});

// State
let allPrograms = [];
let activeResultsMode = "audit";
let appendNextExtraction = false;
let currentResultMode = null;
let currentUcasModeConfirmed = false;
let appendedSeedUrls = [];
let catalogModeEnabled = false;
let depthOneEnabled = false;
let contentDiagnosticsEnabled = false;
let sortCol = null;
let sortDir = 1;
let copyValueIdCounter = 0;
const copyValueStore = new Map();
const COPY_FIELD_FEEDBACK_MS = 1000;
let currentSession = {
  token: localStorage.getItem("uniscrape_session_token") || "",
  email: "",
  name: localStorage.getItem("uniscrape_display_name") || "",
  isAdmin: false,
};
let pendingGoogleIdToken = "";
let pendingPollInterval = null;
let pendingScrapeAction = null;
let googleIdentityInitialized = false;
let signInSucceededThisAttempt = false;
let activeUcasJob = null;

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
    backendPatch: "",
    routeName: "",
    responseMetaRowCount: null,
    frontendFinalRowCount: null,
    diagnostics: {},
    partial: false,
  },
};

//DOM refs
const urlInput         = document.getElementById("urlInput");
const inputPanel       = document.getElementById("inputPanel");
const appendStatus     = document.getElementById("appendStatus");
const ucasModeStatus   = document.getElementById("ucasModeStatus");
const apiHint          = document.getElementById("apiHint");
const scrapeBtn        = document.getElementById("scrapeBtn");
const statusSection    = document.getElementById("statusSection");
const statusText       = document.getElementById("statusText");
const statusDetail     = document.getElementById("statusDetail");
const progressFill     = document.getElementById("progressFill");
const ucasJobActions   = document.getElementById("ucasJobActions");
const ucasJobCancelBtn = document.getElementById("ucasJobCancelBtn");
const errorSection     = document.getElementById("errorSection");
const errorText        = document.getElementById("errorText");
const retryBtn         = document.getElementById("retryBtn");
const warningSection   = document.getElementById("warningSection");
const warningText      = document.getElementById("warningText");
const resultsSection   = document.getElementById("resultsSection");
const tableBody        = document.getElementById("tableBody");
const resultCount      = document.getElementById("resultCount");
const sourcePill       = document.getElementById("sourcePill");
const exportBtn        = document.getElementById("exportBtn");
const appendBtn        = document.getElementById("appendBtn");
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
const pageBackdrop = document.getElementById("pageBackdrop");
const catalogToggleInput = document.getElementById("catalogToggle");
const depthOneToggleInput = document.getElementById("depthOneToggle");
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
const programTable = document.getElementById("programTable");
const tableHeaderRow = document.querySelector("#programTable thead tr");
const databasesPage = document.getElementById("databasesPage");
const databasesNavLink = document.querySelector('.settings-nav-link[href="/databases"]');
const authModal = document.getElementById("authModal");
const authModalBody = document.getElementById("authModalBody");
const authModalClose = document.getElementById("authModalClose");
const teamAccessModal = document.getElementById("teamAccessModal");
const teamAccessModalClose = document.getElementById("teamAccessModalClose");
const pendingUsersList = document.getElementById("pendingUsersList");
const approvedUsersList = document.getElementById("approvedUsersList");
const accountBadge = document.getElementById("accountBadge");
const accountBadgeInitial = document.getElementById("accountBadgeInitial");
const accountDropdown = document.getElementById("accountDropdown");
const accountDropdownName = document.getElementById("accountDropdownName");
const accountDropdownEmail = document.getElementById("accountDropdownEmail");
const adminShortcutBtn = document.getElementById("adminShortcutBtn");
const signOutBtn = document.getElementById("signOutBtn");

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

const UCAS_TABLE_HEADER_HTML = `
  <th class="col-num">#</th>
  <th>Programme Name</th>
  <th>Award / Qualification</th>
  <th>University / Provider</th>
  <th>UCAS Points</th>
  <th>Fee</th>
  <th>Fee Status / Fee Type</th>
  <th>Study Mode</th>
  <th>Duration</th>
  <th>Start Date</th>
  <th>Location / Campus</th>
  <th>Course URL</th>
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

const UCAS_CSV_COLUMNS = [
  ["Programme Name", "programName"],
  ["Award / Qualification", "qualification"],
  ["University / Provider", "universityProvider"],
  ["UCAS Points", "ucasPoints"],
  ["UCAS Points Min", "ucasPointsMin"],
  ["UCAS Points Max", "ucasPointsMax"],
  ["Fee", "fee"],
  ["Fee Status", "feeStatus"],
  ["International Fee", "internationalFee"],
  ["Home Fee", "homeFee"],
  ["Study Mode", "studyMode"],
  ["Duration", "duration"],
  ["Start Date", "startDate"],
  ["Location / Campus", "location"],
  ["Course URL", "courseUrl"],
  ["Listing Page", "listingPage"],
  ["Source URL", "sourceUrl"],
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
  showBackdrop();
}

function hideAccessCodeModalElement() {
  if (!accessCodeModal) return;
  accessCodeModal.classList.add("hidden");
  accessCodeModal.setAttribute("hidden", "");
  accessCodeModal.setAttribute("aria-hidden", "true");
  hideBackdrop();
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

function isClassLayerOpen(element) {
  return Boolean(element && !element.classList.contains("hidden"));
}

function needsPageBackdrop() {
  return (
    isSettingsMenuOpen()
    || isClassLayerOpen(accountDropdown)
    || isClassLayerOpen(authModal)
    || isClassLayerOpen(teamAccessModal)
    || isClassLayerOpen(modal)
    || isAccessCodeModalOpen()
  );
}

function showBackdrop() {
  if (!pageBackdrop) return;
  pageBackdrop.classList.remove("hidden");
  pageBackdrop.classList.add("visible");
  document.body.classList.add("page-backdrop-visible");
}

function hideBackdrop() {
  if (!pageBackdrop || needsPageBackdrop()) return;
  pageBackdrop.classList.remove("visible");
  document.body.classList.remove("page-backdrop-visible");
}

function openAuthModal(onSuccess = null) {
  pendingScrapeAction = typeof onSuccess === "function" ? onSuccess : null;
  authModal?.classList.remove("hidden");
  showBackdrop();
  renderAuthModalState("signin");
}

function closeAuthModal() {
  authModal?.classList.add("hidden");
  hideBackdrop();
}

function closeTeamAccessModal() {
  teamAccessModal?.classList.add("hidden");
  hideBackdrop();
}

function renderAuthModalMessage(message) {
  if (!authModalBody) return;
  authModalBody.innerHTML = `<p class="field-hint">${esc(message)}</p>`;
}

function renderAuthModalState(state) {
  if (!authModalBody) return;

  if (state !== "pending" && pendingPollInterval) {
    clearInterval(pendingPollInterval);
    pendingPollInterval = null;
  }

  if (state === "signin") {
    const cachedName = localStorage.getItem("uniscrape_display_name") || "";
    authModalBody.innerHTML = `
      <p class="field-hint">Sign in to use UniScrape.</p>
      <input type="text" id="preSignInNameInput" class="text-input" placeholder="Your name, e.g. Timothy" maxlength="80" value="${esc(cachedName)}" />
      <button type="button" id="staticGoogleBtn" class="static-google-btn">
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91A8.78 8.78 0 0 0 17.64 9.2z"/>
          <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.85.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18z"/>
          <path fill="#FBBC05" d="M3.96 10.71A5.41 5.41 0 0 1 3.67 9c0-.59.1-1.17.29-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3-2.33z"/>
          <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A8.59 8.59 0 0 0 9 0a9 9 0 0 0-8.04 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58z"/>
        </svg>
        <span>Sign in with Google</span>
      </button>
    `;
    initGoogleIdentity();
    document.getElementById("staticGoogleBtn")?.addEventListener("click", handleStaticGoogleClick);
    return;
  }

  if (state === "needs_name") {
    authModalBody.innerHTML = `
      <p class="field-label">What name should scrapes be attributed to?</p>
      <input type="text" id="displayNameInput" class="text-input" placeholder="e.g. Timothy" maxlength="80" />
      <button id="saveNameBtn" class="primary-btn">Continue</button>
    `;
    const displayNameInput = document.getElementById("displayNameInput");
    document.getElementById("saveNameBtn")?.addEventListener("click", submitDisplayName);
    displayNameInput?.addEventListener("keydown", e => {
      if (e.key === "Enter") submitDisplayName();
    });
    displayNameInput?.focus();
    return;
  }

  if (state === "pending") {
    authModalBody.innerHTML = `
      <p class="field-label">Access requested</p>
      <p class="field-hint">An admin needs to approve your account before you can use UniScrape. This will update automatically once approved.</p>
    `;
    pollForApproval();
  }
}

function initGoogleIdentity() {
  if (!window.google || !window.google.accounts) {
    setTimeout(initGoogleIdentity, 300);
    return;
  }
  if (googleIdentityInitialized) return;

  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleGoogleSignIn,
    use_fedcm_for_prompt: true,
  });
  googleIdentityInitialized = true;
}

function handleStaticGoogleClick() {
  const btn = document.getElementById("staticGoogleBtn");
  if (!btn) return;

  if (!googleIdentityInitialized || !window.google?.accounts?.id) {
    initGoogleIdentity();
    showError("Google sign-in is still loading. Please try again in a moment.");
    return;
  }

  const label = btn.querySelector("span");
  btn.disabled = true;
  if (label) label.textContent = "Opening Google...";
  signInSucceededThisAttempt = false;

  google.accounts.id.prompt((notification) => {
    setTimeout(() => {
      if (signInSucceededThisAttempt) return;

      btn.disabled = false;
      if (label) label.textContent = "Sign in with Google";

      const wasNotDisplayed = notification.isNotDisplayed?.() || false;
      const wasSkipped = notification.isSkippedMoment?.() || false;
      if (!wasNotDisplayed && !wasSkipped) return;

      const reason = (
        notification.getNotDisplayedReason?.()
        || notification.getSkippedReason?.()
        || "unknown"
      );
      console.warn("[auth] Google prompt closed without a credential. Reason:", reason);

      const blockingReasons = [
        "browser_not_supported",
        "invalid_client",
        "missing_client_id",
        "secure_http_required",
      ];
      if (blockingReasons.includes(reason)) {
        showError(
          "Google sign-in could not open. Please check that third-party cookies/popups are allowed for this site, then try again."
        );
      }
    }, 800);
  });
}

async function handleGoogleSignIn(response) {
  signInSucceededThisAttempt = true;

  const btn = document.getElementById("staticGoogleBtn");
  if (btn) {
    btn.disabled = false;
    const label = btn.querySelector("span");
    if (label) label.textContent = "Sign in with Google";
  }

  pendingGoogleIdToken = response?.credential || "";
  if (!pendingGoogleIdToken) {
    renderAuthModalMessage("Sign-in failed: Google did not return an identity token.");
    return;
  }

  const typedName = document.getElementById("preSignInNameInput")?.value?.trim() || "";
  renderAuthModalMessage("Checking your account...");

  if (typedName) {
    try {
      const res = await fetch(`${AUTH_SETNAME_URL}?name=${encodeURIComponent(typedName)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_token: pendingGoogleIdToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.status === "approved") {
        applySession(data);
        return;
      }
    } catch {
      // Fall through to the normal Google sign-in flow.
    }
  }

  try {
    const res = await fetch(AUTH_GOOGLE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_token: pendingGoogleIdToken }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      renderAuthModalMessage(data.detail || "Sign-in could not be completed.");
      return;
    }
    if (data.status === "needs_name") {
      renderAuthModalState("needs_name");
      return;
    }
    if (data.status === "pending") {
      renderAuthModalState("pending");
      return;
    }
    if (data.status === "approved") {
      applySession(data);
      return;
    }

    renderAuthModalMessage("Sign-in returned an unexpected account status.");
  } catch (e) {
    renderAuthModalMessage("Sign-in failed: " + e.message);
  }
}

function applySession(data) {
  const sessionToken = data.session_token || currentSession.token;
  if (!sessionToken) {
    renderAuthModalMessage("Sign-in completed without a session token. Please try again.");
    return;
  }

  currentSession = {
    token: sessionToken,
    email: data.email || currentSession.email || "",
    name: data.name || currentSession.name || "",
    isAdmin: Boolean(data.is_admin),
  };
  localStorage.setItem("uniscrape_session_token", sessionToken);
  localStorage.setItem("uniscrape_display_name", currentSession.name);

  if (pendingPollInterval) {
    clearInterval(pendingPollInterval);
    pendingPollInterval = null;
  }
  pendingGoogleIdToken = "";
  closeAuthModal();

  if (!currentSession.isAdmin) {
    closeTeamAccessModal();
    if (pendingUsersList) pendingUsersList.innerHTML = "";
    if (approvedUsersList) approvedUsersList.innerHTML = "";
  }

  updateAccountBadge();

  if (pendingScrapeAction) {
    const action = pendingScrapeAction;
    pendingScrapeAction = null;
    action();
  }
}

async function submitDisplayName() {
  const name = document.getElementById("displayNameInput")?.value?.trim();
  if (!name) return;

  renderAuthModalMessage("Saving...");

  try {
    const res = await fetch(`${AUTH_SETNAME_URL}?name=${encodeURIComponent(name)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_token: pendingGoogleIdToken }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      renderAuthModalMessage(data.detail || "Could not save name.");
      return;
    }
    if (data.status === "needs_name") {
      renderAuthModalState("needs_name");
      return;
    }
    if (data.status === "pending") {
      renderAuthModalState("pending");
      return;
    }
    if (data.status === "approved" || data.session_token) {
      applySession(data);
      return;
    }

    renderAuthModalMessage("Saving your name returned an unexpected account status.");
  } catch (e) {
    renderAuthModalMessage("Failed: " + e.message);
  }
}

function pollForApproval() {
  if (pendingPollInterval) clearInterval(pendingPollInterval);
  pendingPollInterval = setInterval(async () => {
    try {
      const res = await fetch(AUTH_GOOGLE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_token: pendingGoogleIdToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;

      if (data.status === "needs_name") {
        clearInterval(pendingPollInterval);
        pendingPollInterval = null;
        renderAuthModalState("needs_name");
      } else if (data.status === "approved") {
        clearInterval(pendingPollInterval);
        pendingPollInterval = null;
        applySession(data);
      }
    } catch {
      // Silent: retry on the next interval.
    }
  }, 8000);
}

async function restoreSession() {
  if (!currentSession.token) {
    updateAccountBadge();
    return;
  }

  try {
    const res = await fetch(AUTH_STATUS_URL, {
      headers: { Authorization: `Bearer ${currentSession.token}` },
    });
    if (!res.ok) {
      localStorage.removeItem("uniscrape_session_token");
      localStorage.removeItem("uniscrape_display_name");
      currentSession = { token: "", email: "", name: "", isAdmin: false };
      closeTeamAccessModal();
      updateAccountBadge();
      return;
    }
    const data = await res.json();
    applySession(data);
  } catch {
    currentSession = { token: "", email: "", name: "", isAdmin: false };
    closeTeamAccessModal();
    updateAccountBadge();
  }
}

async function loadAdminLists() {
  if (!currentSession.isAdmin) return;
  const headers = { Authorization: `Bearer ${currentSession.token}` };

  try {
    const [pendingRes, approvedRes] = await Promise.all([
      fetch(ADMIN_PENDING_URL, { headers }),
      fetch(ADMIN_APPROVED_URL, { headers }),
    ]);
    if (!pendingRes.ok || !approvedRes.ok) {
      throw new Error("Admin access list request failed.");
    }

    const pending = await pendingRes.json();
    const approved = await approvedRes.json();
    renderAdminLists(pending, approved);
  } catch (e) {
    console.warn("Failed to load admin lists:", e.message);
  }
}

function renderAdminLists(pending, approved) {
  if (!pendingUsersList || !approvedUsersList) return;

  const pendingUsers = Array.isArray(pending) ? pending : [];
  const approvedUsers = Array.isArray(approved) ? approved : [];

  pendingUsersList.innerHTML = pendingUsers.length
    ? pendingUsers.map(user => `
        <div class="settings-row">
          <span class="debug-k">${esc(user.email || "")}</span>
          <span class="debug-actions">
            <button type="button" class="secondary-btn admin-approve-btn" data-email="${esc(user.email || "")}">Approve</button>
            <button type="button" class="ghost-btn admin-reject-btn" data-email="${esc(user.email || "")}">Reject</button>
          </span>
        </div>
      `).join("")
    : '<p class="field-hint">No pending requests.</p>';

  approvedUsersList.innerHTML = approvedUsers.length
    ? `<p class="field-label">Team (${approvedUsers.length})</p>` +
      approvedUsers.map(user => `
        <div class="settings-row">
          <span class="debug-k">${esc(user.name || "(name pending)")} - ${esc(user.email || "")}${user.is_admin ? " (admin)" : ""}</span>
        </div>
      `).join("")
    : "";

  pendingUsersList.querySelectorAll(".admin-approve-btn").forEach(button => {
    button.addEventListener("click", () => handleAdminAction(ADMIN_APPROVE_URL, button.dataset.email));
  });
  pendingUsersList.querySelectorAll(".admin-reject-btn").forEach(button => {
    button.addEventListener("click", () => handleAdminAction(ADMIN_REJECT_URL, button.dataset.email));
  });
}

async function handleAdminAction(url, email) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${currentSession.token}`,
      },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.detail || "The admin action was not accepted.");
    }
    loadAdminLists();
  } catch (e) {
    showError("Admin action failed: " + e.message);
  }
}

function updateAccountBadge() {
  if (!accountBadge || !accountBadgeInitial) return;

  const signedIn = Boolean(currentSession.token && currentSession.name);
  accountBadge.classList.toggle("signed-in", signedIn);
  accountBadgeInitial.textContent = signedIn
    ? currentSession.name.trim().charAt(0).toUpperCase()
    : "";
  accountBadge.setAttribute("aria-label", signedIn ? `Account for ${currentSession.name}` : "Sign in");

  if (accountDropdownName) accountDropdownName.textContent = signedIn ? currentSession.name : "";
  if (accountDropdownEmail) accountDropdownEmail.textContent = signedIn ? currentSession.email : "";
  adminShortcutBtn?.classList.toggle("hidden", !signedIn || !currentSession.isAdmin);
}

authModalClose?.addEventListener("click", closeAuthModal);
authModal?.addEventListener("click", e => {
  if (e.target === authModal) closeAuthModal();
});
teamAccessModalClose?.addEventListener("click", closeTeamAccessModal);
teamAccessModal?.addEventListener("click", e => {
  if (e.target === teamAccessModal) closeTeamAccessModal();
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && authModal && !authModal.classList.contains("hidden")) {
    closeAuthModal();
  }
  if (e.key === "Escape" && teamAccessModal && !teamAccessModal.classList.contains("hidden")) {
    closeTeamAccessModal();
  }
});

accountBadge?.addEventListener("click", () => {
  if (!currentSession.token) {
    openAuthModal(null);
    return;
  }
  setSettingsMenuOpen(false);
  accountDropdown?.classList.toggle("hidden");
  if (isClassLayerOpen(accountDropdown)) {
    showBackdrop();
  } else {
    hideBackdrop();
  }
});

signOutBtn?.addEventListener("click", () => {
  localStorage.removeItem("uniscrape_session_token");
  localStorage.removeItem("uniscrape_display_name");
  currentSession = { token: "", email: "", name: "", isAdmin: false };
  pendingScrapeAction = null;
  if (pendingPollInterval) {
    clearInterval(pendingPollInterval);
    pendingPollInterval = null;
  }
  accountDropdown?.classList.add("hidden");
  closeTeamAccessModal();
  hideBackdrop();
  updateAccountBadge();
});

adminShortcutBtn?.addEventListener("click", () => {
  accountDropdown?.classList.add("hidden");
  setSettingsMenuOpen(false);
  teamAccessModal?.classList.remove("hidden");
  showBackdrop();
  loadAdminLists();
});

document.addEventListener("click", e => {
  if (!accountDropdown || !accountBadge) return;
  if (
    !accountDropdown.classList.contains("hidden")
    && !accountDropdown.contains(e.target)
    && !accountBadge.contains(e.target)
  ) {
    accountDropdown.classList.add("hidden");
    hideBackdrop();
  }
});

pageBackdrop?.addEventListener("click", () => {
  accountDropdown?.classList.add("hidden");
  setSettingsMenuOpen(false);
  hideBackdrop();
});

document.addEventListener("DOMContentLoaded", () => {
  restoreSession();
});

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
initStaticRoutes();

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
if (depthOneToggleInput) {
  depthOneToggleInput.checked = false;
  depthOneToggleInput.addEventListener("change", () => {
    depthOneEnabled = depthOneToggleInput.checked;
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
let lastStatusProgress = 0;

function startStatusSequence(messages, intervalMs = 3500) {
  stopStatusSequence();

  if (!Array.isArray(messages) || !messages.length) {
    return;
  }

  let index = 0;
  let lastProgress = Math.max(0, Number(messages[index].progress) || 0);
  lastStatusProgress = 0;
  showStatus(messages[index].text, lastProgress);

  statusSequenceTimer = setInterval(() => {
    if (index < messages.length - 1) {
      index += 1;
    }

    lastProgress = Math.max(lastProgress, Number(messages[index].progress) || 0);
    showStatus(messages[index].text, lastProgress);
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

function buildBackendExtractPayload(url, debugOnly, catalogMode = false, depthOne = false) {
  const payload = {
    url,
    debug: debugOnly,
    extract_details: Boolean(depthOne),
    extractionMode: catalogMode ? "catalog" : "audit",
  };

  if (depthOne) {
    Object.assign(payload, DEPTH_ONE_REQUEST_DEFAULTS);
  }

  return payload;
}

function getSessionTokenOrThrow() {
  const sessionToken = String(currentSession.token || "").trim();
  if (!sessionToken) {
    const error = new Error("Your session has expired. Please sign in again.");
    error.code = "SESSION_AUTH_REQUIRED";
    throw error;
  }

  return sessionToken;
}

function buildAuthorizedJsonHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getSessionTokenOrThrow()}`,
  };
}

async function readJsonResponse(res) {
  return res.json().catch(() => null);
}

function createUcasJobUnavailableError(message = "UCAS job route is unavailable.") {
  const error = new Error(message);
  error.code = "UCAS_JOB_ROUTE_UNAVAILABLE";
  return error;
}

function isUcasJobUnavailableError(error) {
  return error?.code === "UCAS_JOB_ROUTE_UNAVAILABLE";
}

function readBackendAuthError(res, data, fallbackMessage) {
  const backendDetail = String(data?.detail || data?.message || "");
  if (res.status === 401 || res.status === 403) {
    const error = new Error(backendDetail || fallbackMessage || "Your session is not authorised for extraction.");
    error.code = /password|access code/i.test(backendDetail)
      ? "EXTRACTION_AUTH_REJECTED"
      : "SESSION_AUTH_REQUIRED";
    throw error;
  }
}

async function sendBackendExtractRequest(url, debugOnly, catalogMode = false, depthOne = false) {
  const payload = buildBackendExtractPayload(url, debugOnly, catalogMode, depthOne);
  const headers = buildAuthorizedJsonHeaders();

  console.debug("[uniscrape] extraction request", {
    apiUrl: EXTRACT_API_URL,
    extractionMode: payload.extractionMode,
    extract_details: payload.extract_details,
    debug: payload.debug,
    hasAuthorization: Boolean(headers.Authorization),
  });

  const res = await fetch(EXTRACT_API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(EXTRACT_TIMEOUT_MS),
  });

  return res;
}

async function readBackendExtractResponse(res) {
  const data = await readJsonResponse(res);

  console.debug("[uniscrape] raw response row fields", {
    backendPatch: data?.responseMeta?.backendPatch,
    routeName: data?.responseMeta?.routeName,
    responseMetaRowCount: data?.responseMeta?.rowCount,
    catalogRows: Array.isArray(data?.catalogRows) ? data.catalogRows.length : null,
    programmes: Array.isArray(data?.programmes) ? data.programmes.length : null,
    programs: Array.isArray(data?.programs) ? data.programs.length : null,
    programmeCandidates: Array.isArray(data?.programmeCandidates)
      ? data.programmeCandidates.length
      : null,
    finalOutputSource: data?.finalOutputSource || data?.debugRowContract?.finalOutputSource,
    debugRowContract: data?.debugRowContract,
  });

  const backendDetail = String(data?.detail || "");

  if (/Full production depth-1 extraction is not implemented yet/i.test(backendDetail)) {
    throw new Error(
      "The deployed backend is out of date and still requires debug mode for Depth-1. Deploy the current backend patch and try again."
    );
  }

  readBackendAuthError(res, data, "Your session is not authorised for extraction.");

  const hasUsablePartialUcasRows =
    isUcasResponse(data) &&
    isPartialResponse(data) &&
    getFinalRowsFromResponse(data, "ucas").length > 0;

  if (!res.ok && hasUsablePartialUcasRows) {
    updateDebugStateFromBackend(data);
    return data;
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

async function useBackendExtract(url, debugOnly, catalogMode = false, depthOne = false) {
  const res = await sendBackendExtractRequest(url, debugOnly, catalogMode, depthOne);
  return readBackendExtractResponse(res);
}

function buildUcasJobPayload(url, debugOnly) {
  return {
    url,
    debug: debugOnly,
    extractionMode: "catalog",
  };
}

function getJobIdFromPayload(payload) {
  return firstTrimmedValue(
    payload?.job_id,
    payload?.jobId,
    payload?.id,
    payload?.job?.job_id,
    payload?.job?.jobId,
    payload?.job?.id,
  );
}

function getUcasJobUrl(jobId, suffix = "") {
  const encodedJobId = encodeURIComponent(jobId);
  return `${UCAS_JOBS_API_URL}/${encodedJobId}${suffix}`;
}

async function startUcasJob(url, debugOnly) {
  const payload = buildUcasJobPayload(url, debugOnly);
  let res;
  try {
    res = await fetch(UCAS_JOBS_API_URL, {
      method: "POST",
      headers: buildAuthorizedJsonHeaders(),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(UCAS_JOB_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error?.name === "AbortError" || error instanceof TypeError) {
      throw createUcasJobUnavailableError("UCAS job route could not be reached.");
    }
    throw error;
  }
  const data = await readJsonResponse(res);

  readBackendAuthError(res, data, "Your session is not authorised for UCAS extraction.");

  if ([404, 405, 501].includes(res.status)) {
    throw createUcasJobUnavailableError(data?.detail || "UCAS job route is unavailable.");
  }

  if (!res.ok) {
    throw new Error(data?.detail || data?.message || "UCAS job could not be started with HTTP " + res.status);
  }

  const jobId = getJobIdFromPayload(data);
  if (!jobId) {
    throw createUcasJobUnavailableError("UCAS job route did not return a job id.");
  }

  return { ...data, job_id: jobId };
}

async function fetchUcasJobStatus(jobId) {
  const res = await fetch(getUcasJobUrl(jobId), {
    method: "GET",
    headers: buildAuthorizedJsonHeaders(),
    signal: AbortSignal.timeout(UCAS_JOB_REQUEST_TIMEOUT_MS),
  });
  const data = await readJsonResponse(res);

  readBackendAuthError(res, data, "Your session is not authorised for UCAS extraction.");

  if (!res.ok) {
    throw new Error(data?.detail || data?.message || "UCAS job status failed with HTTP " + res.status);
  }

  return { ...data, job_id: getJobIdFromPayload(data) || jobId };
}

async function fetchUcasJobResults(jobId) {
  const res = await fetch(getUcasJobUrl(jobId, "/results"), {
    method: "GET",
    headers: buildAuthorizedJsonHeaders(),
    signal: AbortSignal.timeout(UCAS_JOB_REQUEST_TIMEOUT_MS),
  });
  const data = await readJsonResponse(res);

  readBackendAuthError(res, data, "Your session is not authorised for UCAS extraction.");

  if ([404, 405, 501].includes(res.status)) return null;

  if (!res.ok) {
    throw new Error(data?.detail || data?.message || "UCAS job results failed with HTTP " + res.status);
  }

  return data;
}

function getObjectSources(value) {
  const sources = [];
  const add = item => {
    if (item && typeof item === "object" && !Array.isArray(item) && !sources.includes(item)) {
      sources.push(item);
    }
  };

  add(value);
  add(value?.job);
  add(value?.data);
  add(value?.status);
  add(value?.progress);
  add(value?.metrics);
  add(value?.stats);
  add(value?.diagnostics);
  add(value?.data?.job);
  add(value?.data?.progress);
  add(value?.data?.metrics);
  add(value?.data?.stats);
  add(value?.data?.diagnostics);

  return sources;
}

function firstPresentValue(...values) {
  return values.find(value =>
    value === 0 || value === false || (value !== undefined && value !== null && String(value).trim() !== "")
  );
}

function firstJobValue(payloads, keys) {
  const sources = payloads.flatMap(getObjectSources);
  for (const source of sources) {
    for (const key of keys) {
      const value = source[key];
      if (value === 0 || value === false || (value !== undefined && value !== null && String(value).trim() !== "")) {
        return value;
      }
    }
  }
  return undefined;
}

function normalizeUcasJobStatus(value) {
  const status = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const aliases = {
    completed: "complete",
    success: "complete",
    succeeded: "complete",
    done: "complete",
    canceled: "cancelled",
    canceling: "cancelled",
    retry_wait: "waiting",
    backoff: "waiting",
    rate_limit: "rate_limited",
    rate_limited_wait: "rate_limited",
  };
  return aliases[status] || status || "running";
}

function getUcasJobStatus(payloads) {
  return normalizeUcasJobStatus(firstJobValue(payloads, [
    "status",
    "state",
    "job_status",
    "jobStatus",
  ]));
}

function isUcasJobTerminal(status) {
  return ["complete", "failed", "cancelled"].includes(normalizeUcasJobStatus(status));
}

function isUcasJobWaiting(status, payloads) {
  const normalizedStatus = normalizeUcasJobStatus(status);
  if (["waiting", "rate_limited", "paused"].includes(normalizedStatus)) return true;

  const waitingValue = firstJobValue(payloads, [
    "waiting",
    "rate_limited",
    "rateLimited",
    "is_waiting",
    "isWaiting",
  ]);
  return waitingValue === true || String(waitingValue).toLowerCase() === "true";
}

function sanitizeUcasProgressText(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/\b(playwright|browser rendering|accordion|accordions|ai|model api|openrouter|model json|llm)\b/i.test(text)) {
    return "";
  }
  return text;
}

function humanizeUcasPhase(value, status = "") {
  const cleaned = sanitizeUcasProgressText(value);
  const phase = cleaned.toLowerCase().replace(/[\s-]+/g, "_");
  const normalizedStatus = normalizeUcasJobStatus(status);

  if (normalizedStatus === "queued") return "UCAS job queued";
  if (normalizedStatus === "complete") return "UCAS extraction complete";
  if (normalizedStatus === "failed") return "UCAS extraction failed";
  if (normalizedStatus === "cancelled") return "UCAS extraction cancelled";
  if (normalizedStatus === "rate_limited" || phase.includes("rate")) {
    return "UCAS rate-limit detected - waiting before retry";
  }
  if (normalizedStatus === "waiting" || phase.includes("wait") || phase.includes("backoff")) {
    return "UCAS is waiting before retry";
  }
  if (phase.includes("fee") && phase.includes("fund")) return "Reading Fees and funding sections";
  if (phase.includes("fee")) return "Fetching UCAS fee pages";
  if (phase.includes("pagination")) return "Checking UCAS pagination";
  if (phase.includes("link")) return "Collecting UCAS course links";
  if (phase.includes("listing") || phase.includes("search")) return "Fetching UCAS listing pages";
  if (phase.includes("save")) return "Saving UCAS progress";
  if (phase.includes("resume")) return "Resuming UCAS extraction";
  if (phase.includes("validat")) return "Validating UCAS completeness";
  if (phase.includes("catalog") || phase.includes("prepar")) return "Preparing UCAS catalog";

  return cleaned || "Fetching UCAS listing pages";
}

function getUcasJobPhase(payloads, status) {
  return humanizeUcasPhase(firstJobValue(payloads, [
    "phase",
    "current_phase",
    "currentPhase",
    "stage",
    "step",
    "message",
  ]), status);
}

function getUcasJobExpectedCount(payloads) {
  return firstJobValue(payloads, [
    "expected_count",
    "expectedCount",
    "expected_result_count",
    "expectedResultCount",
    "total",
    "total_count",
    "totalCount",
    "uniqueCourses",
  ]);
}

function getUcasJobRowsCollected(payloads, fallbackRows = 0) {
  return firstPresentValue(firstJobValue(payloads, [
    "rows_collected",
    "rowsCollected",
    "rows_output",
    "rowsOutput",
    "result_count",
    "resultCount",
    "completed_rows",
    "completedRows",
  ]), fallbackRows);
}

function formatUcasRetryTime(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  return text;
}

function formatUcasJobProgressDetail(payloads, rowsLength) {
  const status = getUcasJobStatus(payloads);
  const phase = getUcasJobPhase(payloads, status);
  const expectedCount = getUcasJobExpectedCount(payloads);
  const rowsCollected = getUcasJobRowsCollected(payloads, rowsLength);
  const listingPagesFetched = firstJobValue(payloads, ["listing_pages_fetched", "listingPagesFetched"]);
  const feePagesCompleted = firstJobValue(payloads, ["fee_pages_completed", "feePagesCompleted", "feeFoundCount"]);
  const feePagesRemaining = firstJobValue(payloads, ["fee_pages_remaining", "feePagesRemaining"]);
  const nextRetryAt = firstJobValue(payloads, ["next_retry_at", "nextRetryAt"]);
  const eta = firstJobValue(payloads, ["estimated_remaining_time", "estimatedRemainingTime", "eta", "eta_seconds", "etaSeconds"]);

  const parts = [
    `Status: ${status.replace(/_/g, " ")}`,
    phase ? `Phase: ${phase}` : "",
    expectedCount !== undefined
      ? `Rows: ${rowsCollected || 0} / ${expectedCount}`
      : `Rows: ${rowsCollected || 0}`,
    listingPagesFetched !== undefined ? `Listing pages fetched: ${listingPagesFetched}` : "",
    feePagesCompleted !== undefined ? `Fee pages completed: ${feePagesCompleted}` : "",
    feePagesRemaining !== undefined ? `Fee pages remaining: ${feePagesRemaining}` : "",
    nextRetryAt ? `Next retry: ${formatUcasRetryTime(nextRetryAt)}` : "",
    eta ? `Estimated remaining: ${eta}` : "",
  ].filter(Boolean);

  return parts.join(" | ");
}

function getUcasJobProgressPercent(payloads, rowsLength) {
  const explicitProgress = Number(firstJobValue(payloads, [
    "progress_percent",
    "progressPercent",
    "percent",
    "percentage",
  ]));
  if (Number.isFinite(explicitProgress) && explicitProgress >= 0) {
    return Math.min(100, explicitProgress);
  }

  const status = getUcasJobStatus(payloads);
  if (status === "queued") return 12;
  if (status === "complete") return 100;
  if (status === "failed" || status === "cancelled") return Math.max(lastStatusProgress, rowsLength ? 88 : 40);

  const expectedCount = Number(getUcasJobExpectedCount(payloads));
  if (Number.isFinite(expectedCount) && expectedCount > 0) {
    return Math.min(92, Math.max(16, Math.round((rowsLength / expectedCount) * 82)));
  }

  return isUcasJobWaiting(status, payloads)
    ? Math.max(lastStatusProgress, 45)
    : Math.max(lastStatusProgress, 26);
}

function getUcasPollDelay(payloads) {
  const status = getUcasJobStatus(payloads);
  if (!isUcasJobWaiting(status, payloads)) return UCAS_JOB_RUNNING_POLL_MS;

  const nextRetryAt = firstJobValue(payloads, ["next_retry_at", "nextRetryAt"]);
  if (nextRetryAt) {
    const retryMs = new Date(nextRetryAt).getTime();
    if (Number.isFinite(retryMs)) {
      const delayMs = retryMs - Date.now() + 500;
      return Math.min(
        UCAS_JOB_WAITING_POLL_MAX_MS,
        Math.max(UCAS_JOB_WAITING_POLL_MIN_MS, delayMs),
      );
    }
  }

  return UCAS_JOB_WAITING_POLL_MIN_MS;
}

function collectUcasRowsFromPayload(payload, depth = 0) {
  if (!payload || depth > 3) return [];
  if (Array.isArray(payload)) return payload;
  if (typeof payload !== "object") return [];

  const directRows = getFinalRowsFromResponse(payload, "ucas");
  if (directRows.length) return directRows;

  const directKeys = [
    "partialRows",
    "partial_rows",
    "resultRows",
    "result_rows",
    "courses",
    "records",
    "items",
  ];
  for (const key of directKeys) {
    if (Array.isArray(payload[key]) && payload[key].length) return payload[key];
  }

  const nestedKeys = ["results", "result", "data", "payload", "job"];
  for (const key of nestedKeys) {
    const nestedRows = collectUcasRowsFromPayload(payload[key], depth + 1);
    if (nestedRows.length) return nestedRows;
  }

  return [];
}

function getBestUcasRowsFromPayloads(...payloads) {
  for (const payload of payloads) {
    const rows = collectUcasRowsFromPayload(payload);
    if (rows.length) return rows;
  }
  return [];
}

function collectUcasWarnings(...payloads) {
  const warnings = [];
  payloads.forEach(payload => {
    if (!payload || typeof payload !== "object") return;
    [
      payload.warnings,
      payload.warning,
      payload.diagnostics?.warnings,
      payload.frontendDiagnostics?.warnings,
      payload.data?.warnings,
      payload.data?.diagnostics?.warnings,
    ].forEach(value => {
      if (Array.isArray(value)) warnings.push(...value);
      else if (value) warnings.push(value);
    });
  });

  return [...new Set(warnings.map(value => String(value)).filter(Boolean))];
}

function buildUcasJobDiagnostics(jobId, statusPayload, resultsPayload, rows, sourceUrl) {
  const payloads = [statusPayload, resultsPayload].filter(Boolean);
  const statusDiagnostics = getUcasDiagnostics(statusPayload);
  const resultsDiagnostics = getUcasDiagnostics(resultsPayload);
  const status = getUcasJobStatus(payloads);
  const waiting = isUcasJobWaiting(status, payloads);
  const expectedCount = getUcasJobExpectedCount(payloads);
  const rowsCollected = getUcasJobRowsCollected(payloads, rows.length);
  const nextRetryAt = firstJobValue(payloads, ["next_retry_at", "nextRetryAt"]);
  const feePagesCompleted = firstJobValue(payloads, ["fee_pages_completed", "feePagesCompleted"]);
  const feePagesRemaining = firstJobValue(payloads, ["fee_pages_remaining", "feePagesRemaining"]);

  return {
    ...statusDiagnostics,
    ...resultsDiagnostics,
    ucasMode: true,
    ucasDetected: true,
    staticOnly: true,
    jobId,
    jobStatus: status,
    phase: getUcasJobPhase(payloads, status),
    expectedResultCount: expectedCount ?? resultsDiagnostics.expectedResultCount ?? statusDiagnostics.expectedResultCount,
    rowsCollected,
    rowsOutput: rows.length || resultsDiagnostics.rowsOutput || statusDiagnostics.rowsOutput,
    listingPagesFetched: firstJobValue(payloads, ["listing_pages_fetched", "listingPagesFetched"]) ?? resultsDiagnostics.listingPagesFetched ?? statusDiagnostics.listingPagesFetched,
    feePagesCompleted,
    feePagesRemaining,
    rateLimited: status === "rate_limited" || waiting,
    waiting,
    nextRetryAt,
    estimatedRemainingTime: firstJobValue(payloads, ["estimated_remaining_time", "estimatedRemainingTime", "eta", "eta_seconds", "etaSeconds"]),
    sourceUrl,
    partial: status === "failed" || status === "cancelled" || waiting
      ? true
      : (resultsDiagnostics.partial ?? statusDiagnostics.partial),
    ucasComplete: status === "complete"
      ? (resultsDiagnostics.ucasComplete ?? statusDiagnostics.ucasComplete ?? true)
      : (resultsDiagnostics.ucasComplete ?? statusDiagnostics.ucasComplete ?? false),
  };
}

function buildUcasJobResult(jobId, statusPayload, resultsPayload, latestRows, sourceUrl) {
  const rows = getBestUcasRowsFromPayloads(resultsPayload, statusPayload, latestRows);
  const diagnostics = buildUcasJobDiagnostics(jobId, statusPayload, resultsPayload, rows, sourceUrl);
  const warnings = collectUcasWarnings(statusPayload, resultsPayload);

  return {
    catalogRows: rows,
    rows,
    diagnostics,
    warnings,
    partial: Boolean(diagnostics.partial),
    responseMeta: {
      backendPatch: "ucas_jobs",
      routeName: "ucas_jobs",
      rowCount: rows.length,
      jobId,
    },
  };
}

function setUcasJobActionsVisible(isVisible) {
  ucasJobActions?.classList.toggle("hidden", !isVisible);
  if (!ucasJobCancelBtn) return;
  ucasJobCancelBtn.disabled = !isVisible;
  ucasJobCancelBtn.textContent = "Cancel UCAS job";
}

function mergeSeedUrls(seedUrls, url) {
  return [...new Set([...(Array.isArray(seedUrls) ? seedUrls : []), url].filter(Boolean))];
}

function tagRowsWithMode(rows, mode) {
  return rows.map(row => {
    if (!row || typeof row !== "object") return row;
    const tagged = { ...row };
    Object.defineProperty(tagged, "__resultMode", {
      value: mode,
      enumerable: false,
      configurable: true,
    });
    return tagged;
  });
}

function renderUcasJobRows(rawRows, request, baseState, statusPayload, resultsPayload) {
  const normalizedRows = tagRowsWithMode(normalizeUcasRows(rawRows), "ucas");
  if (!normalizedRows.length) return;

  const baseRows = Array.isArray(baseState?.rows) ? baseState.rows : [];
  const baseMode = baseState?.mode || currentResultMode;
  const displayMode = baseRows.length && baseMode && baseMode !== "ucas" ? baseMode : "ucas";

  if (baseRows.length) {
    const { rows } = appendUniqueRows(baseRows, normalizedRows, "ucas");
    allPrograms = rows;
  } else {
    allPrograms = normalizedRows;
  }

  activeResultsMode = displayMode;
  currentResultMode = displayMode;
  currentUcasModeConfirmed = true;
  appendedSeedUrls = mergeSeedUrls(baseState?.seedUrls, request.url);
  updateUcasModeStatus({ active: true, diagnostics: buildUcasJobDiagnostics("", statusPayload, resultsPayload, rawRows, request.url) });

  renderResults(request.url);
}

function showUcasJobNotice(payloads, rowsLength) {
  const status = getUcasJobStatus(payloads);

  if (isUcasJobWaiting(status, payloads)) {
    showWarning("UCAS is rate-limiting requests. Waiting before retry. Rows collected so far are shown.");
    return;
  }

  if (status === "failed") {
    showWarning(
      rowsLength
        ? "UCAS extraction incomplete - review diagnostics before using this as final data."
        : "UCAS extraction failed. Review diagnostics before retrying."
    );
    return;
  }

  if (status === "cancelled") {
    showWarning(
      rowsLength
        ? "UCAS job cancelled. Rows collected so far are shown."
        : "UCAS job cancelled before rows were collected."
    );
  }
}

async function runUcasJobExtraction(request, baseState) {
  const started = await startUcasJob(request.url, request.debugOnly);
  const jobId = started.job_id;
  let statusPayload = started;
  let resultsPayload = null;
  let latestRows = getBestUcasRowsFromPayloads(statusPayload);
  let shouldFetchStatus = false;

  activeUcasJob = {
    jobId,
    cancelRequested: false,
  };
  setUcasJobActionsVisible(true);
  currentUcasModeConfirmed = true;
  updateUcasModeStatus({ active: true, diagnostics: { ucasMode: true, staticOnly: true } });

  try {
    while (true) {
      if (shouldFetchStatus) {
        statusPayload = await fetchUcasJobStatus(jobId);
      }
      shouldFetchStatus = true;

      try {
        resultsPayload = await fetchUcasJobResults(jobId);
      } catch (resultsError) {
        if (request.debugOnly) console.warn("Could not fetch UCAS job results yet.", resultsError);
      }

      latestRows = getBestUcasRowsFromPayloads(resultsPayload, statusPayload, latestRows);
      const payloads = [statusPayload, resultsPayload].filter(Boolean);
      const status = getUcasJobStatus(payloads);
      const phase = getUcasJobPhase(payloads, status);
      const rowsLength = latestRows.length;

      if (rowsLength) {
        renderUcasJobRows(latestRows, request, baseState, statusPayload, resultsPayload);
      }

      showStatus(phase, getUcasJobProgressPercent(payloads, rowsLength));
      setStatusDetail(formatUcasJobProgressDetail(payloads, rowsLength));
      showUcasJobNotice(payloads, rowsLength);

      if (isUcasJobTerminal(status)) {
        return buildUcasJobResult(jobId, statusPayload, resultsPayload, latestRows, request.url);
      }

      await sleep(getUcasPollDelay(payloads));
    }
  } finally {
    activeUcasJob = null;
    setUcasJobActionsVisible(false);
  }
}

async function handleUcasJobCancelClick() {
  if (!activeUcasJob?.jobId || activeUcasJob.cancelRequested) return;

  activeUcasJob.cancelRequested = true;
  if (ucasJobCancelBtn) {
    ucasJobCancelBtn.disabled = true;
    ucasJobCancelBtn.textContent = "Cancelling...";
  }
  showStatus("Cancelling UCAS job", Math.max(lastStatusProgress, 40));

  try {
    await cancelUcasJob(activeUcasJob.jobId);
  } catch (error) {
    if (isUcasJobUnavailableError(error)) {
      showWarning("UCAS job cancellation is not available on this backend.");
    } else {
      showWarning("Could not cancel UCAS job. It may already be finishing.");
    }
    if (ucasJobCancelBtn) {
      ucasJobCancelBtn.disabled = false;
      ucasJobCancelBtn.textContent = "Cancel UCAS job";
    }
  }
}

async function cancelUcasJob(jobId) {
  const res = await fetch(getUcasJobUrl(jobId, "/cancel"), {
    method: "POST",
    headers: buildAuthorizedJsonHeaders(),
    signal: AbortSignal.timeout(UCAS_JOB_REQUEST_TIMEOUT_MS),
  });
  const data = await readJsonResponse(res);

  readBackendAuthError(res, data, "Your session is not authorised for UCAS extraction.");

  if ([404, 405, 501].includes(res.status)) {
    throw createUcasJobUnavailableError(data?.detail || "UCAS job cancellation is unavailable.");
  }

  if (!res.ok) {
    throw new Error(data?.detail || data?.message || "UCAS job cancellation failed with HTTP " + res.status);
  }

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
  debugState.backend.backendPatch = data.responseMeta?.backendPatch || "";
  debugState.backend.routeName = data.responseMeta?.routeName || "";
  debugState.backend.responseMetaRowCount = data.responseMeta?.rowCount ?? null;
  debugState.backend.diagnostics = getResponseDiagnostics(data);
  debugState.backend.partial = isPartialResponse(data);

  debugState.apiDiscovery.finalSource = data.source || "backend";
  debugState.renderApi.finalSource = data.source || "backend";
}

installScopedZoomGuard();

function installScopedZoomGuard() {
  // Browser support note: Safari exposes pinch as gesture* events, while
  // Chromium-based browsers often expose trackpad pinch as ctrl+wheel. Keep this
  // scoped to the UniScrape shell instead of using user-scalable=no, so normal
  // scrolling, text selection, keyboard navigation, and browser menu zoom remain
  // available.
  const shellSelectors = [".header-wrap", "main", ".footer-wrap"];

  const getShells = () => shellSelectors
    .map(selector => document.querySelector(selector))
    .filter(Boolean);

  const eventStartedInShell = event => {
    const shells = getShells();
    if (!shells.length) return false;

    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    if (path.length) return shells.some(shell => path.includes(shell));

    const target = event.target;
    return target instanceof Node && shells.some(shell => shell.contains(target));
  };

  const preventShellGestureZoom = event => {
    if (!eventStartedInShell(event)) return;
    if (event.cancelable) event.preventDefault();
  };

  ["gesturestart", "gesturechange", "gestureend"].forEach(type => {
    document.addEventListener(type, preventShellGestureZoom, { capture: true, passive: false });
  });

  document.addEventListener("wheel", event => {
    if (!event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    preventShellGestureZoom(event);
  }, { capture: true, passive: false });
}

// Main flow
scrapeBtn?.addEventListener("click", handleExtractClick);
retryBtn?.addEventListener("click", () => { clearError(); handleExtractClick(); });
appendBtn?.addEventListener("click", enterAppendMode);
ucasJobCancelBtn?.addEventListener("click", handleUcasJobCancelClick);
setUcasJobActionsVisible(false);
urlInput?.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    e.preventDefault();
    handleExtractClick(e);
  }
});
urlInput?.addEventListener("input", () => {
  clearAppendInputHighlight();
  currentUcasModeConfirmed = false;
  updateUcasModeStatus();
});
urlInput?.addEventListener("blur", clearAppendInputHighlight);
updateUcasModeStatus();

function enterAppendMode() {
  appendNextExtraction = true;
  clearError();
  clearWarning();
  showAppendStatus("Append mode ready. Paste another seed link and run extraction.");
  inputPanel?.classList.add("append-input-highlight");
  inputPanel?.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => urlInput?.focus({ preventScroll: true }), 250);
}

function clearAppendInputHighlight() {
  inputPanel?.classList.remove("append-input-highlight");
}

function showAppendStatus(message) {
  if (!appendStatus) return;
  appendStatus.textContent = message || "";
  appendStatus.classList.toggle("hidden", !message);
}

function updateUcasModeStatus(options = {}) {
  if (!ucasModeStatus) return;

  const active = options.active ?? (currentUcasModeConfirmed || isUcasUrl(urlInput?.value));

  if (!active) {
    ucasModeStatus.textContent = "";
    ucasModeStatus.classList.add("hidden");
    return;
  }

  ucasModeStatus.textContent = "UCAS mode active · static catalog extraction";
  ucasModeStatus.classList.remove("hidden");
}

function resetAppendMode({ clearStatus = false } = {}) {
  appendNextExtraction = false;
  clearAppendInputHighlight();
  if (clearStatus) showAppendStatus("");
}

function handleExtractClick(event) {
  event?.preventDefault();
  if (scrapeBtn?.disabled) return;

  try {
    const request = prepareExtractionRequest();
    if (!request) return;

    if (!decodeSessionLooksValid(currentSession.token)) {
      openAuthModal(() => runExtractionWithSession(request));
      return;
    }

    runExtractionWithSession(request);
  } catch (error) {
    handleFrontendExtractionError(error);
  }
}

function decodeSessionLooksValid(token) {
  return Boolean(String(token || "").trim());
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
  const url = urlInput?.value?.trim() || "";
  const debugOnly = isDebugMode();
  const catalogMode = isCatalogMode();
  const depthOne = isDepthOneEnabled();
  const appendRequested = appendNextExtraction;
  const ucasHint = isUcasUrl(url);

  resetDebugState();
  clearError();
  clearWarning();
  if (!appendRequested || !allPrograms.length) hideResults();
  hideDebugPanel();

  if (!url) return showError("Please enter a URL.");

  try {
    new URL(url);
  } catch {
    showError("That does not look like a valid URL.");
    return null;
  }

  return { url, debugOnly, catalogMode, depthOne, appendRequested, ucasHint };
}

// Legacy access-code flow retained temporarily; not used by normal Google-auth extraction.
function ensureAccessCodeThenRun(request) {
  const verifiedAccessCode = getVerifiedAccessCode();
  if (verifiedAccessCode) {
    runExtractionWithSession(request);
    return;
  }

  openAccessCodeModal(request);
}

async function runExtractionWithSession(request) {
  const {
    url,
    debugOnly,
    catalogMode,
    depthOne,
    appendRequested = false,
    ucasHint = isUcasUrl(url),
  } = request;
  const hasExistingRows = appendRequested && allPrograms.length > 0;
  let requestAttempted = false;
  const baseResultState = {
    rows: allPrograms,
    mode: currentResultMode,
    seedUrls: appendedSeedUrls,
  };

  resetDebugState();
  clearError();
  clearWarning();
  if (!hasExistingRows) hideResults();
  hideDebugPanel();
  clearAppendInputHighlight();
  showAppendStatus("");

  setButtonLoading(
    scrapeBtn,
    true,
    ucasHint ? "Fetching UCAS..." : "Extracting...",
    "Extract Programs",
  );
  if (scrapeBtn) scrapeBtn.disabled = true;
  if (appendBtn) appendBtn.disabled = true;

  let programs = [];
  const warningMessages = [];

  try {
    try {
      if (ucasHint) {
        showStatus("Starting UCAS static extraction", 8);
        setStatusDetail("Preparing UCAS job");
      } else {
        setStatusDetail(depthOne ? "Depth-1 extraction enabled - this may take a few minutes for larger sites." : "");
        startStatusSequence(buildExtractionStatusSequence(depthOne), 3000);
      }
    } catch (progressError) {
      stopStatusSequence();
      if (debugOnly) console.warn("Could not start extraction progress messages.", progressError);
    }

    requestAttempted = true;
    let result;
    if (ucasHint) {
      try {
        result = await runUcasJobExtraction(request, baseResultState);
      } catch (error) {
        if (!isUcasJobUnavailableError(error)) throw error;

        warningMessages.push(
          "UCAS job mode is unavailable. Showing synchronous UCAS preview; fee-complete UCAS extraction requires job mode."
        );
        stopStatusSequence();
        startStatusSequence(buildUcasStatusSequence(), 3000);
        result = await useBackendExtract(url, debugOnly, catalogMode, depthOne);
      }
    } else {
      result = await useBackendExtract(url, debugOnly, catalogMode, depthOne);
    }
    updateDebugStateFromBackend(result);
    const ucasConfirmed = isUcasResponse(result);
    const ucasDiagnostics = getUcasDiagnostics(result);
    const responseMode = ucasConfirmed ? "ucas" : catalogMode ? "catalog" : "audit";

    currentUcasModeConfirmed = ucasConfirmed;
    updateUcasModeStatus({
      active: ucasConfirmed,
      diagnostics: ucasDiagnostics,
    });

    if (ucasConfirmed) {
      stopStatusSequence();
      setStatusDetail("Static catalog extraction");
      showStatus("Validating UCAS completeness", 88);
    }

    const finalRows = getFinalRowsFromResponse(result, responseMode);

    debugState.backend.frontendFinalRowCount = finalRows.length;
    console.debug("[uniscrape] frontend final rows", {
      mode: responseMode,
      finalRows: finalRows.length,
    });

    if (responseMode === "ucas") {
      programs = normalizeUcasRows(finalRows);
    } else if (responseMode === "catalog") {
      programs = normalizeCatalogRows(finalRows);
    } else {
      programs = finalRows;
    }

    if (!programs.length) {
      if (debugOnly || shouldShowContentDiagnostics()) renderDebugPanel(debugOnly);
      const responseMetaRowCount = Number(result?.responseMeta?.rowCount || 0);

      if (responseMetaRowCount > 0) {
        return showError(
          "Backend metadata reports rows, but frontend could not find them in catalogRows/programmes/programs."
        );
      }

      const diagnostics = getResponseDiagnostics(result);
      if (ucasConfirmed && hasUcasSecurityPage(result)) {
        hideStatus();
        return showWarning([
          ...warningMessages,
          getUcasSecurityWarning(false),
        ].join(" "));
      }

      if (ucasConfirmed && isIncompleteUcasResponse(result)) {
        hideStatus();
        return showWarning([
          ...warningMessages,
          "UCAS extraction incomplete. No validated rows were returned; check diagnostics before treating this run as complete.",
        ].join(" "));
      }

      const candidatesFound = Math.max(
        Number(diagnostics.candidateCount || 0),
        Number(result?.discoveredProgrammeCount || 0),
        Array.isArray(result?.programmeCandidates) ? result.programmeCandidates.length : 0,
      );
      hideStatus();
      return showWarning(
        candidatesFound > 0
          ? "Programme candidates were found, but no final rows were returned. Check Content diagnostics for detail/fallback status."
          : "No final rows were returned."
      );
    }

    if (hasExistingRows && currentResultMode && currentResultMode !== responseMode) {
      warningMessages.push(
        "Mixed result modes appended; showing the current table columns. Clear results for a dedicated UCAS or non-UCAS table."
      );
    }

    if (ucasConfirmed && hasUcasSecurityPage(result)) {
      warningMessages.push(getUcasSecurityWarning(true));
    } else if (ucasConfirmed && isIncompleteUcasResponse(result)) {
      warningMessages.push(
        "UCAS extraction incomplete - review diagnostics before using this as final data. Rows already extracted are shown below."
      );
    } else if (isPartialResponse(result)) {
      warningMessages.push(depthOne
        ? "Partial Depth-1 result returned. Some detail pages used fallback listing data, but usable rows were extracted."
        : "Partial result returned. Some detail pages may have failed or timed out, but usable data was extracted.");
    }

    if (warningMessages.length) {
      showWarning([...new Set(warningMessages)].join(" "));
    } else {
      clearWarning();
    }

    stopStatusSequence();
    showStatus(ucasConfirmed ? "Preparing UCAS catalog" : "Preparing results...", 90);

    if (responseMode === "audit") {
      programs = programs.map(p => {
        p = mapSubjects(p);
        p = applyFinancialAidStatement(p);
        return p;
      });
    }

    programs = tagRowsWithMode(programs, responseMode);

    showStatus(ucasConfirmed ? "Validating UCAS completeness" : "Building table output...", 96);
    activeResultsMode = hasExistingRows && currentResultMode ? currentResultMode : responseMode;
    currentResultMode = activeResultsMode;

    if (hasExistingRows) {
      const { rows, skipped } = appendUniqueRows(allPrograms, programs, responseMode);
      allPrograms = rows;
      appendedSeedUrls = mergeSeedUrls(appendedSeedUrls, url);
      showAppendStatus(`Appended ${programs.length - skipped} new rows. Skipped ${skipped} duplicates.`);
    } else {
      allPrograms = programs;
      appendedSeedUrls = [url];
    }

    await sleep(250);
    renderResults(url);
    if (debugOnly || shouldShowContentDiagnostics()) renderDebugPanel(debugOnly);
    showStatus(
      ucasConfirmed ? "Preparing UCAS catalog" : "Finalising diagnostics...",
      100,
    );
    await sleep(100);
    hideStatus();
  } catch (error) {
    if (debugOnly || shouldShowContentDiagnostics()) renderDebugPanel(debugOnly);
    if (error?.code === "SESSION_AUTH_REQUIRED") {
      clearGoogleSession();
      openAuthModal(() => runExtractionWithSession(request));
      return;
    }
    if (error?.code === "EXTRACTION_AUTH_REJECTED") {
      showError("Extraction authorization failed. The backend did not accept the current Google session.");
      return;
    }
    if (debugOnly) console.error("UniScrape extraction failed.", error);
    showError("Extraction failed: " + getErrorMessage(error));
  } finally {
    stopStatusSequence();
    if (requestAttempted) resetAppendMode();
    if (scrapeBtn) scrapeBtn.disabled = false;
    if (appendBtn) appendBtn.disabled = false;
    setButtonLoading(scrapeBtn, false, "", "Extract Programs");
  }
}

function clearGoogleSession() {
  localStorage.removeItem("uniscrape_session_token");
  localStorage.removeItem("uniscrape_display_name");
  currentSession = { token: "", email: "", name: "", isAdmin: false };
  updateAccountBadge();
}

function handleFrontendExtractionError(error) {
  stopStatusSequence();
  if (scrapeBtn) scrapeBtn.disabled = false;
  setButtonLoading(scrapeBtn, false, "", "Extract Programs");
  if (isDebugMode()) console.error("UniScrape could not start extraction.", error);
  showError("Could not start extraction: " + getErrorMessage(error));
}

function getErrorMessage(error) {
  return error instanceof Error && error.message
    ? error.message
    : String(error || "Unknown frontend error.");
}

function buildExtractionStatusSequence(depthOne) {
  const phrases = [
    "Connecting to UniScrape backend...",
    "Starting crawl request...",
    "Preparing extraction settings...",
    "Rendering the seed page...",
    "Scanning links and page structure...",
    "Looking for programme candidates...",
    "Checking captured APIs and embedded page data...",
    "Filtering support, event, and marketing pages...",
  ];

  if (depthOne) {
    phrases.push(
      "Depth-1 enabled: preparing detail pages...",
      "Opening selected programme pages...",
      "Expanding course detail sections...",
      "Extracting fees, duration, location, and study mode...",
      "Reading entry requirements and English requirements...",
      "Checking for shared fees or admissions pages...",
      "Filtering non-award short courses...",
      "Merging detail-page fields...",
    );
  }

  phrases.push(
    "Structuring extracted programme data...",
    "Parsing model response...",
    "Recovering JSON if needed...",
    "Validating rows...",
  );

  return phrases.map((text, index) => ({
    text,
    progress: Math.min(84, Math.round(8 + (index / Math.max(1, phrases.length - 1)) * 76)),
  }));
}

function buildUcasStatusSequence() {
  const phrases = [
    "Starting UCAS static extraction",
    "Fetching UCAS listing pages",
    "Checking UCAS pagination",
    "Collecting UCAS course links",
    "Saving UCAS progress",
    "Fetching UCAS fee pages",
    "Reading Fees and funding sections",
    "Validating UCAS completeness",
    "Preparing UCAS catalog",
  ];

  return phrases.map((text, index) => ({
    text,
    progress: Math.min(86, Math.round(6 + (index / Math.max(1, phrases.length - 1)) * 80)),
  }));
}

function isIncompleteUcasResponse(result) {
  if (!isUcasResponse(result)) return false;
  const diagnostics = getUcasDiagnostics(result);
  return Boolean(
    diagnostics.ucasComplete === false ||
    diagnostics.partial === true ||
    diagnostics.waiting === true ||
    diagnostics.rateLimited === true ||
    diagnostics.rate_limited === true ||
    Number(diagnostics.feePagesRemaining ?? diagnostics.fee_pages_remaining ?? 0) > 0 ||
    Number(diagnostics.feeFetchFailedCount || 0) > 0 ||
    Number(diagnostics.feeParseFailedCount || 0) > 0 ||
    (
      diagnostics.paginationStoppedReason &&
      !/^(completed|complete|done)$/i.test(String(diagnostics.paginationStoppedReason))
    ) ||
    hasUcasSecurityPage(result)
  );
}

function getUcasSecurityWarning(hasRows) {
  const rowMessage = hasRows
    ? "Rows already extracted are shown below, but this run should not be treated as complete."
    : "No validated rows were extracted, and this run should not be treated as complete.";

  return [
    "UCAS security/rate-limit page detected for one or more pages.",
    "UCAS extraction may be incomplete because one or more pages returned a security/check page.",
    rowMessage,
  ].join(" ");
}

function isPartialResponse(result) {
  const diagnostics = getUcasDiagnostics(result);
  const partial =
    result?.frontendDiagnostics?.partial ??
    result?.diagnostics?.partial ??
    result?.partial;
  return Boolean(
    partial ||
    diagnostics.ucasComplete === false ||
    hasUcasSecurityPage(result)
  );
}

function getResponseDiagnostics(data) {
  const frontend = data?.frontendDiagnostics || {};
  const diagnostics = data?.diagnostics || {};
  return {
    ...getUcasDiagnostics(data),
    extractDetailsRequested:
      frontend.extractDetailsRequested ?? diagnostics.extractDetailsRequested,
    normalExtractionAttempted:
      frontend.normalExtractionAttempted ?? diagnostics.normalExtractionAttempted,
    normalExtractionSucceeded:
      frontend.normalExtractionSucceeded ?? diagnostics.normalExtractionSucceeded,
    candidateDiscoveryAttempted:
      frontend.candidateDiscoveryAttempted ?? diagnostics.candidateDiscoveryAttempted,
    candidateDiscoveryOnly:
      frontend.candidateDiscoveryOnly ?? diagnostics.candidateDiscoveryOnly,
    detailExtractionAttempted:
      frontend.detailExtractionAttempted ?? diagnostics.detailExtractionAttempted,
    finalOutputSource:
      frontend.finalOutputSource ?? diagnostics.finalOutputSource,
    candidateCount: frontend.candidateCount ?? diagnostics.programmeCandidateCount,
    finalCandidateCount: frontend.finalCandidateCount ?? diagnostics.finalCandidateCount,
    detailsAttempted: frontend.detailsAttempted ?? diagnostics.detailPagesAttempted,
    detailsSucceeded: frontend.detailsSucceeded ?? diagnostics.detailPagesSucceeded,
    detailsFailed: frontend.detailsFailed ?? diagnostics.detailPagesFailed,
    detailsSkipped: frontend.detailsSkipped ?? diagnostics.detailPagesSkipped,
    shortCoursesRejected: frontend.shortCoursesRejected ?? diagnostics.nonAwardShortCourseRejectedCount,
    depthOneStatus: frontend.depthOneStatus ?? diagnostics.depthOneStatus,
    depthOneReady: frontend.depthOneReady ?? diagnostics.depthOneReady,
    partial: frontend.partial ?? data?.partial,
    completionWasAffectedByRuntime:
      frontend.completionWasAffectedByRuntime ?? diagnostics.completionWasAffectedByRuntime,
  };
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
  if (scrapeBtn) scrapeBtn.disabled = false;
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
    runExtractionWithSession(request);
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
    backendPatch: "",
    routeName: "",
    responseMetaRowCount: null,
    frontendFinalRowCount: null,
    diagnostics: {},
    partial: false,
  };
}

function getStaticRoutePath() {
  let path = window.location.pathname || "/";
  path = path.replace(/\/index\.html$/i, "");
  path = path.replace(/\/+$/, "") || "/";
  return path;
}

function isDatabasesRoute() {
  return getStaticRoutePath() === "/databases";
}

function initStaticRoutes() {
  const databasesRoute = isDatabasesRoute();

  document.body.classList.toggle("route-databases", databasesRoute);
  document.body.classList.toggle("route-extractor", !databasesRoute);

  if (databasesPage) {
    databasesPage.hidden = !databasesRoute;
    databasesPage.classList.toggle("hidden", !databasesRoute);
  }

  if (databasesNavLink) {
    if (databasesRoute) {
      databasesNavLink.setAttribute("aria-current", "page");
    } else {
      databasesNavLink.removeAttribute("aria-current");
    }
  }

  if (databasesRoute) {
    document.title = "UniScrape - Databases";
  }
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

  if (isOpen) accountDropdown?.classList.add("hidden");
  settingsMenuToggle.checked = Boolean(isOpen);
  settingsPanel.hidden = !isOpen;
  if (isOpen) {
    showBackdrop();
  } else {
    hideBackdrop();
  }
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

function isDepthOneEnabled() {
  depthOneEnabled = Boolean(depthOneToggleInput?.checked);
  return depthOneEnabled;
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

function renderDebugPanel(forceVisible = false) {
  if ((!forceVisible && !shouldShowContentDiagnostics()) || !debugPanel || !debugStatsEl) return;

  const rd = debugState.renderApi || {};
  const be = debugState.backend || {};
  const stats = rd.stats || {};
  const markdown = debugState.finalExtractionMarkdown || debugState.markdown || "";
  const diagnostics = be.diagnostics || {};
  const diagnosticRows = [
    ["Backend patch", be.backendPatch],
    ["Backend route", be.routeName],
    ["Backend metadata rows", be.responseMetaRowCount],
    ["Frontend final rows", be.frontendFinalRowCount],
    ["Normal extraction attempted", formatYesNo(diagnostics.normalExtractionAttempted)],
    ["Normal extraction succeeded", formatYesNo(diagnostics.normalExtractionSucceeded)],
    ["Candidate discovery attempted", formatYesNo(diagnostics.candidateDiscoveryAttempted)],
    ["Detail extraction attempted", formatYesNo(diagnostics.detailExtractionAttempted)],
    ["Final output source", diagnostics.finalOutputSource],
    ["Candidates found", diagnostics.candidateCount],
    ["Final candidates", diagnostics.finalCandidateCount],
    ["Details attempted", diagnostics.detailsAttempted],
    ["Details succeeded", diagnostics.detailsSucceeded],
    ["Details failed", diagnostics.detailsFailed],
    ["Details skipped", diagnostics.detailsSkipped],
    ["Short courses rejected", diagnostics.shortCoursesRejected],
    ["Depth-1 status", diagnostics.depthOneStatus || "not_requested"],
    ["Partial result", formatYesNo(diagnostics.partial)],
    ["Runtime affected completion", formatYesNo(diagnostics.completionWasAffectedByRuntime)],
    ["UCAS mode", formatYesNo(diagnostics.ucasMode ?? diagnostics.ucasDetected)],
    ["UCAS complete", formatYesNo(diagnostics.ucasComplete)],
    ["UCAS job id", diagnostics.jobId],
    ["UCAS job status", diagnostics.jobStatus],
    ["UCAS phase", diagnostics.phase],
    ["Static only", formatYesNo(diagnostics.staticOnly)],
    ["LLM used", formatYesNo(diagnostics.llmUsed)],
    ["Playwright used", formatYesNo(diagnostics.playwrightUsed)],
    ["Expected UCAS results", diagnostics.expectedResultCount],
    ["UCAS rows collected", diagnostics.rowsCollected],
    ["UCAS rows output", diagnostics.rowsOutput],
    ["Unique UCAS courses", diagnostics.uniqueCourses],
    ["Listing pages fetched", diagnostics.listingPagesFetched],
    ["Listing pages expected", diagnostics.listingPagesExpected],
    ["Pagination stopped reason", diagnostics.paginationStoppedReason],
    ["Fee pages completed", diagnostics.feePagesCompleted],
    ["Fee pages remaining", diagnostics.feePagesRemaining],
    ["UCAS waiting", formatYesNo(diagnostics.waiting)],
    ["UCAS rate limited", formatYesNo(diagnostics.rateLimited)],
    ["Next retry", diagnostics.nextRetryAt],
    ["Estimated remaining", diagnostics.estimatedRemainingTime],
    ["Fees found", diagnostics.feeFoundCount],
    ["No fee provided", diagnostics.noFeeProvidedCount],
    ["Fee option required", diagnostics.optionRequiredCount],
    ["Fee fetch failed", diagnostics.feeFetchFailedCount],
    ["Fee parse failed", diagnostics.feeParseFailedCount],
    ["Security page detected", formatYesNo(diagnostics.securityPageDetected)],
    ["Blocked page count", diagnostics.blockedPageCount],
    ["Blocked page type", diagnostics.blockedPageType],
    [
      "Blocked page URLs",
      Array.isArray(diagnostics.blockedPageUrls)
        ? diagnostics.blockedPageUrls.join(", ")
        : diagnostics.blockedPageUrls,
    ],
    ["Appended seed URLs", appendedSeedUrls.length > 1 ? appendedSeedUrls.length : ""],
  ].filter(([, value]) => value !== undefined && value !== null && value !== "");

  debugStatsEl.innerHTML = [
    ...diagnosticRows.map(([label, value]) =>
      `<div><span class="debug-k">${esc(label)}</span> ${esc(value)}</div>`),
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

function formatYesNo(value) {
  if (value === undefined || value === null) return "";
  return value ? "yes" : "no";
}

function formatDiagnosticValue(value) {
  if (typeof value === "boolean") return value ? "ready" : "not ready";
  return value ?? "";
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
function normalizeCatalogRows(rows) {
  if (!Array.isArray(rows)) return [];

  return rows.map(row => ({
    courseName: row?.courseName || row?.course_name || "",
    universityName: row?.universityName || row?.university_name || "",
    courseUrl: row?.courseUrl || row?.course_url || row?.courseLink || row?.url || "",
    levelOfStudy: row?.levelOfStudy || row?.level_of_study || "",
    credits: row?.credits || "",
    creditsUnit: row?.creditsUnit || row?.credits_unit || "",
    duration: row?.duration || "",
    fees: formatCatalogFeeDisplay(row?.fees),
    location: row?.location || "",
    language: row?.language || "",
    modeOfStudy: row?.modeOfStudy || row?.mode_of_study || "",
  }));
}

function appendUniqueRows(existingRows, incomingRows, mode) {
  const combined = [...existingRows];
  const seen = new Set(existingRows.map(row => getRowDedupeKey(row, row?.__resultMode || mode)));
  let skipped = 0;

  incomingRows.forEach(row => {
    const key = getRowDedupeKey(row, row?.__resultMode || mode);
    if (seen.has(key)) {
      skipped += 1;
      return;
    }
    seen.add(key);
    combined.push(row);
  });

  return { rows: combined, skipped };
}

function getRowDedupeKey(row, mode) {
  if (mode === "ucas") {
    const url = firstTrimmedValue(row?.courseUrl, row?.program_url, row?.programme_url, row?.url);
    if (url) return `url:${normalizeDedupeUrl(url)}`;
    return `name:${firstTrimmedValue(row?.programName, row?.program_name, row?.programme_name)}|${firstTrimmedValue(row?.universityProvider, row?.provider_name, row?.university_name)}`;
  }

  if (mode === "catalog") {
    const url = firstTrimmedValue(row?.courseUrl, row?.course_url, row?.courseLink, row?.url);
    if (url) return `url:${normalizeDedupeUrl(url)}`;
    return `name:${firstTrimmedValue(row?.courseName, row?.course_name)}|${firstTrimmedValue(row?.universityName, row?.university_name)}`;
  }

  const url = firstTrimmedValue(
    row?.programUrl,
    row?.programmeUrl,
    row?.programLink,
    row?.programmeLink,
    row?.url,
  );
  if (url) return `url:${normalizeDedupeUrl(url)}`;
  return `name:${firstTrimmedValue(row?.programName, row?.programmeName, row?.name)}|${firstTrimmedValue(row?.universityName)}`;
}

function firstTrimmedValue(...values) {
  for (const value of values) {
    const trimmed = String(value ?? "").trim();
    if (trimmed) return trimmed;
  }
  return "";
}

function normalizeDedupeUrl(value) {
  return String(value || "").trim().toLowerCase().replace(/\/+$/, "");
}

function formatCatalogFeeDisplay(value) {
  const original = String(value ?? "").replace(/\u00a0/g, " ").trim();
  if (!original) return "";

  const amount = String.raw`(?:\d{1,3}(?:[,\s]\d{3})+|\d+)(?:\.\d{1,2})?`;
  const codes = String.raw`(?:GBP|USD|EUR|AUD|CAD|NZD|SGD|HKD|MYR|RM|AED|SAR|INR|JPY|CNY|RMB|CHF|ZAR)`;
  const symbols = String.raw`(?:(?:US|AU|A|CA|C|NZ|SG|S|HK)?[$£€¥₹])`;
  const feePattern = new RegExp(
    String.raw`(?:Â?${symbols}\s*${amount}|\b${codes}\s*${amount}\b|\b${amount}\s*${codes}\b)`,
    "gi",
  );
  const matches = original.match(feePattern) || [];
  const seen = new Set();
  const values = [];

  matches.forEach(match => {
    let cleaned = match.replace(/^Â/, "").replace(/\s+/g, " ").trim();
    cleaned = cleaned.replace(
      new RegExp(String.raw`^(${codes})\s*`, "i"),
      (_, code) => `${code.toUpperCase()} `,
    );
    cleaned = cleaned.replace(
      new RegExp(String.raw`^(${symbols})\s*`, "i"),
      (_, symbol) => symbol,
    );
    cleaned = cleaned.replace(
      new RegExp(String.raw`\s*(${codes})$`, "i"),
      (_, code) => ` ${code.toUpperCase()}`,
    );

    const key = cleaned.toUpperCase();
    if (!seen.has(key)) {
      seen.add(key);
      values.push(cleaned);
    }
  });

  return values.length ? values.join(" / ") : original;
}

function isCatalogResults() {
  return activeResultsMode === "catalog" || activeResultsMode === "ucas";
}

function isUcasResults() {
  return activeResultsMode === "ucas";
}

function renderResults(sourceUrl) {
  let host;
  try { host = new URL(sourceUrl).hostname; } catch { host = sourceUrl; }
  sourcePill.textContent = appendedSeedUrls.length > 1
    ? `${appendedSeedUrls.length} seed URLs`
    : host;
  if (countLabel) {
    countLabel.textContent = isUcasResults()
      ? "UCAS rows found from"
      : isCatalogResults()
        ? "catalog rows found from"
        : "programs found from";
  }
  filterBar?.classList.toggle("hidden", isCatalogResults());
  noResults.textContent = isUcasResults()
    ? "No UCAS rows to display."
    : isCatalogResults()
      ? "No catalog rows to display."
      : "No programs match your filters.";
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
    if (isUcasResults()) {
      renderUcasTable(allPrograms);
    } else {
      renderCatalogTable(allPrograms);
    }
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
  const nextMode = mode === "ucas" ? "ucas" : mode === "catalog" ? "catalog" : "audit";
  if (tableHeaderRow.dataset.mode === nextMode) return;

  if (programTable) programTable.dataset.mode = nextMode;
  tableHeaderRow.innerHTML =
    nextMode === "ucas"
      ? UCAS_TABLE_HEADER_HTML
      : nextMode === "catalog"
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
      <td class="name-cell"><span class="cell-clamp">${esc(p.name ?? "-")}</span></td>
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
      <td class="name-cell"><span class="cell-clamp">${catalogCell(row.courseName)}</span></td>
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

function renderUcasTable(rows) {
  if (rows.length === 0) {
    tableBody.innerHTML = "";
    noResults.classList.remove("hidden");
    return;
  }
  noResults.classList.add("hidden");

  tableBody.innerHTML = rows.map((row, i) => `
    <tr>
      <td class="col-num">${i + 1}</td>
      <td class="name-cell"><span class="cell-clamp">${catalogCell(row.programName)}</span></td>
      <td class="qualification-cell">${catalogCell(row.qualification)}</td>
      <td class="provider-cell">${catalogCell(row.universityProvider)}</td>
      <td class="ucas-points-cell">${catalogCell(row.ucasPoints)}</td>
      <td class="fee-cell">${catalogCell(row.fee)}</td>
      <td class="fee-status-cell">${catalogCell(row.feeStatus)}</td>
      <td>${catalogCell(row.studyMode)}</td>
      <td>${catalogCell(row.duration)}</td>
      <td>${catalogCell(row.startDate)}</td>
      <td>${catalogCell(row.location)}</td>
      <td class="catalog-url-cell">${catalogUrlCell(row.courseUrl)}</td>
    </tr>
  `).join("");
}

function catalogCell(value) {
  return value === 0 || (value !== undefined && value !== null && String(value).trim() !== "")
    ? esc(value)
    : '<span class="nil">-</span>';
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
  showBackdrop();
}

function closeProgramModal() {
  modal.classList.add("hidden");
  hideBackdrop();
}

modalClose.addEventListener("click", closeProgramModal);
modal.addEventListener("click", e => { if (e.target === modal) closeProgramModal(); });
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !modal.classList.contains("hidden")) closeProgramModal();
});

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
  const columns = isUcasResults()
    ? UCAS_CSV_COLUMNS
    : (isCatalogResults() ? CATALOG_CSV_COLUMNS : AUDIT_CSV_COLUMNS)
        .map(key => [key, key]);
  const rows = [
    columns.map(([label]) => `"${String(label).replace(/"/g, '""')}"`).join(","),
    ...allPrograms.map(p =>
      columns.map(([, key]) => {
        // Strip HTML tags from description for CSV readability
        let val = String(p[key] ?? "");
        if (key === "description") val = val.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
        return `"${val.replace(/"/g, '""')}"`;
      }).join(",")
    ),
  ];
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const a    = document.createElement("a");
  a.href     = URL.createObjectURL(blob);
  const exportType = isUcasResults() ? "ucas" : isCatalogResults() ? "catalog" : "audit";
  a.download = `uniscrape-${exportType}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
});

//Clear
clearBtn.addEventListener("click", () => {
  allPrograms = [];
  activeResultsMode = "audit";
  currentResultMode = null;
  currentUcasModeConfirmed = false;
  appendedSeedUrls = [];
  resetAppendMode({ clearStatus: true });
  sortCol = null;
  sortDir = 1;
  urlInput.value = "";
  updateUcasModeStatus({ active: false });
  setResultsTableMode("audit");
  filterBar?.classList.remove("hidden");
  if (countLabel) countLabel.textContent = "programs found from";
  noResults.textContent = "No programs match your filters.";
  hideResults();
  clearError();
  clearWarning();
  hideDebugPanel();
  [filterName, filterLevel, filterBroad, filterMode, filterScholarship, filterDept].forEach(el => el.value = "");
});

//Helpers
function showStatus(msg, pct) {
  statusSection?.classList.remove("hidden");
  if (statusText) statusText.textContent = msg;
  const nextProgress = Number(pct);
  if (Number.isFinite(nextProgress)) {
    lastStatusProgress = Math.max(lastStatusProgress, nextProgress);
  }
  if (progressFill) progressFill.style.width = lastStatusProgress + "%";
}
function setStatusDetail(message) {
  if (!statusDetail) return;
  statusDetail.textContent = message || "";
  statusDetail.classList.toggle("hidden", !message);
}
function hideStatus()  {
  statusSection?.classList.add("hidden");
  if (progressFill) progressFill.style.width = "0%";
  lastStatusProgress = 0;
  setStatusDetail("");
}
function showError(m)  {
  errorSection?.classList.remove("hidden");
  if (errorText) errorText.textContent = m;
  retryBtn?.classList.remove("hidden");
  hideStatus();
}
function clearError()  {
  errorSection?.classList.add("hidden");
  retryBtn?.classList.add("hidden");
}
function showWarning(message) {
  if (!warningSection || !warningText) return;
  warningText.textContent = message;
  warningSection.classList.remove("hidden");
}
function clearWarning() {
  warningSection?.classList.add("hidden");
  if (warningText) warningText.textContent = "";
}
function hideResults() { resultsSection.classList.add("hidden"); }
function sleep(ms)     { return new Promise(r => setTimeout(r, ms)); }
function nextFrame()   { return new Promise(r => requestAnimationFrame(r)); }
function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
