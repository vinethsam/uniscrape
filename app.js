/*
   UniScrape v2.3.1 - app.js
*/

//Config — limit applies to cleaned markdown, not raw HTML
const MAX_HTML_CHARS          = 80000;
const MIN_MARKDOWN_CHARS      = 500;
const MAX_API_CANDIDATES      = 12;
const API_DISCOVERY_TIMEOUT_MS = 12000;
const MAX_API_RESPONSE_CHARS  = 120000;
const WORKER_URL         = "https://uniscrape-proxy.itsvineth05.workers.dev";
const RENDER_API_URL    = "https://api.uniscrape.com/render";
// Alternative if API rejects the model id: "claude-sonnet-4-20250514"
const ANTHROPIC_MODEL    = "claude-sonnet-4-5";
const GEMINI_MODEL    = "gemini-1.5-pro-latest";
const GEMINI_URL      = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const FINANCIAL_AID_STATEMENT = "This university offers some form of financial aid to prospective students. Please always check the specific requirements and restrictions on scholarship availability.";

//State
let allPrograms = [];
let sortCol     = null;
let sortDir     = 1;

let debugState = {
  rawHtml: "",
  selectedHtml: "",
  markdown: "",
  staticMarkdown: "",
  finalExtractionMarkdown: "",
  rootStrategy: "",
  extractionPreview: "",
  warnings: [],
  stats: {},
  apiDiscovery: {
    attempted: false,
    candidates: [],
    tried: [],
    selected: null,
    selectedResponse: "",
    selectedMarkdown: "",
    finalSource: "",
    apiIsStrong: false,
  },
  renderApi: {
    attempted: false,
    success: false,
    finalSource: "",
    stats: null,
    warnings: [],
    programLinks: [],
    links: [],
    responseText: "",
    responseHtml: "",
    selectedMarkdown: "",
    error: "",
  },
};

const POSITIVE_KEYWORDS = [
  "course", "courses", "programme", "program", "programmes", "programs",
  "undergraduate", "postgraduate", "bachelor", "bachelors", "master's", "masters",
  "msc", "ma", "mba", "bsc", "ba", "beng", "phd", "doctorate", "diploma",
  "certificate", "degree", "study", "tuition", "fees", "entry requirements",
  "admissions", "international", "scholarship", "apply",
];

const NEGATIVE_KEYWORDS = [
  "news", "event", "events", "alumni", "staff", "privacy", "cookie",
  "login", "social", "footer", "navigation",
];

const WEAK_MARKDOWN_PHRASES = [
  "loading", "please enable javascript", "enable javascript", "app root",
  "cookie", "menu", "navigation", "no results", "search filters",
];

const API_SKIP_URL = /google-analytics|googletagmanager|facebook\.com|twitter\.com|doubleclick|hotjar|segment\.io|cloudflareinsights|\.css(\?|$)|\.woff2?(\?|$)|\.png(\?|$)|\.jpg(\?|$)|\.gif(\?|$)|\.svg(\?|$)|\/login|\/logout|\/signin|\/signup|cookie-policy|privacy-policy|gdpr/i;

const GUESSED_API_PATHS = [
  "/api/courses", "/api/programmes", "/api/programs", "/api/search", "/api/course-search",
  "/courses.json", "/programmes.json", "/programs.json",
  "/study/courses.json", "/study/programmes.json",
  "/wp-json/wp/v2/search?search=course",
];

const JSON_PROGRAM_NAME_KEYS = [
  "name", "title", "courseTitle", "programmeTitle", "programName", "courseName",
  "label", "awardTitle", "displayName", "course", "programme", "program",
];

const JSON_PROGRAM_URL_KEYS = [
  "url", "link", "path", "slug", "href", "courseUrl", "programmeUrl", "programUrl", "uri",
];

const JSON_PROGRAM_META_KEYS = [
  "award", "qualification", "degree", "level", "studyLevel", "faculty", "department",
  "school", "mode", "duration", "location", "campus",
];

const CANDIDATE_SELECTORS = [
  "main", "article", "[role=main]", ".main-content", ".content", ".page-content",
  ".site-content", ".course-list", ".courses-list", ".programme-list", ".program-list",
  ".programmes", ".programs", ".courses", ".search-results", ".results",
  ".listing", ".listings", "#content", "#main", "#app", "#root", "body",
];

//DOM refs
const urlInput         = document.getElementById("urlInput");
const apiProvider      = document.getElementById("apiProvider");
const apiKeyInput      = document.getElementById("apiKeyInput");
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
apiProvider.value = localStorage.getItem("uniscrape_provider") || "anthropic";
apiKeyInput.value = localStorage.getItem("uniscrape_key_" + apiProvider.value) || "";
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
updateHint();

if (downloadRawBtn) downloadRawBtn.addEventListener("click", () => downloadTextFile("uniscrape_raw_html.txt", debugState.rawHtml));
if (downloadSelectedBtn) downloadSelectedBtn.addEventListener("click", () => downloadTextFile("uniscrape_selected_html.txt", debugState.selectedHtml));
if (downloadMarkdownBtn) downloadMarkdownBtn.addEventListener("click", () => downloadTextFile("uniscrape_markdown.txt", debugState.markdown));
if (downloadPreviewBtn) downloadPreviewBtn.addEventListener("click", () => downloadTextFile("uniscrape_extraction_preview.txt", debugState.extractionPreview));
if (downloadApiResponseBtn) downloadApiResponseBtn.addEventListener("click", () => downloadTextFile("uniscrape_api_response.txt", debugState.apiDiscovery.selectedResponse || debugState.renderApi.responseHtml || debugState.renderApi.responseText));
if (downloadFinalMdBtn) downloadFinalMdBtn.addEventListener("click", () => downloadTextFile("uniscrape_final_extraction_markdown.txt", debugState.finalExtractionMarkdown || debugState.markdown));
if (copyMarkdownBtn) copyMarkdownBtn.addEventListener("click", copyMarkdownPreview);

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

//Main flow
scrapeBtn.addEventListener("click", runScrape);
retryBtn.addEventListener("click", () => { clearError(); runScrape(); });
urlInput.addEventListener("keydown", e => { if (e.key === "Enter") runScrape(); });

