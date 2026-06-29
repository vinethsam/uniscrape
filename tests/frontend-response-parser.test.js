const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getFinalRowsFromResponse,
  getUniversalDiagnostics,
  getUcasDiagnostics,
  hasUniversalDiagnostics,
  hasUcasSecurityPage,
  isUcasResponse,
  isUcasUrl,
  normalizeUcasRows,
} = require("../frontend-response-parser.js");

test("reads catalogRows in catalog mode", () => {
  const response = {
    catalogRows: [{ courseName: "A" }],
    responseMeta: { rowCount: 1 },
  };

  assert.equal(getFinalRowsFromResponse(response, "catalog").length, 1);
});

test("reads programmes in audit mode", () => {
  const response = {
    programmes: [{ programName: "A" }],
    responseMeta: { rowCount: 1 },
  };

  assert.equal(getFinalRowsFromResponse(response, "audit").length, 1);
});

test("falls back to programs in audit mode", () => {
  const response = {
    programs: [{ programName: "A" }],
    responseMeta: { rowCount: 1 },
  };

  assert.equal(getFinalRowsFromResponse(response, "audit").length, 1);
});

test("does not treat programme candidates as final rows", () => {
  const response = {
    programmeCandidates: [{ title: "A" }],
    responseMeta: { rowCount: 0 },
  };

  assert.deepEqual(getFinalRowsFromResponse(response, "audit"), []);
  assert.deepEqual(getFinalRowsFromResponse(response, "catalog"), []);
});

test("detects only supported UCAS course and search URLs", () => {
  assert.equal(isUcasUrl("https://www.ucas.com/explore/search/courses?query=law"), true);
  assert.equal(isUcasUrl("https://ucas.com/explore/search/all?page=2"), true);
  assert.equal(isUcasUrl("https://www.ucas.com/explore/search/courses-beta?query=law"), true);
  assert.equal(isUcasUrl("https://www.ucas.com/explore/courses/ABC123"), true);
  assert.equal(isUcasUrl("https://www.ucas.com/explore/search/providers"), false);
  assert.equal(isUcasUrl("https://www.ucas.com/explore/search/courses-not-real"), false);
  assert.equal(isUcasUrl("https://www.ucas.com.evil.test/explore/search/courses"), false);
  assert.equal(isUcasUrl("https://subdomain.ucas.com/explore/search/courses"), false);
  assert.equal(isUcasUrl("https://example.com/search?q=ucas"), false);
  assert.equal(isUcasUrl("not a URL"), false);
});

test("recognises backend-confirmed UCAS mode and reads UCAS rows", () => {
  const response = {
    diagnostics: { ucasMode: true, staticOnly: true },
    catalogRows: [{ program_name: "Law" }],
  };

  assert.equal(isUcasResponse(response), true);
  assert.deepEqual(getFinalRowsFromResponse(response, "ucas"), response.catalogRows);
});

test("normalises UCAS rows while preserving zero and N/A points", () => {
  const rows = normalizeUcasRows([
    {
      program_name: "Zero tariff",
      provider_name: "Example University",
      ucas_tariff_raw: 0,
      preferred_fee_raw: "GBP 9,535",
    },
    {
      title: "No tariff",
      university: "Another University",
      ucas_tariff_raw: "N/A",
      fee_status: "no_fee_provided",
    },
  ]);

  assert.equal(rows[0].ucasPoints, 0);
  assert.equal(rows[0].fee, "GBP 9,535");
  assert.equal(rows[1].ucasPoints, "N/A");
  assert.equal(rows[1].feeStatus, "no_fee_provided");
});

test("normalises UCAS table field fallbacks", () => {
  const [row] = normalizeUcasRows([
    {
      title: "Fine Art",
      award: "BA (Hons)",
      institution: "Example School",
      home_fee_raw: "Home fee pending",
      preferred_fee_type: "home",
      study_mode: "Full-time",
      start_date_or_month: "September 2027",
      campus_location: "Main campus",
      course_url: "https://www.ucas.com/explore/courses/ABC123",
    },
  ]);

  assert.equal(row.programName, "Fine Art");
  assert.equal(row.qualification, "BA (Hons)");
  assert.equal(row.universityProvider, "Example School");
  assert.equal(row.fee, "Home fee pending");
  assert.equal(row.feeStatus, "home");
  assert.equal(row.studyMode, "Full-time");
  assert.equal(row.startDate, "September 2027");
  assert.equal(row.location, "Main campus");
  assert.equal(row.courseUrl, "https://www.ucas.com/explore/courses/ABC123");
});

test("falls back to UCAS point ranges only when raw points are missing", () => {
  const [row] = normalizeUcasRows([
    { program_name: "Computing", ucas_tariff_min: 96, ucas_tariff_max: 112 },
  ]);

  assert.equal(row.ucasPoints, "96–112");
});

