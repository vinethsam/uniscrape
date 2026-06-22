(function attachUniScrapeResponseParser(root) {
  function getFinalRowsFromResponse(result, mode) {
    const catalogRows = Array.isArray(result?.catalogRows) ? result.catalogRows : [];
    const programmes = Array.isArray(result?.programmes) ? result.programmes : [];
    const programs = Array.isArray(result?.programs) ? result.programs : [];

    if (mode === "catalog") {
      return catalogRows;
    }

    if (mode === "audit") {
      return programmes.length ? programmes : programs;
    }

    return catalogRows.length ? catalogRows : programmes.length ? programmes : programs;
  }

  const api = Object.freeze({ getFinalRowsFromResponse });

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.UniScrapeResponseParser = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
