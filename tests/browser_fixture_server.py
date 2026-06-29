import json
import mimetypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]
ORIGIN = "http://127.0.0.1:8767"
LAST_REQUEST_PATH = ROOT / "tests" / ".browser-fixture-last-request.json"
UCAS_JOBS = {}


def response_for(payload):
    source_url = str(payload.get("url") or "")
    meta = {
        "backendPatch": "fixture_backend_patch_v1",
        "routeName": "crawl",
    }

    if "ucas.com" in source_url:
        security_blocked = "security-fixture" in source_url
        return {
            "catalogRows": [{
                "program_name": "Fixture UCAS Course",
                "provider_name": "Fixture UCAS University",
                "ucas_tariff_raw": 0,
                "preferred_fee_raw": "£9,535",
                "fee_status": "fee_found",
                "qualification": "BSc (Hons)",
                "study_mode": "Full-time",
                "duration": "3 years",
                "start_date_or_month": "September 2026",
                "campus": "Main Campus",
                "program_url": "https://www.ucas.com/explore/courses/FIXTURE1",
            }],
            "diagnostics": {
                "ucasMode": True,
                "ucasDetected": True,
                "staticOnly": True,
                "llmUsed": False,
                "playwrightUsed": False,
                "rowsOutput": 1,
                "ucasComplete": not security_blocked,
                "partial": security_blocked,
                "securityPageDetected": security_blocked,
                "blockedPageCount": 1 if security_blocked else 0,
                "blockedPageUrls": [source_url] if security_blocked else [],
                "blockedPageType": "cloudflare_challenge" if security_blocked else "",
                "paginationStoppedReason": "security_page_detected" if security_blocked else "completed",
            },
            "responseMeta": {**meta, "rowCount": 1},
        }

    if "catalog" in source_url:
        return {
            "catalogRows": [{
                "courseName": "Catalog A",
                "universityName": "Fixture University",
                "courseUrl": "https://fixture.test/catalog-a",
            }],
            "responseMeta": {**meta, "rowCount": 1},
        }

    if "programs-fallback" in source_url:
        return {
            "programs": [{
                "name": "Fallback Audit A",
                "url": "https://fixture.test/fallback-a",
            }],
            "responseMeta": {**meta, "rowCount": 1},
        }

    if "candidates-only" in source_url:
        return {
            "programmeCandidates": [{"title": "Candidate A"}],
            "responseMeta": {**meta, "rowCount": 0},
        }

    if "metadata-mismatch" in source_url:
        return {
            "responseMeta": {**meta, "rowCount": 1},
        }

    return {
        "programmes": [{
            "name": "Audit A",
            "url": "https://fixture.test/audit-a",
        }],
        "responseMeta": {**meta, "rowCount": 1},
    }


