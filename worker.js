/* ---------------------------------------------------------------
   UniScrape - Cloudflare Worker
   Acts as a CORS proxy. Fetches a university page server-side
   and returns the HTML to the browser.
   
   Deploy this at: workers.cloudflare.com
---------------------------------------------------------------- */

export default {
  async fetch(request, env, ctx) {

    // Handle preflight CORS requests from the browser
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    // Only allow GET requests
    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders() });
    }

    // Read the target URL from the query string: ?url=https://...
    const incoming = new URL(request.url);
    const target   = incoming.searchParams.get("url");

    if (!target) {
      return json({ error: "Missing ?url= parameter" }, 400);
    }

    // Basic validation - must be a real http/https URL
    let targetUrl;
    try {
      targetUrl = new URL(target);
      if (!["http:", "https:"].includes(targetUrl.protocol)) throw new Error();
    } catch {
      return json({ error: "Invalid URL" }, 400);
    }

    // Fetch the target page
    let response;
    try {
      response = await fetch(targetUrl.toString(), {
        headers: {
          // Mimic a normal browser request so universities don't block us
          "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
          "Accept-Encoding": "gzip, deflate, br",
        },
        redirect: "follow",
        // Cloudflare Workers timeout is 30s by default
      });
    } catch (e) {
      return json({ error: "Failed to fetch target URL: " + e.message }, 502);
    }

    if (!response.ok) {
      return json({ error: "Target site returned HTTP " + response.status }, 502);
    }

    // Read the body as text
    const html = await response.text();

    // Return the HTML wrapped in JSON so the browser can parse it easily
    return new Response(JSON.stringify({ contents: html }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(),
      },
    });
  },
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}
