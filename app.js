/*
   UniScrape v2.3 - app.js
   Supports Anthropic and Google Gemini APIs.
   Proxy: https://uniscrape-proxy.itsvineth05.workers.dev
*/

//Config
const MAX_HTML_CHARS  = 120000;
const WORKER_URL      = "https://uniscrape-proxy.itsvineth05.workers.dev";
const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
const GEMINI_MODEL    = "gemini-1.5-pro-latest";
const GEMINI_URL      = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const FINANCIAL_AID_STATEMENT = "This university offers some form of financial aid to prospective students. Please always check the specific requirements and restrictions on scholarship availability.";

//State
let allPrograms = [];
let sortCol     = null;
let sortDir     = 1;

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

//Persist settings
apiProvider.value = localStorage.getItem("uniscrape_provider") || "anthropic";
apiKeyInput.value = localStorage.getItem("uniscrape_key_" + apiProvider.value) || "";
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

//Main flow
scrapeBtn.addEventListener("click", runScrape);
urlInput.addEventListener("keydown", e => { if (e.key === "Enter") runScrape(); });

async function runScrape() {
  const url      = urlInput.value.trim();
  const apiKey   = apiKeyInput.value.trim();
  const provider = apiProvider.value;

  clearError();
  hideResults();

  if (!url)    return showError("Please enter a URL.");
  if (!apiKey) return showError("Please enter your API key.");
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

  showStatus("Extracting program data...", 40);

  let programs;
  try {
    programs = provider === "anthropic"
      ? await extractWithAnthropic(html, url, apiKey)
      : await extractWithGemini(html, url, apiKey);
  } catch (e) {
    scrapeBtn.disabled = false;
    return showError("Extraction failed: " + e.message);
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

//Extraction prompt
function buildPrompt(sourceUrl) {
  return `You are a precise university data extraction tool. Extract every academic program from the HTML page provided and return structured data as a JSON array.

Return ONLY a valid JSON array. No markdown fences, no explanation, no preamble - just the raw JSON array starting with [ and ending with ].

Each object must have exactly the keys listed below. Use "" for any field not found. Never invent or estimate data.

PROGRAM IDENTIFICATION
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

PROGRAM DESCRIPTION
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

INTAKE AND DATES
"intake_dates"
  All available start months or semesters (e.g. "September", "January / September", "Semester 1 / Semester 2", "October 2025"). Use "" if not stated.

"application_deadline"
  Application deadline if stated (e.g. "31 January 2026", "Rolling admissions", "6 weeks before start"). Use "" if not stated.

TUITION FEES
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

ENTRY REQUIREMENTS
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

APPLICATION REQUIREMENTS
For the following four fields: use "Yes" if the requirement is stated or strongly implied anywhere on the page including in a general admissions or entry requirements section. Use "No" only if explicitly stated that it is not required. Use "" if not mentioned at all.

"rec_letter"       References, recommendation letters, or letters of support.
"personal_statement" Personal statement, statement of purpose, or motivation letter.
"portfolio"        Portfolio, creative samples, or work samples.
"interview"        Interview, audition, or selection day.

FUNDING
"scholarship"
  "Yes" if any scholarships are mentioned for this program or for international students at this university. "No" if explicitly stated that no scholarships are available. "" if not mentioned.

"scholarship_details"
  Brief description of available scholarships if stated (e.g. "Vice-Chancellor's International Scholarship worth £3,000 per year"). Use "" if not stated.

"accreditation"
  Professional body or industry accreditation mentioned (e.g. "AACSB accredited", "Accredited by BPS", "ABET accredited", "EQUIS", "AMBA"). Use "" if not stated.

CLASSIFICATION (leave both blank - filled automatically)
"narrow_subject"   ""
"broad_subject"    ""

EXTRACTION RULES
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
async function extractWithAnthropic(rawHtml, sourceUrl, apiKey) {
  const cleaned = cleanHtml(rawHtml);
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

//Gemini extraction
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

//Shared helpers
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
  [filterName, filterLevel, filterBroad, filterMode, filterScholarship, filterDept].forEach(el => el.value = "");
});

//Helpers
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
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}