class FixtureHandler(BaseHTTPRequestHandler):
    def log_message(self, _format, *_args):
        return

    def send_bytes(self, status, content, content_type):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def send_json(self, status, data):
        content = json.dumps(data).encode("utf-8")
        self.send_bytes(status, content, "application/json")

    def do_GET(self):
        path = urlparse(self.path).path

        if path == "/auth/status":
            self.send_json(200, {
                "status": "approved",
                "email": "fixture@uniscrape.test",
                "name": "Fixture User",
                "is_admin": False,
            })
            return

        if path.startswith("/ucas/jobs/"):
            parts = path.strip("/").split("/")
            job_id = parts[2] if len(parts) >= 3 else ""
            job = UCAS_JOBS.get(job_id)
            if not job:
                self.send_json(404, {"detail": "Job not found"})
                return

            if len(parts) == 4 and parts[3] == "results":
                self.send_json(200, response_for(job["payload"]))
                return

            job["polls"] += 1
            source_url = str(job["payload"].get("url") or "")
            multi_retry = "multi-retry-fixture" in source_url
            if multi_retry and job["polls"] == 1:
                status = "rate_limited"
                waiting = True
                phase = "UCAS rate-limit detected on listing page 2"
                next_retry_at = "2026-06-25T12:00:00Z"
                attempt_count = 1
            elif multi_retry and job["polls"] == 2:
                status = "failed"
                waiting = True
                phase = "Retry attempt failed - waiting before retry"
                next_retry_at = "2026-06-25T12:05:00Z"
                attempt_count = 2
            else:
                waiting = "rate-limit-fixture" in source_url and job["polls"] == 1
                status = "rate_limited" if waiting else "complete"
                phase = "UCAS rate-limit detected - waiting before retry" if waiting else "Preparing UCAS catalog"
                next_retry_at = "2026-06-25T12:00:00Z" if waiting else ""
                attempt_count = 1 if waiting else 0
            self.send_json(200, {
                "job_id": job_id,
                "status": status,
                "phase": phase,
                "waiting": waiting,
                "ucasRateLimited": waiting,
                "expectedResultCount": 44 if multi_retry else 1,
                "rowsCollected": 24 if multi_retry and waiting else 1,
                "listingPagesFetched": 1,
                "currentListingPage": 2 if waiting else "",
                "nextListingUrl": "https://www.ucas.com/explore/search/courses?page=2" if waiting else "",
                "rateLimitAttemptCount": attempt_count or "",
                "feePagesCompleted": 1 if not waiting else 0,
                "feePagesRemaining": 0 if not waiting else 1,
                "feeQueueLength": 1 if waiting else 0,
                "feeDetailsAttempted": 0 if waiting else 1,
                "feeCompletedCount": 0 if waiting else 1,
                "nextRetryAt": next_retry_at,
                "catalogRows": response_for(job["payload"])["catalogRows"],
            })
            return

        relative_path = "index.html" if path == "/" else path.lstrip("/")
        file_path = (ROOT / relative_path).resolve()

        if ROOT not in file_path.parents and file_path != ROOT:
            self.send_json(404, {"detail": "Not found"})
            return

        if not file_path.is_file():
            self.send_json(404, {"detail": "Not found"})
            return

        content = file_path.read_bytes()
        content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"

        if relative_path == "index.html":
            html = content.decode("utf-8")
            bootstrap = (
                "<script>"
                "localStorage.setItem('uniscrape_session_token','fixture-token');"
                "localStorage.setItem('uniscrape_display_name','Fixture User');"
                "</script>"
            )
            content = html.replace("</head>", bootstrap + "</head>").encode("utf-8")

        if relative_path == "app.js":
            script = content.decode("utf-8")
            content = script.replace("https://api.uniscrape.com", ORIGIN).encode("utf-8")

        self.send_bytes(200, content, content_type)

    def do_POST(self):
        path = urlparse(self.path).path
        length = int(self.headers.get("Content-Length") or 0)
        payload = json.loads(self.rfile.read(length) or b"{}")

        if path == "/ucas/jobs":
            job_id = f"fixture-ucas-job-{len(UCAS_JOBS) + 1}"
            UCAS_JOBS[job_id] = {"payload": payload, "polls": 0}
            LAST_REQUEST_PATH.write_text(json.dumps({
                "path": path,
                "payload": payload,
                "hasAuthorization": bool(self.headers.get("Authorization")),
            }), encoding="utf-8")
            self.send_json(200, {
                "job_id": job_id,
                "status": "queued",
                "phase": "Starting UCAS static extraction",
            })
            return

        if path.startswith("/ucas/jobs/") and path.endswith("/cancel"):
            parts = path.strip("/").split("/")
            job_id = parts[2] if len(parts) >= 3 else ""
            if job_id not in UCAS_JOBS:
                self.send_json(404, {"detail": "Job not found"})
                return
            self.send_json(200, {"job_id": job_id, "status": "cancelled"})
            return

        if path == "/crawl":
            LAST_REQUEST_PATH.write_text(json.dumps({
                "path": path,
                "payload": payload,
                "hasAuthorization": bool(self.headers.get("Authorization")),
            }), encoding="utf-8")
            self.send_json(200, response_for(payload))
            return

        self.send_json(404, {"detail": "Not found"})


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 8767), FixtureHandler).serve_forever()