async function runScrape() {
  const url      = urlInput.value.trim();
  const apiKey   = apiKeyInput.value.trim();
  const provider = apiProvider.value;
  const debugOnly = isDebugMode();

  resetDebugState();
  clearError();
  hideResults();
  hideDebugPanel();

  if (!url)    return showError("Please enter a URL.");
  if (!apiKey && !debugOnly) return showError("Please enter your API key.");
  try { new URL(url); } catch { return showError("That does not look like a valid URL."); }

  scrapeBtn.disabled = true;
  showStatus("Fetching page content...", 10);

  let html;
  try {
    html = await fetchWithWorker(url);
  } catch (e) {
    scrapeBtn.disabled = false;
    return showError("Could not fetch the page: " + e.message + ". Make sure your Cloudflare Worker is deployed and the URL is correct.");
  }

  debugState.rawHtml = html;
  if (isDebugMode()) debugLog("Raw HTML length:", html.length);

  showStatus("Cleaning page content and converting to markdown...", 35);

  let staticMarkdown;
  try {
    staticMarkdown = prepareMarkdown(html);
  } catch (e) {
    scrapeBtn.disabled = false;
    return showError("Could not process page content: " + e.message);
  }

  debugState.staticMarkdown = staticMarkdown;
  debugState.markdown = staticMarkdown;

  showStatus("Checking cleaned content...", 42);

  let extractionMarkdown = staticMarkdown;
  let finalSource = "static markdown";

  if (shouldUseRenderFallback(staticMarkdown)) {
    showStatus("No visible program list found. Searching for hidden course data...", 45);
    const apiResult = await tryApiDiscoveryFallback(html, url);
    if (apiResult?.markdown) {
      showStatus("Possible course data found. Checking quality...", 50);

      extractionMarkdown = apiResult.markdown;
      finalSource = apiResult.finalSource;
      debugState.apiDiscovery.finalSource = finalSource;

      const apiIsStrong = hasStrongProgramEvidence(extractionMarkdown);
      debugState.apiDiscovery.apiIsStrong = apiIsStrong;

      // Important:
      // API discovery can produce false positives on JS-rendered search pages.
      // If the static Worker result already looks like a JS shell, always try the
      // Playwright render backend as well. A weak API result must not block render.
      if (shouldUseRenderFallback(staticMarkdown)) {
        showStatus("Render fallback required. Rendering page with backend...", 52);

        const renderResult = await tryRenderBackendFallback(url, staticMarkdown);

        if (renderResult?.markdown) {
          extractionMarkdown = renderResult.markdown;
          finalSource = renderResult.finalSource;
          debugState.apiDiscovery.finalSource = apiIsStrong
            ? "api found - render backend preferred due JS shell"
            : "api weak - used rendered backend";
        } else {
          debugState.apiDiscovery.finalSource = apiIsStrong
            ? "api used - render backend failed or weak"
            : "api weak - render backend failed or weak";
        }
      }
    } else {
      showStatus("No hidden course data found. Rendering page with backend...", 52);
      debugState.apiDiscovery.finalSource = "failed - trying rendered backend";

      const renderResult = await tryRenderBackendFallback(url, staticMarkdown);

      if (renderResult?.markdown) {
        extractionMarkdown = renderResult.markdown;
        finalSource = renderResult.finalSource;
      } else {
        showStatus("Rendered backend did not return usable program content.", 54);
        debugState.apiDiscovery.finalSource = "failed - likely deeper rendering/pagination needed";
      }
    }
  }

  debugState.finalExtractionMarkdown = extractionMarkdown;
  debugState.markdown = extractionMarkdown;
  if (!debugState.apiDiscovery.finalSource) {
    debugState.apiDiscovery.finalSource = finalSource;
  }
  if (debugState.renderApi.attempted && debugState.renderApi.success) {
    debugState.renderApi.finalSource = finalSource;
  }

  if (isDebugMode()) {
    renderDebugPanel();
    debugLog("Selected root strategy:", debugState.rootStrategy);
    debugLog("Final content source:", finalSource);
    debugLog("Extraction markdown length:", extractionMarkdown.length);
    debugLog("Markdown preview (first 5000 chars):\n", extractionMarkdown.slice(0, 5000));
  }

  if (isWeakProgramMarkdown(extractionMarkdown)) {
    scrapeBtn.disabled = false;
    if (isDebugMode()) renderDebugPanel();
    return showError(
      "No usable program list was found from static fetch, hidden data endpoints, or rendered backend. This page may require deeper pagination, filters, or load-more handling. Try a direct program page, or inspect Debug downloads."
    );
  }

  debugState.extractionPreview = buildExtractionPreview(extractionMarkdown, url, provider);

  if (debugOnly) {
    renderDebugPanel();
    scrapeBtn.disabled = false;
    showStatus("Debug mode active — markdown prepared. API extraction skipped.", 100);

    setTimeout(() => {
      hideStatus();
    }, 1200);

    return;
  }

  const providerLabel = provider === "anthropic" ? "Anthropic" : "Gemini";
  const sourceNote = finalSource && finalSource !== "static markdown" ? ` from ${finalSource}` : "";
  showStatus(`Sending ~${extractionMarkdown.length.toLocaleString()} characters to ${providerLabel}${sourceNote}...`, 55);

  let programs;
  try {
    programs = provider === "anthropic"
      ? await extractWithAnthropic(extractionMarkdown, url, apiKey)
      : await extractWithGemini(extractionMarkdown, url, apiKey);
  } catch (e) {
    scrapeBtn.disabled = false;
    if (isDebugMode()) renderDebugPanel();
    return showError("Extraction failed: " + e.message);
  }

  if (!programs.length) {
    scrapeBtn.disabled = false;
    if (isDebugMode()) renderDebugPanel();
    return showError(
      "No programs were extracted. The cleaned markdown may not contain the actual program listing, or the page may load programs dynamically with JavaScript. Enable Debug mode and inspect the Markdown download."
    );
  }

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

//Fetch via Cloudflare Worker
async function fetchWithWorker(url, timeoutMs = 25000) {
  const proxyUrl = WORKER_URL.replace(/\/$/, "") + "?url=" + encodeURIComponent(url);
  let res;
  try {
    res = await fetch(proxyUrl, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    throw new Error("Could not reach the proxy worker: " + e.message);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "Worker returned HTTP " + res.status);
  if (!data?.contents || typeof data.contents !== "string") throw new Error("Unexpected response from worker.");
  return data.contents;
}

async function fetchWithRenderApi(url) {
  let res;
  try {
    res = await fetch(RENDER_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(45000),
    });
  } catch (e) {
    throw new Error("Could not reach render backend: " + e.message);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.detail || data?.error || "Render API failed with HTTP " + res.status);
  }
  if (!data || typeof data !== "object") throw new Error("Render API returned an empty response.");
  if (!data.html && !data.text && !Array.isArray(data.programLinks)) {
    throw new Error("Render API returned no usable rendered content.");
  }
  return data;
}

function renderLinksToMarkdown(links, title) {
  if (!Array.isArray(links) || !links.length) return "";
  const lines = [`# ${title}`, ""];
  const seen = new Set();
  for (const link of links) {
    if (!link) continue;
    const text = String(link.text || link.title || link.href || "").trim();
    const href = String(link.href || "").trim();
    const key = (text + "|" + href).toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    if (href) lines.push(`- [${text}](${href})`);
    else lines.push(`- ${text}`);
    if (lines.length > 450) break;
  }
  return lines.length > 2 ? lines.join("\n") : "";
}

function buildMarkdownFromRenderData(data, sourceUrl) {
  const parts = [];
  parts.push(`# Playwright-rendered page data\n\nSource: ${sourceUrl}\n`);

  const programLinksMd = renderLinksToMarkdown(data.programLinks, "Likely Program Links");
  if (programLinksMd) parts.push(programLinksMd);

  const linksMd = renderLinksToMarkdown(data.links, "All Rendered Page Links");
  if (linksMd && (!programLinksMd || (data.programLinks || []).length < 10)) {
    parts.push(linksMd);
  }

  if (data.text && String(data.text).trim()) {
    parts.push("# Rendered Visible Page Text\n");
    parts.push(String(data.text).trim().slice(0, 45000));
  }

  if (data.html && String(data.html).trim()) {
    try {
      const renderedMarkdown = cleanHtml(String(data.html), { forceRoot: "body", minimalClean: true }).markdown;
      if (renderedMarkdown && renderedMarkdown.length > 200) {
        parts.push("# Rendered HTML Converted to Markdown\n");
        parts.push(renderedMarkdown);
      }
    } catch (e) {
      debugLog("Could not convert rendered HTML to markdown:", e.message);
    }
  }

  let markdown = parts.filter(Boolean).join("\n\n").replace(/\n{4,}/g, "\n\n").trim();
  if (markdown.length > MAX_HTML_CHARS) {
    markdown = markdown.slice(0, MAX_HTML_CHARS) + "\n\n[...truncated...]";
  }
  return markdown;
}

async function tryRenderBackendFallback(pageUrl, staticMarkdown = "") {
  debugState.renderApi.attempted = true;
  debugState.renderApi.success = false;
  debugState.renderApi.error = "";

  showStatus("Rendering JavaScript page with Playwright backend...", 55);
  try {
    const data = await fetchWithRenderApi(pageUrl);
    debugState.renderApi.success = true;
    debugState.renderApi.stats = data.stats || null;
    debugState.renderApi.warnings = Array.isArray(data.warnings) ? data.warnings : [];
    debugState.renderApi.programLinks = Array.isArray(data.programLinks) ? data.programLinks : [];
    debugState.renderApi.links = Array.isArray(data.links) ? data.links : [];
    debugState.renderApi.responseText = data.text || "";
    debugState.renderApi.responseHtml = data.html || "";

    const renderMarkdown = buildMarkdownFromRenderData(data, pageUrl);
    debugState.renderApi.selectedMarkdown = renderMarkdown;

    if (!renderMarkdown || isWeakProgramMarkdown(renderMarkdown)) {
      debugState.renderApi.error = "Render backend returned weak markdown.";
      return null;
    }

    const finalMarkdown = mergeRenderedMarkdown(staticMarkdown, renderMarkdown);
    debugState.finalExtractionMarkdown = finalMarkdown;
    debugState.markdown = finalMarkdown;
    return { markdown: finalMarkdown, finalSource: "playwright-rendered backend" };
  } catch (e) {
    debugState.renderApi.error = e.message;
    if (isDebugMode()) debugLog("Render backend failed:", e.message);
    return null;
  }
}

