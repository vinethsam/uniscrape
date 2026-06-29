(function attachUniScrapeResponseParser(root) {
  const UCAS_PATH_PREFIXES = [
    "/explore/search/courses-beta",
    "/explore/search/courses",
    "/explore/search/all",
    "/explore/courses/",
  ];

  function pathStartsWithAllowedPrefix(pathname, prefix) {
    if (!pathname.startsWith(prefix)) return false;
    if (prefix.endsWith("/")) return true;
    const nextChar = pathname.charAt(prefix.length);
    return nextChar === "" || nextChar === "/";
  }

  function isUcasUrl(inputUrl) {
    try {
      const parsed = new URL(String(inputUrl || "").trim());
      const hostname = parsed.hostname.toLowerCase();
      const pathname = parsed.pathname.toLowerCase();

      return (
        (parsed.protocol === "https:" || parsed.protocol === "http:") &&
        (hostname === "ucas.com" || hostname === "www.ucas.com") &&
        UCAS_PATH_PREFIXES.some(prefix => pathStartsWithAllowedPrefix(pathname, prefix))
      );
    } catch {
      return false;
    }
  }

  function responseSources(result) {
    const sources = [
      result?.frontendDiagnostics,
      result?.diagnostics,
      result?.metadata,
      result?.responseMeta,
      result?.job,
      result?.progress,
      result?.metrics,
      result?.stats,
      result?.data,
      result?.data?.frontendDiagnostics,
      result?.data?.diagnostics,
      result?.data?.metadata,
      result?.data?.responseMeta,
      result?.data?.job,
      result?.data?.progress,
      result?.data?.metrics,
      result?.data?.stats,
      result,
    ].filter(source => source && typeof source === "object");

    return sources.filter((source, index) => sources.indexOf(source) === index);
  }

  function firstResponseValue(result, keys) {
    for (const source of responseSources(result)) {
      for (const key of keys) {
        if (source[key] !== undefined && source[key] !== null) {
          return source[key];
        }
      }
    }
    return undefined;
  }

  function responseValues(result, key) {
    return responseSources(result)
      .map(source => source[key])
      .filter(value => value !== undefined && value !== null);
  }

  function isTrue(value) {
    return value === true || value === 1 || String(value).toLowerCase() === "true";
  }

  function isUcasResponse(result) {
    return responseSources(result).some(source =>
      isTrue(source.ucasMode) || isTrue(source.ucasDetected)
    );
  }

  function getUcasDiagnostics(result) {
    const keys = [
      "ucasMode",
      "ucasDetected",
      "staticOnly",
      "llmUsed",
      "playwrightUsed",
      "expectedResultCount",
      "rowsOutput",
      "uniqueCourses",
      "listingPagesFetched",
      "listingPagesExpected",
      "paginationStoppedReason",
      "ucasComplete",
      "partial",
      "feeFoundCount",
      "noFeeProvidedCount",
      "optionRequiredCount",
      "feeFetchFailedCount",
      "feeParseFailedCount",
      "securityPageDetected",
      "blockedPageCount",
      "blockedPageUrls",
      "blockedPageType",
      "jobId",
      "job_id",
      "jobStatus",
      "job_status",
      "status",
      "jobPhase",
      "job_phase",
      "phase",
      "rowsCollected",
      "rows_collected",
      "feePagesCompleted",
      "fee_pages_completed",
      "feePagesRemaining",
      "fee_pages_remaining",
      "feeQueueLength",
      "fee_queue_length",
      "feeDetailsAttempted",
      "fee_details_attempted",
      "feeCompletedCount",
      "fee_completed_count",
      "rateLimited",
      "rate_limited",
      "ucasRateLimited",
      "ucas_rate_limited",
      "rateLimitAttemptCount",
      "rate_limit_attempt_count",
      "currentListingPage",
      "current_listing_page",
      "nextListingUrl",
      "next_listing_url",
      "waiting",
      "isWaiting",
      "is_waiting",
      "nextRetryAt",
      "next_retry_at",
      "estimatedRemainingTime",
      "estimated_remaining_time",
    ];

    const diagnostics = keys.reduce((diagnosticValues, key) => {
      const values = responseValues(result, key);
      let value = values[0];

      if (["ucasMode", "ucasDetected", "staticOnly", "partial", "securityPageDetected", "rateLimited", "rate_limited", "ucasRateLimited", "ucas_rate_limited", "waiting"].includes(key)) {
        if (values.some(isTrue)) value = true;
      } else if (key === "ucasComplete" && values.some(item => item === false || String(item).toLowerCase() === "false")) {
        value = false;
      } else if (key === "blockedPageCount" && values.length) {
        value = Math.max(...values.map(item => Number(item) || 0));
      } else if (key === "blockedPageUrls" && values.length) {
        value = [...new Set(values.flatMap(item => Array.isArray(item) ? item : [item]).filter(Boolean))];
      }

      if (value !== undefined) diagnosticValues[key] = value;
      return diagnosticValues;
    }, {});

    const aliasGroups = [
      ["jobId", ["jobId", "job_id", "id"]],
      ["jobStatus", ["jobStatus", "job_status", "status", "state"]],
      ["phase", ["jobPhase", "job_phase", "phase", "currentPhase", "current_phase"]],
      ["expectedResultCount", ["expectedResultCount", "expected_result_count", "expectedCount", "expected_count", "totalCount", "total_count", "total"]],
      ["rowsCollected", ["rowsCollected", "rows_collected", "rowsOutput", "rows_output", "resultCount", "result_count"]],
      ["listingPagesFetched", ["listingPagesFetched", "listing_pages_fetched"]],
      ["currentListingPage", ["currentListingPage", "current_listing_page", "listingPage", "listing_page", "page"]],
      ["nextListingUrl", ["nextListingUrl", "next_listing_url", "currentListingUrl", "current_listing_url", "targetUrl", "target_url"]],
      ["feeQueueLength", ["feeQueueLength", "fee_queue_length"]],
      ["feeDetailsAttempted", ["feeDetailsAttempted", "fee_details_attempted"]],
      ["feeCompletedCount", ["feeCompletedCount", "fee_completed_count", "feePagesCompleted", "fee_pages_completed"]],
      ["rateLimitAttemptCount", ["rateLimitAttemptCount", "rate_limit_attempt_count", "retryAttemptCount", "retry_attempt_count"]],
      ["nextRetryAt", ["nextRetryAt", "next_retry_at"]],
      ["estimatedRemainingTime", ["estimatedRemainingTime", "estimated_remaining_time", "eta", "etaSeconds", "eta_seconds"]],
    ];

    aliasGroups.forEach(([canonicalKey, aliases]) => {
      const value = firstResponseValue(result, aliases);
      if (value !== undefined && value !== null) diagnostics[canonicalKey] = value;
    });

    if (["waiting", "isWaiting", "is_waiting"].some(key => responseValues(result, key).some(isTrue))) {
      diagnostics.waiting = true;
    }

    if (["rateLimited", "rate_limited", "ucasRateLimited", "ucas_rate_limited"].some(key => responseValues(result, key).some(isTrue))) {
      diagnostics.rateLimited = true;
      diagnostics.ucasRateLimited = true;
    }

    return diagnostics;
  }

  const UNIVERSAL_DIAGNOSTIC_ALIASES = Object.freeze([
    ["jobId", ["jobId", "job_id", "id"]],
    ["jobStatus", ["jobStatus", "job_status", "status", "state"]],
    ["phase", ["jobPhase", "job_phase", "phase", "currentPhase", "current_phase", "stage", "step"]],
    ["sourceType", ["sourceType", "source_type", "scraperSourceType", "scraper_source_type"]],
    ["seedPageType", ["seedPageType", "seed_page_type", "pageType", "page_type"]],
    ["directDetailMode", ["directDetailMode", "direct_detail_mode"]],
    ["listingQueueLength", ["listingQueueLength", "listing_queue_length"]],
    ["paginationQueueLength", ["paginationQueueLength", "pagination_queue_length"]],
    ["detailQueueLength", ["detailQueueLength", "detail_queue_length"]],
    ["enrichmentQueueLength", ["enrichmentQueueLength", "enrichment_queue_length"]],
    ["listingPagesFetched", ["listingPagesFetched", "listing_pages_fetched"]],
    ["detailPagesQueued", ["detailPagesQueued", "detail_pages_queued"]],
    ["detailPagesFetched", ["detailPagesFetched", "detail_pages_fetched", "detailsAttempted", "detailPagesAttempted"]],
    ["detailPagesSucceeded", ["detailPagesSucceeded", "detail_pages_succeeded", "detailsSucceeded"]],
    ["detailPagesFailed", ["detailPagesFailed", "detail_pages_failed", "detailsFailed"]],
    ["detailPagesSkipped", ["detailPagesSkipped", "detail_pages_skipped", "detailsSkipped"]],
    ["enrichmentPagesFetched", ["enrichmentPagesFetched", "enrichment_pages_fetched"]],
    ["completionStatus", ["completionStatus", "completion_status"]],
    ["universalComplete", ["universalComplete", "universal_complete", "complete", "completed"]],
    ["partial", ["partial", "isPartial", "is_partial"]],
    ["completionReasons", ["completionReasons", "completion_reasons", "partialReasons", "partial_reasons"]],
    ["currentUrl", ["currentUrl", "current_url", "currentTargetUrl", "current_target_url"]],
    ["nextUrl", ["nextUrl", "next_url", "nextTargetUrl", "next_target_url"]],
    ["currentDelaySeconds", ["currentDelaySeconds", "current_delay_seconds", "delaySeconds", "delay_seconds"]],
    ["estimatedRemainingSeconds", ["estimatedRemainingSeconds", "estimated_remaining_seconds", "etaSeconds", "eta_seconds"]],
    ["completedUrls", ["completedUrls", "completed_urls"]],
    ["failedUrls", ["failedUrls", "failed_urls"]],
    ["skippedUrls", ["skippedUrls", "skipped_urls"]],
    ["rowRejectionReasons", ["rowRejectionReasons", "row_rejection_reasons"]],
    ["pageTypeClassifierReasons", ["pageTypeClassifierReasons", "page_type_classifier_reasons", "classifierReasons", "classifier_reasons"]],
    ["fieldCoverage", ["fieldCoverage", "field_coverage"]],
    ["provenanceSummary", ["provenanceSummary", "provenance_summary"]],
  ]);

  function getUniversalDiagnostics(result) {
    const diagnostics = {};

    UNIVERSAL_DIAGNOSTIC_ALIASES.forEach(([canonicalKey, aliases]) => {
      const value = firstResponseValue(result, aliases);
      if (value !== undefined && value !== null) diagnostics[canonicalKey] = value;
    });

    if (["directDetailMode", "direct_detail_mode"].some(key => responseValues(result, key).some(isTrue))) {
      diagnostics.directDetailMode = true;
    }

    if (["partial", "isPartial", "is_partial"].some(key => responseValues(result, key).some(isTrue))) {
      diagnostics.partial = true;
    }

    if (["universalComplete", "universal_complete", "complete", "completed"].some(key => responseValues(result, key).some(isTrue))) {
      diagnostics.universalComplete = true;
    } else if (responseValues(result, "universalComplete").some(value => value === false || String(value).toLowerCase() === "false")) {
      diagnostics.universalComplete = false;
    }

    const ucasMode = responseSources(result).some(source =>
      isTrue(source.ucasMode) || isTrue(source.ucasDetected)
    );
    if (ucasMode) return {};

    if (hasUniversalDiagnostics(diagnostics)) {
      diagnostics.sourceMode = "universal";
    }

    return diagnostics;
  }

  function hasUniversalDiagnostics(diagnosticsOrResult) {
    const diagnostics = diagnosticsOrResult && diagnosticsOrResult.sourceMode === "universal"
      ? diagnosticsOrResult
      : diagnosticsOrResult && (
          diagnosticsOrResult.frontendDiagnostics ||
          diagnosticsOrResult.diagnostics ||
          diagnosticsOrResult.responseMeta ||
          diagnosticsOrResult.metadata
        )
        ? getUniversalDiagnostics(diagnosticsOrResult)
        : diagnosticsOrResult || {};

    const strongSignals = [
      "jobId",
      "sourceType",
      "seedPageType",
      "directDetailMode",
      "listingQueueLength",
      "paginationQueueLength",
      "detailQueueLength",
      "enrichmentQueueLength",
      "completionStatus",
      "universalComplete",
      "completionReasons",
      "currentUrl",
      "nextUrl",
    ];

    const hasStrongSignal = strongSignals.some(key =>
      diagnostics[key] !== undefined && diagnostics[key] !== null && diagnostics[key] !== ""
    );
    const hasStatusAndPhase =
      diagnostics.jobStatus !== undefined &&
      diagnostics.jobStatus !== null &&
      diagnostics.jobStatus !== "" &&
      diagnostics.phase !== undefined &&
      diagnostics.phase !== null &&
      diagnostics.phase !== "";

    return hasStrongSignal || hasStatusAndPhase;
  }

  function hasUcasSecurityPage(result) {
    const diagnostics = getUcasDiagnostics(result);
    const blockedUrls = Array.isArray(diagnostics.blockedPageUrls)
      ? diagnostics.blockedPageUrls
      : diagnostics.blockedPageUrls
        ? [diagnostics.blockedPageUrls]
        : [];
    const warnings = [
      ...(Array.isArray(result?.warnings) ? result.warnings : []),
      ...(Array.isArray(result?.diagnostics?.warnings) ? result.diagnostics.warnings : []),
      ...(Array.isArray(result?.frontendDiagnostics?.warnings)
        ? result.frontendDiagnostics.warnings
        : []),
    ].join(" ");
    const securityLanguage =
      /\b(cloudflare|checking your browser|just a moment|captcha|access denied|forbidden|bot[- ]?check|bot detection|security check|challenge page)\b/i;

    return Boolean(
      isTrue(diagnostics.securityPageDetected) ||
      Number(diagnostics.blockedPageCount || 0) > 0 ||
      blockedUrls.length > 0 ||
      String(diagnostics.blockedPageType || "").trim() ||
      String(diagnostics.paginationStoppedReason || "").toLowerCase() === "security_page_detected" ||
      securityLanguage.test(warnings)
    );
  }

  function getFinalRowsFromResponse(result, mode) {
    const catalogRows = Array.isArray(result?.catalogRows) ? result.catalogRows : [];
    const programmes = Array.isArray(result?.programmes) ? result.programmes : [];
    const programs = Array.isArray(result?.programs) ? result.programs : [];
    const rows = Array.isArray(result?.rows) ? result.rows : [];

    if (mode === "ucas") {
      return catalogRows.length
        ? catalogRows
        : programmes.length
          ? programmes
          : programs.length
            ? programs
            : rows;
    }

    if (mode === "catalog") {
      return catalogRows.length ? catalogRows : rows;
    }

    if (mode === "audit") {
      return programmes.length ? programmes : programs;
    }

    return catalogRows.length
      ? catalogRows
      : programmes.length
        ? programmes
        : programs.length
          ? programs
          : rows;
  }

  function hasDisplayValue(value) {
    return value === 0 || (value !== undefined && value !== null && String(value).trim() !== "");
  }

  function firstPresentValue(...values) {
    return values.find(hasDisplayValue);
  }

  function joinDistinctValues(...values) {
    const seen = new Set();
    return values
      .filter(hasDisplayValue)
      .map(value => String(value).trim())
      .filter(value => {
        const key = value.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .join(" / ");
  }

  function formatUcasPoints(raw, minimum, maximum) {
    if (hasDisplayValue(raw)) return raw;
    const hasMinimum = hasDisplayValue(minimum);
    const hasMaximum = hasDisplayValue(maximum);

    if (hasMinimum && hasMaximum) {
      return String(minimum).trim() === String(maximum).trim()
        ? minimum
        : `${minimum}–${maximum}`;
    }

    return hasMinimum ? minimum : hasMaximum ? maximum : "";
  }

  function normalizeUcasRows(rows) {
    if (!Array.isArray(rows)) return [];

    return rows.map(row => {
      const pointsMinimum = firstPresentValue(
        row?.ucas_tariff_min,
        row?.ucas_points_min,
        row?.tariff_min,
      );
      const pointsMaximum = firstPresentValue(
        row?.ucas_tariff_max,
        row?.ucas_points_max,
        row?.tariff_max,
      );

      return {
        programName: firstPresentValue(
          row?.program_name,
          row?.programme_name,
          row?.name,
          row?.title,
          row?.courseName,
          row?.course_name,
        ) ?? "",
        universityProvider: firstPresentValue(
          row?.university_name,
          row?.provider_name,
          row?.institution,
          row?.university,
          row?.universityName,
        ) ?? "",
        ucasPoints: formatUcasPoints(
          firstPresentValue(row?.ucas_tariff_raw, row?.ucas_points_raw),
          pointsMinimum,
          pointsMaximum,
        ),
        ucasPointsMin: pointsMinimum ?? "",
        ucasPointsMax: pointsMaximum ?? "",
        fee: firstPresentValue(
          row?.preferred_fee_raw,
          row?.international_fee_raw,
          row?.home_fee_raw,
          row?.fees,
        ) ?? "",
        feeStatus: joinDistinctValues(row?.fee_status, row?.preferred_fee_type),
        internationalFee: firstPresentValue(row?.international_fee_raw) ?? "",
        homeFee: firstPresentValue(row?.home_fee_raw) ?? "",
        qualification: firstPresentValue(
          row?.qualification,
          row?.award,
          row?.level,
          row?.levelOfStudy,
          row?.level_of_study,
        ) ?? "",
        studyMode: firstPresentValue(
          row?.study_mode,
          row?.mode,
          row?.modeOfStudy,
          row?.mode_of_study,
        ) ?? "",
        duration: firstPresentValue(row?.duration) ?? "",
        startDate: firstPresentValue(
          row?.start_date_or_month,
          row?.start_date,
          row?.intake,
        ) ?? "",
        location: firstPresentValue(
          row?.location,
          row?.campus,
          row?.campus_location,
        ) ?? "",
        courseUrl: firstPresentValue(
          row?.program_url,
          row?.programme_url,
          row?.url,
          row?.course_url,
          row?.courseUrl,
        ) ?? "",
        listingPage: firstPresentValue(
          row?.listing_page,
          row?.listingPage,
          row?.listing_page_url,
        ) ?? "",
        sourceUrl: firstPresentValue(
          row?.source_url,
          row?.sourceUrl,
          row?.source,
        ) ?? "",
      };
    });
  }

  const api = Object.freeze({
    getFinalRowsFromResponse,
    getUniversalDiagnostics,
    getUcasDiagnostics,
    hasUniversalDiagnostics,
    hasUcasSecurityPage,
    isUcasResponse,
    isUcasUrl,
    normalizeUcasRows,
  });

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.UniScrapeResponseParser = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