test("detects UCAS security diagnostics without treating them as an empty page", () => {
  const response = {
    metadata: { ucasMode: true },
    diagnostics: {
      securityPageDetected: true,
      blockedPageCount: 1,
      blockedPageUrls: ["https://www.ucas.com/explore/search/courses?page=2"],
      blockedPageType: "cloudflare_challenge",
      paginationStoppedReason: "security_page_detected",
      ucasComplete: false,
      partial: true,
    },
  };

  assert.equal(hasUcasSecurityPage(response), true);
  assert.deepEqual(getUcasDiagnostics(response).blockedPageUrls, [
    "https://www.ucas.com/explore/search/courses?page=2",
  ]);
});

test("normalises mixed UCAS retry diagnostics", () => {
  const diagnostics = getUcasDiagnostics({
    diagnostics: {
      ucasMode: true,
      status: "rate_limited",
      jobPhase: "waiting",
      ucasRateLimited: true,
      next_retry_at: "2026-06-25T12:05:00Z",
      rateLimitAttemptCount: 2,
      currentListingPage: 2,
      nextListingUrl: "https://www.ucas.com/explore/search/courses?page=2",
      feeQueueLength: 12,
      feeDetailsAttempted: 0,
      feeCompletedCount: 0,
    },
  });

  assert.equal(diagnostics.ucasRateLimited, true);
  assert.equal(diagnostics.rateLimited, true);
  assert.equal(diagnostics.jobStatus, "rate_limited");
  assert.equal(diagnostics.phase, "waiting");
  assert.equal(diagnostics.nextRetryAt, "2026-06-25T12:05:00Z");
  assert.equal(diagnostics.next_retry_at, "2026-06-25T12:05:00Z");
  assert.equal(diagnostics.rateLimitAttemptCount, 2);
  assert.equal(diagnostics.currentListingPage, 2);
  assert.equal(diagnostics.feeQueueLength, 12);
});

test("normalises universal queue diagnostics without UCAS classification", () => {
  const diagnostics = getUniversalDiagnostics({
    diagnostics: {
      status: "running",
      job_phase: "detail_fetch",
      source_type: "universal",
      seed_page_type: "programme_listing",
      listing_pages_fetched: 3,
      detail_pages_queued: 12,
      detail_pages_fetched: 5,
      detail_pages_succeeded: 4,
      detail_pages_failed: 1,
      enrichment_queue_length: 2,
      completion_status: "in_progress",
      completion_reasons: ["detail_timeout"],
      current_url: "https://example.edu/courses",
      estimated_remaining_seconds: 90,
    },
  });

  assert.equal(hasUniversalDiagnostics(diagnostics), true);
  assert.equal(diagnostics.sourceMode, "universal");
  assert.equal(diagnostics.jobStatus, "running");
  assert.equal(diagnostics.phase, "detail_fetch");
  assert.equal(diagnostics.seedPageType, "programme_listing");
  assert.equal(diagnostics.detailPagesSucceeded, 4);
  assert.deepEqual(diagnostics.completionReasons, ["detail_timeout"]);
});

test("normalises direct detail universal diagnostics", () => {
  const diagnostics = getUniversalDiagnostics({
    frontendDiagnostics: {
      directDetailMode: true,
      seedPageType: "programme_detail",
      universalComplete: false,
      partial: true,
    },
  });

  assert.equal(hasUniversalDiagnostics(diagnostics), true);
  assert.equal(diagnostics.directDetailMode, true);
  assert.equal(diagnostics.seedPageType, "programme_detail");
  assert.equal(diagnostics.universalComplete, false);
  assert.equal(diagnostics.partial, true);
});

test("does not classify UCAS diagnostics as universal diagnostics", () => {
  const diagnostics = getUniversalDiagnostics({
    diagnostics: {
      ucasMode: true,
      jobStatus: "rate_limited",
      seedPageType: "programme_listing",
    },
  });

  assert.equal(hasUniversalDiagnostics(diagnostics), false);
});

test("does not classify a plain status-only response as universal diagnostics", () => {
  const diagnostics = getUniversalDiagnostics({
    status: "ok",
  });

  assert.equal(hasUniversalDiagnostics(diagnostics), false);
});

test("reads universal diagnostics from nested job progress payloads", () => {
  const diagnostics = getUniversalDiagnostics({
    data: {
      progress: {
        jobStatus: "running",
        jobPhase: "pagination",
        paginationQueueLength: 3,
      },
    },
  });

  assert.equal(hasUniversalDiagnostics(diagnostics), true);
  assert.equal(diagnostics.jobStatus, "running");
  assert.equal(diagnostics.phase, "pagination");
  assert.equal(diagnostics.paginationQueueLength, 3);
});