function mergeRenderedMarkdown(staticMd, renderMd) {
  if (!renderMd) return staticMd;
  if (!staticMd || isWeakProgramMarkdown(staticMd)) return capExtractionMarkdown(renderMd);
  const snippet = staticMd.slice(0, 3000);
  return capExtractionMarkdown(`${renderMd}\n\n# Original static page context\n\n${snippet}`);
}

//Hidden API / embedded data discovery
function isWeakProgramMarkdown(markdown) {
  if (!markdown || markdown.length < MIN_MARKDOWN_CHARS) return true;
  if (countKeywords(markdown, POSITIVE_KEYWORDS) < 2) return true;

  const lower = markdown.toLowerCase();
  const weakPhraseHits = WEAK_MARKDOWN_PHRASES.filter(p => lower.includes(p)).length;
  const links = (markdown.match(/\[.*?\]\([^)]+\)/g) || []).length;
  const degreeHits = (lower.match(/(bsc|msc|mba|ba|ma|phd|beng|bachelor|master|doctorate|undergraduate|postgraduate)/g) || []).length;

  if (degreeHits >= 2 && countKeywords(markdown, POSITIVE_KEYWORDS) >= 2) return false;
  if (links >= 5 && countKeywords(markdown, POSITIVE_KEYWORDS) >= 3) return false;

  if (markdown.length > 2000 && countKeywords(markdown, POSITIVE_KEYWORDS) < 4 && links < 3 && weakPhraseHits >= 2) {
    return true;
  }
  if (weakPhraseHits >= 3 && countKeywords(markdown, POSITIVE_KEYWORDS) < 3) return true;

  return false;
}

function countLikelyProgramMarkdownLinks(markdown) {
  if (!markdown) return 0;

  const linkMatches = markdown.match(/\[([^\]]+)\]\(([^)]+)\)/g) || [];

  return linkMatches.filter(link => {
    const lower = link.toLowerCase();
    return /course|courses|programme|programmes|program|programs|undergraduate|postgraduate|degree|bsc|ba|beng|msc|ma|mba|phd|bachelor|master/.test(lower);
  }).length;
}

function hasStrongProgramEvidence(markdown) {
  if (!markdown) return false;

  const lower = markdown.toLowerCase();

  const degreeHits = (
    lower.match(/(bsc|msc|mba|ba|ma|phd|beng|bachelor|master|doctorate|undergraduate|postgraduate)/g) || []
  ).length;

  const programRecordHits = (
    lower.match(/## program|name:|award\/level:|url:/g) || []
  ).length;

  const likelyProgramLinks = countLikelyProgramMarkdownLinks(markdown);

  return (
    likelyProgramLinks >= 5 ||
    degreeHits >= 5 ||
    programRecordHits >= 8
  );
}

function isAllowedApiUrl(candidateUrl, pageUrl) {
  try {
    const page = new URL(pageUrl);
    const c = new URL(candidateUrl, pageUrl);
    if (!/^https?:$/i.test(c.protocol)) return false;
    if (API_SKIP_URL.test(c.href)) return false;
    const base = page.hostname.replace(/^www\./, "");
    const host = c.hostname.replace(/^www\./, "");
    return host === base || host.endsWith("." + base) || c.hostname === page.hostname;
  } catch {
    return false;
  }
}

function resolvePageUrl(href, pageUrl) {
  try {
    return new URL(href, pageUrl).href;
  } catch {
    return null;
  }
}

function candidatePriority(c) {
  let p = c.priority || 0;
  const u = (c.url || "").toLowerCase();
  if (c.embeddedText) p += 200;
  if (c.source === "next-data" || c.source === "inline-json") p += 90;
  if (/\/api\//.test(u)) p += 100;
  if (/\.json/.test(u)) p += 80;
  if (/course|programme|program/.test(u)) p += 60;
  if (/search|catalog/.test(u)) p += 40;
  return p;
}

function discoverDataEndpoints(rawHtml, pageUrl) {
  const seen = new Set();
  const candidates = [];

  function add(candidate) {
    const key = candidate.embeddedText
      ? `embedded:${candidate.source}:${candidate.reason}`
      : candidate.url;
    if (!key || seen.has(key)) return;
    if (candidate.url && !candidate.embeddedText && !isAllowedApiUrl(candidate.url, pageUrl)) return;
    seen.add(key);
    candidates.push(candidate);
  }

  const scriptSrcRe = /<script[^>]+src=["']([^"']+)["']/gi;
  let m;
  while ((m = scriptSrcRe.exec(rawHtml)) !== null) {
    const src = m[1];
    if (/course|program|programme|search|api|catalog|study|degree/i.test(src)) {
      const abs = resolvePageUrl(src, pageUrl);
      if (abs) add({ url: abs, reason: "Script src related to courses/API", source: "script-src", priority: 30 });
    }
  }

  const nextData = rawHtml.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (nextData?.[1]) {
    add({
      url: pageUrl + "#__NEXT_DATA__",
      reason: "Next.js __NEXT_DATA__ embedded JSON",
      source: "next-data",
      embeddedText: nextData[1].trim(),
      priority: 95,
    });
  }

  const statePatterns = [
    { re: /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/i, label: "__INITIAL_STATE__" },
    { re: /window\.__NUXT__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/i, label: "__NUXT__" },
    { re: /window\.__APOLLO_STATE__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/i, label: "__APOLLO_STATE__" },
  ];
  for (const { re, label } of statePatterns) {
    const match = rawHtml.match(re);
    if (match?.[1]) {
      add({
        url: pageUrl + "#" + label,
        reason: `Embedded window state ${label}`,
        source: "inline-json",
        embeddedText: match[1].trim(),
        priority: 85,
      });
    }
  }

  rawHtml.replace(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi, (_, json) => {
    if (/course|program|programme|degree|CollegeOrUniversity/i.test(json)) {
      add({
        url: pageUrl + "#ld+json",
        reason: "JSON-LD with course/program schema",
        source: "inline-json",
        embeddedText: json.trim(),
        priority: 70,
      });
    }
  });

  rawHtml.replace(/<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi, (_, json) => {
    if (countKeywords(json, POSITIVE_KEYWORDS) >= 2) {
      add({
        url: pageUrl + "#application-json",
        reason: "Inline application/json script",
        source: "inline-json",
        embeddedText: json.trim(),
        priority: 65,
      });
    }
  });

  const urlInHtml = /(?:https?:)?\/\/[^\s"'<>]+|\/[a-z0-9_./?&=%-]+/gi;
  const urlHits = rawHtml.match(urlInHtml) || [];
  for (const hit of urlHits) {
    const h = hit.toLowerCase();
    if (!/\/api\/|\.json|graphql|course|programme|program|study-search|catalog/i.test(h)) continue;
    const abs = resolvePageUrl(hit.startsWith("//") ? "https:" + hit : hit, pageUrl);
    if (abs) add({ url: abs, reason: "URL pattern in HTML", source: "href", priority: 50 });
  }

  rawHtml.replace(/data-(?:api|url|href|src)=["']([^"']+)["']/gi, (_, val) => {
    const abs = resolvePageUrl(val, pageUrl);
    if (abs && /api|json|course|program/i.test(abs)) {
      add({ url: abs, reason: "data-* attribute URL", source: "data-attribute", priority: 45 });
    }
  });

  if (/course|programme|program|study-search|catalog/i.test(rawHtml)) {
    const origin = new URL(pageUrl).origin;
    for (const path of GUESSED_API_PATHS) {
      add({
        url: origin + path,
        reason: "Guessed common course API path",
        source: "guessed-pattern",
        priority: 20,
      });
    }
  }

  return candidates.sort((a, b) => candidatePriority(b) - candidatePriority(a));
}

async function fetchEndpointCandidate(candidate) {
  const entry = {
    url: candidate.url,
    reason: candidate.reason,
    source: candidate.source,
    ok: false,
  };
  try {
    const text = await fetchWithWorker(candidate.url, API_DISCOVERY_TIMEOUT_MS);
    const trimmed = (text || "").slice(0, MAX_API_RESPONSE_CHARS);
    const analysis = analyzeApiResponse(trimmed, candidate.url);
    entry.ok = true;
    entry.text = trimmed;
    entry.analysis = analysis;
    entry.responseLength = trimmed.length;
    if (isDebugMode()) {
      debugLog("API candidate:", candidate.url, "len:", trimmed.length, "useful:", analysis.useful, "score:", analysis.score);
    }
    return entry;
  } catch (e) {
    entry.error = e.message;
    if (isDebugMode()) debugLog("API candidate failed:", candidate.url, e.message);
    return entry;
  }
}

function analyzeApiResponse(text, candidateUrl) {
  const sample = (text || "").slice(0, 2000);
  let type = "text";
  let parsedJson = null;

  const trimmed = (text || "").trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      parsedJson = JSON.parse(trimmed);
      type = "json";
    } catch { /* keep as text */ }
  }

  if (!parsedJson && /^\s*</.test(trimmed)) type = "html";

  let programKeywordCount = countKeywords(text, POSITIVE_KEYWORDS);
  const degreeHits = ((text || "").toLowerCase().match(/\b(bsc|msc|mba|ba|ma|phd|beng|bachelor|master)\b/g) || []).length;
  const fieldHits = /"title"|"courseTitle"|"programmeTitle"|"programName"|"award"|"studyLevel"/gi.test(text || "") ? 15 : 0;
  const arrayItems = parsedJson ? countArrayItems(parsedJson) : 0;

  let score = programKeywordCount * 8 + degreeHits * 10 + fieldHits + Math.min(arrayItems, 50) * 3;
  if (type === "json" && arrayItems >= 3) score += 40;
  if ((text || "").length < 80) score -= 100;

  const useful = score >= 45 && programKeywordCount >= 2;

  return { useful, type, score, programKeywordCount, sample, parsedJson, degreeHits, arrayItems };
}

function countArrayItems(obj, depth = 0) {
  if (depth > 6 || obj == null) return 0;
  if (Array.isArray(obj)) {
    let n = obj.length;
    for (const item of obj.slice(0, 5)) n += countArrayItems(item, depth + 1);
    return n;
  }
  if (typeof obj === "object") {
    let max = 0;
    for (const v of Object.values(obj)) max = Math.max(max, countArrayItems(v, depth + 1));
    return max;
  }
  return 0;
}

function pickJsonField(obj, keys) {
  for (const k of keys) {
    if (obj[k] != null && String(obj[k]).trim()) return String(obj[k]).trim();
  }
  return "";
}

function isProgramLikeObject(o) {
  if (!o || typeof o !== "object" || Array.isArray(o)) return false;
  const name = pickJsonField(o, JSON_PROGRAM_NAME_KEYS);
  if (!name || name.length < 3) return false;
  const blob = JSON.stringify(o).toLowerCase();
  if (countKeywords(blob, POSITIVE_KEYWORDS) < 1 && !/bsc|msc|mba|ba|phd|bachelor|master|degree|course|program/.test(blob)) {
    return false;
  }
  return true;
}

function findProgramObjects(obj, depth = 0, out = []) {
  if (depth > 10 || obj == null || out.length > 500) return out;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (isProgramLikeObject(item)) out.push(item);
      findProgramObjects(item, depth + 1, out);
    }
    return out;
  }
  if (typeof obj === "object") {
    if (isProgramLikeObject(obj)) out.push(obj);
    for (const v of Object.values(obj)) findProgramObjects(v, depth + 1, out);
  }
  return out;
}

