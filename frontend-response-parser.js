(function attachUniScrapeResponseParser(root) {
  const UCAS_PATH_PREFIXES = [
    "/explore/search/courses",
    "/explore/search/all",
    "/explore/courses/",
  ];

  function isUcasUrl(inputUrl) {
    try {
      const parsed = new URL(String(inputUrl || "").trim());
      const hostname = parsed.hostname.toLowerCase();
      const pathname = parsed.pathname.toLowerCase();

      return (
        (parsed.protocol === "https:" || parsed.protocol === "http:") &&
        (hostname === "ucas.com" || hostname === "www.ucas.com") &&
        UCAS_PATH_PREFIXES.some(prefix => pathname.startsWith(prefix))
      );
    } catch {
      return false;
    }
  }

  function responseSources(result) {
    return [
      result?.frontendDiagnostics,
      result?.diagnostics,
      result?.metadata,
      result?.responseMeta,
      result,
    ].filter(source => source && typeof source === "object");
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
      "phase",
      "rowsCollected",
      "rows_collected",
      "feePagesCompleted",
      "fee_pages_completed",
      "feePagesRemaining",
      "fee_pages_remaining",
      "rateLimited",
      "rate_limited",
      "waiting",
      "nextRetryAt",
      "next_retry_at",
      "estimatedRemainingTime",
      "estimated_remaining_time",
    ];

    return keys.reduce((diagnostics, key) => {
      const values = responseValues(result, key);
      let value = values[0];

      if (["ucasMode", "ucasDetected", "staticOnly", "partial", "securityPageDetected", "rateLimited", "rate_limited", "waiting"].includes(key)) {
        if (values.some(isTrue)) value = true;
      } else if (key === "ucasComplete" && values.some(item => item === false || String(item).toLowerCase() === "false")) {
        value = false;
      } else if (key === "blockedPageCount" && values.length) {
        value = Math.max(...values.map(item => Number(item) || 0));
      } else if (key === "blockedPageUrls" && values.length) {
        value = [...new Set(values.flatMap(item => Array.isArray(item) ? item : [item]).filter(Boolean))];
      }

      if (value !== undefined) diagnostics[key] = value;
      return diagnostics;
    }, {});
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
    getUcasDiagnostics,
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