function apiResponseToMarkdown(text, analysis, sourceUrl) {
  const header = `# API-discovered program listing\n\nSource: ${sourceUrl}\n\n`;

  if (analysis.type === "json" && analysis.parsedJson) {
    const programs = findProgramObjects(analysis.parsedJson);
    const unique = [];
    const seen = new Set();
    for (const p of programs) {
      const name = pickJsonField(p, JSON_PROGRAM_NAME_KEYS);
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      unique.push(p);
    }
    if (!unique.length) {
      return header + "```json\n" + (text || "").slice(0, 15000) + "\n```\n";
    }
    const blocks = unique.slice(0, 400).map(p => {
      const name = pickJsonField(p, JSON_PROGRAM_NAME_KEYS);
      let url = pickJsonField(p, JSON_PROGRAM_URL_KEYS);
      if (url && !/^https?:/i.test(url)) url = resolvePageUrl(url, sourceUrl) || url;
      const lines = [
        "## Program",
        `Name: ${name}`,
        pickJsonField(p, ["award", "qualification", "degree"]) ? `Award/Level: ${pickJsonField(p, ["award", "qualification", "degree", "level", "studyLevel"])}` : "",
        url ? `URL: ${url}` : "",
        pickJsonField(p, ["department", "school"]) ? `Department: ${pickJsonField(p, ["department", "school"])}` : "",
        pickJsonField(p, ["faculty", "college"]) ? `Faculty: ${pickJsonField(p, ["faculty", "college"])}` : "",
        pickJsonField(p, ["mode", "studyMode"]) ? `Mode: ${pickJsonField(p, ["mode", "studyMode"])}` : "",
        pickJsonField(p, ["duration"]) ? `Duration: ${pickJsonField(p, ["duration"])}` : "",
        pickJsonField(p, ["location", "campus"]) ? `Location: ${pickJsonField(p, ["location", "campus"])}` : "",
      ].filter(Boolean);
      return lines.join("\n");
    });
    return header + blocks.join("\n\n");
  }

  if (analysis.type === "html") {
    try {
      return header + cleanHtml(text, { forceRoot: "body", minimalClean: true }).markdown;
    } catch {
      /* fall through */
    }
  }

  return header + (text || "").replace(/\s{3,}/g, " ").trim().slice(0, MAX_HTML_CHARS);
}

function capExtractionMarkdown(md) {
  if (md.length <= MAX_HTML_CHARS) return md;
  const apiMarker = "# API-discovered";
  const renderMarker = "# Playwright-rendered";
  const idx = md.indexOf(apiMarker) >= 0 ? md.indexOf(apiMarker) : md.indexOf(renderMarker);
  if (idx >= 0) {
    const priorityPart = md.slice(idx);
    if (priorityPart.length >= MAX_HTML_CHARS - 500) {
      return priorityPart.slice(0, MAX_HTML_CHARS) + "\n\n[...truncated...]";
    }
    const room = MAX_HTML_CHARS - priorityPart.length - 80;
    const prefix = md.slice(0, Math.max(0, room));
    return priorityPart + "\n\n# Original page context\n\n" + prefix + "\n\n[...truncated...]";
  }
  return md.slice(0, MAX_HTML_CHARS) + "\n\n[...truncated...]";
}

function mergeExtractionMarkdown(staticMd, apiMd, sourceUrl) {
  if (!apiMd) return staticMd;
  if (!staticMd || isWeakProgramMarkdown(staticMd)) return capExtractionMarkdown(apiMd);

  const snippet = staticMd.slice(0, 4000);
  const combined = `${apiMd}\n\n# Original page context\n\n${snippet}`;
  return capExtractionMarkdown(combined);
}

async function tryApiDiscoveryFallback(rawHtml, pageUrl) {
  debugState.apiDiscovery.attempted = true;
  const candidates = discoverDataEndpoints(rawHtml, pageUrl);
  debugState.apiDiscovery.candidates = candidates.map(c => ({
    url: c.url,
    reason: c.reason,
    source: c.source,
    embedded: Boolean(c.embeddedText),
  }));

  const toTry = candidates.slice(0, MAX_API_CANDIDATES);
  let best = null;
  const tried = [];

  for (let i = 0; i < toTry.length; i++) {
    const c = toTry[i];
    showStatus(`Trying possible course data endpoint ${i + 1} of ${toTry.length}...`, 46 + Math.min(8, i));

    let text;
    let analysis;

    if (c.embeddedText) {
      text = c.embeddedText.slice(0, MAX_API_RESPONSE_CHARS);
      analysis = analyzeApiResponse(text, c.url || pageUrl);
      const entry = { url: c.url, reason: c.reason, source: c.source, embedded: true, analysis, ok: true, responseLength: text.length };
      tried.push(entry);
      if (isDebugMode()) debugLog("Embedded candidate:", c.reason, "useful:", analysis.useful, "score:", analysis.score);
    } else {
      const entry = await fetchEndpointCandidate(c);
      tried.push(entry);
      if (!entry.ok || !entry.analysis) continue;
      text = entry.text;
      analysis = entry.analysis;
    }

    if (!analysis?.useful) continue;
    if (!best || analysis.score > best.analysis.score) {
      best = { candidate: c, text, analysis };
    }
  }

  debugState.apiDiscovery.tried = tried;

  if (!best) return null;

  const apiMd = apiResponseToMarkdown(best.text, best.analysis, best.candidate.url || pageUrl);
  const staticMd = debugState.staticMarkdown;
  const merged = mergeExtractionMarkdown(staticMd, apiMd, pageUrl);
  const finalSource = !staticMd || isWeakProgramMarkdown(staticMd)
    ? "api fallback"
    : "static + api merged";

  debugState.apiDiscovery.selected = {
    url: best.candidate.url,
    reason: best.candidate.reason,
    source: best.candidate.source,
    score: best.analysis.score,
  };
  debugState.apiDiscovery.selectedResponse = best.text;
  debugState.apiDiscovery.selectedMarkdown = apiMd;
  debugState.apiDiscovery.finalSource = finalSource;

  return { markdown: merged, finalSource, apiMarkdown: apiMd };
}

//Extraction prompt
function buildPrompt(sourceUrl) {
  return `You are a precise university data extraction tool. Extract every academic program from the cleaned markdown content of a university webpage and return structured data as a JSON array.

The content may be from either:
- a single program detail page, or
- a program/course listing page containing many program cards or links.

If the page is a listing page, extract every visible academic program from the listing, even if only limited fields are available. For listing pages, it is acceptable for many fields to be blank as long as the program name, level if inferable, and URL are captured.

Do not reject a listing page simply because fees, IELTS, or descriptions are missing. Extract the programs that are visible and leave missing fields blank.

The provided markdown may include API-discovered program data converted into markdown. Treat this as official page data if it came from the same university domain. Extract visible program records even if many details are missing.

The provided markdown may include Playwright-rendered content from the official university page. It may include sections titled "Likely Program Links", "Rendered Visible Page Text", or "Rendered HTML Converted to Markdown". Treat these as official rendered page content. If likely program links are present, extract each genuine academic program link as a program record even if detailed fees/admissions fields are blank.

Return ONLY a valid JSON array. No markdown fences, no explanation, no preamble - just the raw JSON array starting with [ and ending with ].

Each object must have exactly the keys listed below. Use "" for any field not found. Never invent or estimate data.

--- PROGRAM IDENTIFICATION ---
"name"
  Full official program name as listed on the page.

"url"
  Absolute URL to this specific program page. Resolve relative paths against ${sourceUrl}. Use "" if no link found.

"level"
  Classify using exactly one of these values:
  "Bachelor's" - BSc, BA, BEng, BBA, BComm, LLB, BEd, BArch, BSc(Hons), and all undergraduate honours degrees
  "Master's" - MSc, MA, MBA, MEng, MRes, MPhil, LLM, PgDip, PgCert, Postgraduate Diploma, Postgraduate Certificate, Graduate Certificate, Graduate Diploma
  "PhD / Doctorate" - PhD, DPhil, DBA, EdD, MD, Professional Doctorate, and all doctoral programs
  "Foundation" - Foundation Year, Foundation Degree, Access Course, Pathway Program
  "Certificate / Diploma" - HND, HNC, Associate Degree, short courses, professional certificates not at postgraduate level
  "Other" - anything that does not fit the above

"department"
  Department name if stated (e.g. "Department of Computer Science"). Use "" if not mentioned.

"faculty"
  Faculty or college name if stated (e.g. "Faculty of Engineering", "College of Arts"). Higher level than department. Use "" if not mentioned.

"location"
  Physical campus location or city where the program is delivered, if stated (e.g. "London", "Main Campus, Manchester", "Dubai Campus"). Use "" if not stated. If the program is fully online with no physical location, use "Online".

"mode"
  Classify using exactly one of these values:
  "On-campus" - if described as: on-campus, in-person, face-to-face, classroom-based, physical classes, campus-based, traditional, full-time on campus
  "Online" - if described as: online, distance learning, distance education, e-learning, fully online, virtual, remote learning, web-based
  "Blended" - if described as: blended, hybrid, mixed-mode, partially online, flexible delivery combining online and on-campus
  "" - if no delivery mode is mentioned anywhere on the page

"duration"
  Full program length if stated (e.g. "3 years", "18 months", "2 years full-time / 4 years part-time"). Use "" if not stated.

"language_of_instruction"
  Language the program is taught in. Use "English" if confirmed English-medium. Use "" if not mentioned.

--- PROGRAM DESCRIPTION ---
"description"
  Extract the official program description from the page. This must be the actual academic description of what the program covers, its objectives, learning outcomes, or curriculum overview.

  INCLUDE: text that describes the program content, what students will study, career outcomes, specialisations, academic focus, research areas, or structure of the program.

  EXCLUDE: any of the following - social media links or calls to action (e.g. "Follow us on Instagram"), generic university marketing slogans unrelated to this specific program, navigation links, cookie notices, footer text, general university information not specific to this program, calls to apply or contact admissions, advertisements.

  Format the description using simple HTML only:
  - Use <strong> for any text that was bold on the original page
  - Use <ul><li> for any bullet point lists
  - Use <ol><li> for any numbered lists
  - Use <p> for paragraphs
  - Do not use any other HTML tags
  - Do not add formatting that was not present in the original source
  - If no genuine program description is found, use ""

--- INTAKE AND DATES ---
"intake_dates"
  All available start months or semesters (e.g. "September", "January / September", "Semester 1 / Semester 2", "October 2025"). Use "" if not stated.

"application_deadline"
  Application deadline if stated (e.g. "31 January 2026", "Rolling admissions", "6 weeks before start"). Use "" if not stated.

--- TUITION FEES ---
For all fee fields: include the numeric amount only, no currency symbols. If a range is given include both (e.g. "15000 - 18000").

"fee_international"   Tuition fee for international or overseas students.
"fee_domestic"        Tuition fee for domestic, local, or home students.
"fee_eu"             EU student fee if separately stated (most relevant for UK universities post-Brexit).
"fee_state"          In-state tuition if stated (relevant for US public universities).
"fee_out_of_state"   Out-of-state tuition if stated (relevant for US public universities).
"fee_per"            What the fee covers. Use exactly one of: "per year" / "per semester" / "per credit" / "total" / "" if not clear.
"currency"           ISO currency code detected from the page. Common mappings: £ = GBP, $ = USD, € = EUR, A$ = AUD, RM = MYR, S$ = SGD, C$ = CAD, ¥ = JPY, ₹ = INR. Use "" if no currency found.

"financial_aid"
  If the page mentions any financial aid, bursaries, grants, or funding support (not just scholarships) use the exact string: "FINANCIAL_AID_AVAILABLE"
  If no financial aid is mentioned, use "".
  Do not describe the financial aid here - the system will replace this value automatically.

--- ENTRY REQUIREMENTS ---
"entry_requirements_general"
  General academic entry requirements applicable to all applicants (e.g. "Upper second class honours degree (2:1) or equivalent", "Minimum 2 years relevant work experience plus a bachelor's degree"). Include A-level requirements, IB scores, GCE requirements, or equivalent qualifications if stated.

"entry_requirements_international"
  Any requirements stated specifically for international applicants that differ from or are in addition to the general requirements. Use "" if not separately stated.

"entry_alevel"
  A-level requirements if stated (e.g. "AAB", "ABB including Mathematics", "112 UCAS points from A-levels"). Use "" if not stated.

"entry_ib"
  International Baccalaureate (IB) Diploma score requirement if stated (e.g. "32 points overall", "35 points with 6,6,5 at Higher Level"). Use "" if not stated.

"entry_gpa"
  Minimum GPA if stated (e.g. "3.0 / 4.0", "3.5 on a 4.0 scale"). Use "" if not stated.

"entry_sat"
  SAT score requirement if stated (e.g. "1200 combined", "Evidence-Based Reading and Writing: 600"). Use "" if not stated.

"entry_act"
  ACT score requirement if stated (e.g. "28 composite"). Use "" if not stated.

"entry_ielts"
  Minimum IELTS overall band score and any component requirements if stated (e.g. "6.5 overall", "7.0 with no band below 6.5"). Use "" if not stated.

"entry_toefl"
  Minimum TOEFL score if stated (e.g. "90 iBT", "550 paper-based", "23 in each section"). Use "" if not stated.

"entry_pte"
  Minimum PTE Academic score if stated (e.g. "58 overall", "65 with no band below 58"). Use "" if not stated.

"entry_duolingo"
  Duolingo English Test score if stated (e.g. "110"). Use "" if not stated.

"entry_cambridge"
  Cambridge English qualification requirement if stated (e.g. "C1 Advanced grade B", "C2 Proficiency"). Use "" if not stated.

"entry_other_english"
  Any other accepted English language qualifications not covered above (e.g. "Trinity ISE III", "LanguageCert C1"). Use "" if not stated.

"entry_gre"
  GRE requirement if stated (e.g. "Required", "Minimum 310 combined", "Not required"). Use "" if not mentioned.

"entry_gmat"
  GMAT requirement if stated (e.g. "Minimum 600", "GMAT or GRE accepted"). Use "" if not mentioned.

"entry_work_experience"
  Work experience requirement if stated (e.g. "Minimum 2 years professional experience", "Managerial experience preferred"). Use "" if not stated.

--- APPLICATION REQUIREMENTS ---
For the following four fields: use "Yes" if the requirement is stated or strongly implied anywhere on the page including in a general admissions or entry requirements section. Use "No" only if explicitly stated that it is not required. Use "" if not mentioned at all.

"rec_letter"       References, recommendation letters, or letters of support.
"personal_statement" Personal statement, statement of purpose, or motivation letter.
"portfolio"        Portfolio, creative samples, or work samples.
"interview"        Interview, audition, or selection day.

--- FUNDING ---
"scholarship"
  "Yes" if any scholarships are mentioned for this program or for international students at this university. "No" if explicitly stated that no scholarships are available. "" if not mentioned.

"scholarship_details"
  Brief description of available scholarships if stated (e.g. "Vice-Chancellor's International Scholarship worth £3,000 per year"). Use "" if not stated.

"accreditation"
  Professional body or industry accreditation mentioned (e.g. "AACSB accredited", "Accredited by BPS", "ABET accredited", "EQUIS", "AMBA"). Use "" if not stated.

--- CLASSIFICATION (leave both blank - filled automatically) ---
"narrow_subject"   ""
"broad_subject"    ""

--- EXTRACTION RULES ---
1. Only extract genuine academic programs. Skip: news, events, staff profiles, research projects, login pages, FAQs, navigation links, external site links, generic page sections.
2. Never invent or estimate data. If not explicitly on this page, use "".
3. Deduplicate: if the same program appears more than once with the same name and level, include it once only.
4. Resolve all relative URLs to absolute URLs using the base: ${sourceUrl}
5. Mode normalisation - map common variations:
   On-campus: in-person, face-to-face, classroom-based, physical classes, campus-based
   Online: distance learning, distance education, e-learning, fully online, virtual, remote
   Blended: hybrid, mixed-mode, partially online, flexible
6. Level normalisation - be consistent:
   Bachelor's includes all undergraduate degrees with or without honours
   Master's includes PgDip, PgCert, Postgraduate Diploma, Postgraduate Certificate
   PhD / Doctorate includes all doctoral and professional doctorate programs
7. For the description field: extract only content genuinely about this specific program. Remove all promotional language, social media references, navigation elements, and generic university marketing not specific to this program.
8. Return every program found on the page. Do not truncate the list.

Source URL: ${sourceUrl}`;
}

//Apply financial aid statement
function applyFinancialAidStatement(p) {
  if (p.financial_aid === "FINANCIAL_AID_AVAILABLE") {
    p.financial_aid = FINANCIAL_AID_STATEMENT;
  }
  return p;
}

//Anthropic extraction
async function extractWithAnthropic(markdown, sourceUrl, apiKey) {
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
      system: buildPrompt(sourceUrl),
      messages: [{ role: "user", content: "Markdown:\n" + markdown }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Anthropic API error " + res.status);
  }
  const data = await res.json();
  return parseJsonResponse(data?.content?.[0]?.text ?? "");
}

//Gemini extraction
async function extractWithGemini(markdown, sourceUrl, apiKey) {
  const prompt  = buildPrompt(sourceUrl) + "\n\nMarkdown:\n" + markdown;
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

//Content selection and cleaning
let turndownService;

function resetDebugState() {
  debugState.rawHtml = "";
  debugState.selectedHtml = "";
  debugState.markdown = "";
  debugState.staticMarkdown = "";
  debugState.finalExtractionMarkdown = "";
  debugState.rootStrategy = "";
  debugState.extractionPreview = "";
  debugState.warnings = [];
  debugState.stats = {};
  debugState.apiDiscovery = {
    attempted: false,
    candidates: [],
    tried: [],
    selected: null,
    selectedResponse: "",
    selectedMarkdown: "",
    finalSource: "",
    apiIsStrong: false,
  };
  debugState.renderApi = {
    attempted: false,
    success: false,
    finalSource: "",
    stats: null,
    warnings: [],
    programLinks: [],
    links: [],
    responseText: "",
    responseHtml: "",
    selectedMarkdown: "",
    error: "",
  };
}

function isDebugMenuVisible() {
  return debugUiVisible;
}

function loadDebugUiVisibility() {
  debugUiVisible = localStorage.getItem("uniscrape_debug_visible") === "1";
  applyDebugUiVisibility();
}

function applyDebugUiVisibility() {
  if (!debugOptionsEl) return;

  debugOptionsEl.classList.toggle("debug-options--visible", debugUiVisible);

  if (!debugUiVisible) {
    hideDebugPanel();
  }
}

function toggleDebugUiVisibility() {
  debugUiVisible = !debugUiVisible;
  localStorage.setItem("uniscrape_debug_visible", debugUiVisible ? "1" : "0");
  applyDebugUiVisibility();

  if (debugUiVisible && isDebugMode() && debugState.rawHtml) {
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

function isDebugMode() {
  return Boolean(debugModeInput?.checked);
}

function shouldUseRenderFallback(markdown) {
  if (isWeakProgramMarkdown(markdown)) return true;

  if (debugState.stats?.suspectedJsShell) return true;

  const hasJsWarning = (debugState.warnings || []).some(w => {
    const msg = String(w).toLowerCase();
    return msg.includes("javascript") || msg.includes("worker fetch may not see");
  });

  if (hasJsWarning) return true;

  return false;
}

function debugLog(...args) {
  if (isDebugMode()) console.log("[UniScrape debug]", ...args);
}

function countKeywords(text, keywords) {
  const lower = (text || "").toLowerCase();
  let total = 0;
  for (const kw of keywords) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = lower.match(new RegExp("\\b" + escaped + "\\b", "gi"));
    if (matches) total += matches.length;
  }
  return total;
}

function isLikelyUsefulAcademicContent(text) {
  const t = (text || "").trim();
  if (t.length < 40) return false;
  const pos = countKeywords(t, POSITIVE_KEYWORDS);
  const linksHint = /(course|program|programme|degree|study|bsc|msc|mba|phd)/i.test(t);
  return pos >= 2 || (pos >= 1 && linksHint && t.length > 120);
}

function scoreContentNode(node) {
  if (!node) return -Infinity;
  const text = node.textContent || "";
  const textLen = text.trim().length;
  if (textLen < 80) return textLen - 500;

  const links = node.querySelectorAll("a[href]");
  const headings = node.querySelectorAll("h1,h2,h3,h4,h5,h6");
  const listItems = node.querySelectorAll("li");

  let score = Math.min(textLen / 50, 400);
  score += Math.min(links.length * 3, 150);
  score += Math.min(headings.length * 8, 80);
  score += Math.min(listItems.length * 2, 120);
  score += countKeywords(text, POSITIVE_KEYWORDS) * 12;
  score -= countKeywords(text, NEGATIVE_KEYWORDS) * 15;

  const tag = (node.tagName || "").toLowerCase();
  const role = node.getAttribute?.("role") || "";
  const id = (node.id || "").toLowerCase();
  const cls = (typeof node.className === "string" ? node.className : "").toLowerCase();
  const meta = id + " " + cls + " " + role;

  if (tag === "main" || role === "main") score += 40;
  if (/course|program|programme|listing|search-result|results/.test(meta)) score += 60;
  if (tag === "nav" || tag === "footer" || tag === "header" || tag === "aside") score -= 200;
  if (/news|event|alumni|cookie|footer|nav|social|privacy/.test(meta)) score -= 80;

  return score;
}

function selectBestContentRoot(doc, forceBody = false) {
  if (forceBody && doc.body) {
    return {
      node: doc.body,
      strategy: "full-body",
      score: scoreContentNode(doc.body),
      candidatesChecked: 1,
    };
  }

  const seen = new Set();
  const candidates = [];

  for (const sel of CANDIDATE_SELECTORS) {
    doc.querySelectorAll(sel).forEach(node => {
      if (seen.has(node)) return;
      seen.add(node);
      candidates.push({
        node,
        selector: sel,
        score: scoreContentNode(node),
      });
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  if (!best?.node) {
    return {
      node: doc.body,
      strategy: "body-fallback",
      score: scoreContentNode(doc.body),
      candidatesChecked: candidates.length,
    };
  }

  return {
    node: best.node,
    strategy: `best-root (${best.selector}, score ${Math.round(best.score)})`,
    score: best.score,
    candidatesChecked: candidates.length,
  };
}

function countCourseLikeLinks(root) {
  let count = 0;
  root.querySelectorAll("a[href]").forEach(a => {
    const blob = ((a.getAttribute("href") || "") + " " + (a.textContent || "")).toLowerCase();
    if (/course|program|programme|study|degree|bsc|msc|mba|phd|bachelor|master/.test(blob)) count++;
  });
  return count;
}

function safeRemoveChrome(root) {
  root.querySelectorAll("nav, footer, header, aside").forEach(el => {
    if (el === root) return;
    const text = el.textContent || "";
    if (isLikelyUsefulAcademicContent(text)) return;
    if (countCourseLikeLinks(el) >= 3) return;
    el.remove();
  });
}

function removeNoiseDivs(root) {
  root.querySelectorAll("div").forEach(div => {
    const meta = ((div.id || "") + " " + (typeof div.className === "string" ? div.className : "")).toLowerCase();
    const text = div.textContent || "";
    const isNoise = /cookie|consent|gdpr|banner|notification|alert|popup|modal|overlay|toast|notice/.test(meta);
    const isSocial = /social|share|twitter|facebook|instagram|linkedin|youtube/.test(meta);
    if ((isNoise || isSocial) && !isLikelyUsefulAcademicContent(text)) div.remove();
  });
}

function stripAlwaysUnsafe(root) {
  root.querySelectorAll("script, style, svg").forEach(el => el.remove());
  const doc = root.ownerDocument || document;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  const comments = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  comments.forEach(c => c.remove());
}

function htmlToMarkdown(html) {
  let markdown = getTurndown().turndown(html).replace(/\n{3,}/g, "\n\n").trim();
  if (markdown.length > MAX_HTML_CHARS) {
    markdown = markdown.slice(0, MAX_HTML_CHARS) + "\n\n[...truncated...]";
  }
  return markdown;
}

function scoreMarkdown(md) {
  let score = (md || "").length / 10;
  score += countKeywords(md, POSITIVE_KEYWORDS) * 20;
  score += ((md || "").match(/\[.*?\]\([^)]+\)/g) || []).length * 5;
  return score;
}

function isWeakMarkdown(md) {
  if (!md || md.length < 800) return true;
  if (countKeywords(md, POSITIVE_KEYWORDS) < 2) return true;
  return false;
}

function getTurndown() {
  if (!turndownService) {
    if (typeof TurndownService === "undefined") {
      throw new Error("Turndown failed to load. Check internet access or vendor turndown locally.");
    }
    turndownService = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
  }
  return turndownService;
}

function cleanHtml(raw, options = {}) {
  const { aggressive = false, forceRoot = "best", minimalClean = false } = options;
  const doc = new DOMParser().parseFromString(raw, "text/html");
  if (!doc.body) throw new Error("Page has no parseable content.");

  const pick = forceRoot === "body"
    ? selectBestContentRoot(doc, true)
    : selectBestContentRoot(doc, false);

  const root = pick.node.cloneNode(true);
  stripAlwaysUnsafe(root);

  if (!minimalClean) {
    if (!aggressive) safeRemoveChrome(root);
    else root.querySelectorAll("nav, footer, header, aside").forEach(el => { if (el !== root) el.remove(); });
    if (!aggressive) removeNoiseDivs(root);
  }

  const selectedHtml = root.innerHTML;
  const markdown = htmlToMarkdown(selectedHtml);
  const strategy = minimalClean && forceRoot === "body" ? "minimal-clean (body)" : pick.strategy;

  return { markdown, selectedHtml, strategy, candidatesChecked: pick.candidatesChecked };
}

function prepareMarkdown(rawHtml) {
  const mode = contentModeSelect?.value || "auto";
  let primary;
  let chosen;

  if (mode === "body") {
    chosen = cleanHtml(rawHtml, { forceRoot: "body", minimalClean: true });
    debugState.rootStrategy = chosen.strategy;
  } else if (mode === "best") {
    chosen = cleanHtml(rawHtml, { forceRoot: "best" });
    debugState.rootStrategy = chosen.strategy;
  } else {
    primary = cleanHtml(rawHtml, { forceRoot: "best" });
    if (isWeakMarkdown(primary.markdown)) {
      const fallback = cleanHtml(rawHtml, { forceRoot: "body", minimalClean: true });
      if (scoreMarkdown(fallback.markdown) > scoreMarkdown(primary.markdown)) {
        chosen = fallback;
        debugState.rootStrategy = fallback.strategy + " (auto-selected over best-root)";
      } else {
        chosen = primary;
        debugState.rootStrategy = primary.strategy + " (auto kept best-root)";
      }
    } else {
      chosen = primary;
      debugState.rootStrategy = primary.strategy;
    }
  }

  debugState.selectedHtml = chosen.selectedHtml;
  debugState.markdown = chosen.markdown;
  analyzeContent(debugState.rawHtml, debugState.selectedHtml, debugState.markdown);
  return chosen.markdown;
}

function analyzeContent(rawHtml, selectedHtml, markdown) {
  const stats = {
    rawHtmlLength: rawHtml.length,
    selectedHtmlLength: selectedHtml.length,
    markdownLength: markdown.length,
    positiveKeywordHits: countKeywords(markdown, POSITIVE_KEYWORDS),
    linkCount: (markdown.match(/\[.*?\]\([^)]+\)/g) || []).length,
    hasProgramKeywords: countKeywords(markdown, POSITIVE_KEYWORDS) >= 2,
  };
  debugState.stats = stats;
  debugState.warnings = [];

  if (markdown.length < 1500) {
    debugState.warnings.push("Markdown is suspiciously short — the listing may have been stripped or not fetched.");
  }
  if (!stats.hasProgramKeywords) {
    debugState.warnings.push("Few or no course/program keywords detected in markdown.");
  }

  const rawLower = rawHtml.toLowerCase();
  const scriptCount = (rawHtml.match(/<script\b/gi) || []).length;
  const visibleTextLen = rawHtml.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length;
  const jsShellSignals = [
    scriptCount >= 8 && visibleTextLen < 2500,
    /id=["']root["']/i.test(rawHtml) && markdown.length < rawHtml.length * 0.02,
    /id=["']app["']/i.test(rawHtml) && markdown.length < 1200,
    rawLower.includes("__next_data__"),
    /\bloading\b/i.test(rawHtml) && stats.positiveKeywordHits < 2,
    rawLower.includes("window.__initial_state__"),
    rawHtml.length > 5000 && markdown.length < rawHtml.length * 0.015 && stats.positiveKeywordHits < 2,
  ];

  if (jsShellSignals.some(Boolean)) {
    debugState.warnings.push(
      "This page may load its course list using JavaScript. The current worker fetch may not see the rendered course data. Try a direct program page or implement rendered fetching with Playwright/backend later."
    );
    stats.suspectedJsShell = true;
  } else {
    stats.suspectedJsShell = false;
  }

  if (markdown.length >= MIN_MARKDOWN_CHARS && isWeakMarkdown(markdown)) {
    debugState.warnings.push("Markdown is above minimum length but still looks weak for program extraction.");
  }
}

function buildExtractionPreview(markdown, sourceUrl, provider) {
  const system = buildPrompt(sourceUrl);
  const userBlock = "Markdown:\n" + markdown;
  const previewMd = markdown.length > 12000
    ? markdown.slice(0, 12000) + "\n\n[...truncated in preview...]"
    : markdown;

  if (provider === "anthropic") {
    return [
      "=== EXTRACTION REQUEST PREVIEW ===",
      `Provider: Anthropic (${ANTHROPIC_MODEL})`,
      `Markdown chars sent: ${markdown.length}`,
      "",
      "--- SYSTEM (truncated to 6000 chars) ---",
      system.slice(0, 6000) + (system.length > 6000 ? "\n[...]" : ""),
      "",
      "--- USER ---",
      "Markdown:\n" + previewMd,
    ].join("\n");
  }

  return [
    "=== EXTRACTION REQUEST PREVIEW ===",
    `Provider: Gemini (${GEMINI_MODEL})`,
    `Markdown chars sent: ${markdown.length}`,
    "",
    "--- PROMPT + MARKDOWN (truncated) ---",
    system.slice(0, 4000) + (system.length > 4000 ? "\n[...]" : ""),
    "",
    "Markdown:\n" + previewMd,
  ].join("\n");
}

function downloadTextFile(filename, content) {
  const blob = new Blob([content || ""], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function copyMarkdownPreview() {
  if (!copyMarkdownBtn) return;
  const text = debugState.markdown.slice(0, 8000) + (debugState.markdown.length > 8000 ? "\n\n[...]" : "");
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

  const s = debugState.stats;
  const ad = debugState.apiDiscovery;
  const rd = debugState.renderApi;
  debugStatsEl.innerHTML = [
    `<div><span class="debug-k">Raw HTML</span> ${s.rawHtmlLength?.toLocaleString() ?? 0} chars</div>`,
    `<div><span class="debug-k">Selected HTML</span> ${s.selectedHtmlLength?.toLocaleString() ?? 0} chars</div>`,
    `<div><span class="debug-k">Static markdown</span> ${(debugState.staticMarkdown || "").length.toLocaleString()} chars</div>`,
    `<div><span class="debug-k">Final extraction markdown</span> ${(debugState.finalExtractionMarkdown || debugState.markdown || "").length.toLocaleString()} chars</div>`,
    `<div><span class="debug-k">Root strategy</span> ${esc(debugState.rootStrategy || "—")}</div>`,
    `<div><span class="debug-k">Final content source</span> ${esc(ad.finalSource || rd.finalSource || (ad.attempted ? "static markdown" : "—"))}</div>`,
    `<div><span class="debug-k">Program keywords</span> ${s.positiveKeywordHits ?? 0} hits ${s.hasProgramKeywords ? "(detected)" : "(weak)"}</div>`,
    `<div><span class="debug-k">Markdown links</span> ${s.linkCount ?? 0}</div>`,
    `<div><span class="debug-k">JS shell suspected</span> ${s.suspectedJsShell ? "yes" : "no"}</div>`,
    `<div><span class="debug-k">Render fallback trigger</span> ${shouldUseRenderFallback(debugState.staticMarkdown || debugState.markdown) ? "yes" : "no"}</div>`,
    `<div><span class="debug-k">API discovery attempted</span> ${ad.attempted ? "Yes" : "No"}</div>`,
    `<div><span class="debug-k">API candidates found</span> ${ad.candidates?.length ?? 0}</div>`,
    `<div><span class="debug-k">API candidates tried</span> ${ad.tried?.length ?? 0}</div>`,
    `<div><span class="debug-k">Useful API candidate</span> ${ad.selected ? "Yes" : "No"}</div>`,
    ad.selected ? `<div><span class="debug-k">Selected API URL</span> ${esc(ad.selected.url || "embedded")}</div>` : "",
    ad.selected ? `<div><span class="debug-k">Selected reason</span> ${esc(ad.selected.reason || "—")}</div>` : "",
    ad.selected ? `<div><span class="debug-k">API response score</span> ${ad.selected.score ?? "—"}</div>` : "",
    ad.attempted ? `<div><span class="debug-k">API strong evidence</span> ${ad.apiIsStrong ? "yes" : "no"}</div>` : "",
    `<div><span class="debug-k">Render backend attempted</span> ${rd.attempted ? "Yes" : "No"}</div>`,
    `<div><span class="debug-k">Render backend success</span> ${rd.success ? "Yes" : "No"}</div>`,
    rd.stats ? `<div><span class="debug-k">Render text length</span> ${rd.stats.textLength?.toLocaleString?.() ?? rd.stats.textLength ?? "—"}</div>` : "",
    rd.stats ? `<div><span class="debug-k">Render links</span> ${rd.stats.linkCount ?? "—"}</div>` : "",
    rd.stats ? `<div><span class="debug-k">Render program links</span> ${rd.stats.programLinkCount ?? "—"}</div>` : "",
    rd.stats?.programCardCount !== undefined ? `<div><span class="debug-k">Render program cards</span> ${rd.stats.programCardCount}</div>` : "",
    rd.stats?.htmlLength !== undefined ? `<div><span class="debug-k">Rendered HTML</span> ${rd.stats.htmlLength.toLocaleString()} chars</div>` : "",
    rd.stats?.renderTimeMs !== undefined ? `<div><span class="debug-k">Render time</span> ${rd.stats.renderTimeMs.toLocaleString()} ms</div>` : "",
    rd.error ? `<div><span class="debug-k">Render error</span> ${esc(rd.error)}</div>` : "",
  ].filter(Boolean).join("");

  const warnings = [...debugState.warnings];
  if (Array.isArray(rd.warnings) && rd.warnings.length) {
    warnings.push(...rd.warnings.map(w => "Render backend: " + w));
  }

  if (warnings.length && debugWarningsEl) {
    debugWarningsEl.innerHTML = warnings.map(w => `<li>${esc(w)}</li>`).join("");
    debugWarningsBlock?.classList.remove("hidden");
  } else if (debugWarningsEl) {
    debugWarningsEl.innerHTML = "";
    debugWarningsBlock?.classList.add("hidden");
  }

  const hasApi = Boolean(debugState.apiDiscovery.selectedResponse || rd.responseHtml || rd.responseText);
  downloadApiResponseBtn?.classList.toggle("hidden", !hasApi);
  downloadFinalMdBtn?.classList.toggle("hidden", !(debugState.finalExtractionMarkdown || debugState.markdown));

  debugPanel.classList.remove("hidden");
}

function hideDebugPanel() {
  debugPanel?.classList.add("hidden");
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
  a.download = `uniscrape-v2.3_${new Date().toISOString().slice(0, 10)}.csv`;
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