from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import urllib.error
import urllib.parse
import urllib.request
import webbrowser


APP_DIR = Path(__file__).resolve().parent
HOST = "127.0.0.1"
PORT = 8765
ENDPOINT = "http://cdds.corp.ukrail.net/WEBQUERY/WEBQUERY"
USERNAME = "excelreport"
WORKBOOK = "ascii_data_pump"
DATASETS = {
    "elrs": ("elrs", ()),
    "tracks": ("tids", ("elr",)),
    "dates": ("dates", ("elr", "track", "startYardage", "endYardage")),
    "data": ("ascii_data_pump_qry", ("elr", "track", "startYardage", "endYardage", "date")),
}
def upstream_url(dataset, params):
    worksheet, required = DATASETS[dataset]
    missing = [name for name in required if name not in params or str(params[name]).strip() == ""]
    if missing:
        raise ValueError("Missing required parameter(s): " + ", ".join(missing))

    query = [("username", USERNAME), ("wb", WORKBOOK), ("ws", worksheet)]
    for index, field in enumerate(required):
        query.append((f"p{index}", str(params[field]).strip()))
    return ENDPOINT + "?" + urllib.parse.urlencode(query)


class Handler(BaseHTTPRequestHandler):
    server_version = "AsciiDataPump/1.0"

    def valid_host(self):
        return self.headers.get("Host", "").lower() in {
            f"{HOST}:{PORT}".lower(),
            HOST.lower(),
        }

    def send_bytes(self, status, content_type, body):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, status, value):
        body = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_bytes(status, "application/json; charset=utf-8", body)

    def do_GET(self):
        if not self.valid_host():
            self.send_json(400, {"error": "Requests must use the local app address."})
            return
        path = urllib.parse.urlsplit(self.path).path
        if path == "/api/health":
            self.send_json(200, {"ok": True, "upstream": ENDPOINT})
            return

        files = {
            "/": ("ascii_data_pump.html", "text/html; charset=utf-8"),
            "/index.html": ("ascii_data_pump.html", "text/html; charset=utf-8"),
            "/ascii_data_pump_core.mjs": ("ascii_data_pump_core.mjs", "text/javascript; charset=utf-8"),
        }
        if path not in files:
            self.send_json(404, {"error": "Not found."})
            return
        filename, content_type = files[path]
        try:
            body = (APP_DIR / filename).read_bytes()
        except OSError as error:
            self.send_json(500, {"error": f"Could not read app file {filename}: {error}"})
            return
        self.send_bytes(200, content_type, body)

    def do_POST(self):
        if not self.valid_host():
            self.send_json(400, {"error": "Requests must use the local app address."})
            return
        if urllib.parse.urlsplit(self.path).path != "/api/query":
            self.send_json(404, {"error": "Not found."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 2 or length > 16384:
                raise ValueError("Request body is missing or too large.")
            request_data = json.loads(self.rfile.read(length).decode("utf-8"))
            dataset = request_data.get("dataset")
            if dataset not in DATASETS:
                raise ValueError("Unknown query dataset.")
            params = request_data.get("params", {})
            if not isinstance(params, dict):
                raise ValueError("Query parameters must be an object.")
            url = upstream_url(dataset, params)
            request = urllib.request.Request(
                url,
                headers={
                    "Accept": "text/html,application/json,*/*",
                    "User-Agent": "ASCII-Data-Pump/1.0",
                },
            )
            try:
                with urllib.request.urlopen(request, timeout=60) as response:
                    body = response.read(64 * 1024 * 1024 + 1)
                    if len(body) > 64 * 1024 * 1024:
                        raise ValueError("The upstream response exceeds the 64 MB safety limit.")
                    charset = response.headers.get_content_charset() or "utf-8"
                    text = body.decode(charset, errors="replace")
                    self.send_json(200, {
                        "body": text,
                        "contentType": response.headers.get("Content-Type", ""),
                    })
            except urllib.error.HTTPError as error:
                detail = error.read(1000).decode("utf-8", errors="replace").strip()
                self.send_json(502, {
                    "error": f"Internal data service returned HTTP {error.code} {error.reason}.",
                    "detail": detail,
                })
            except (urllib.error.URLError, TimeoutError, OSError) as error:
                reason = getattr(error, "reason", error)
                self.send_json(502, {
                    "error": "Could not reach the internal data service. Connect to the Rail network or VPN and retry.",
                    "detail": str(reason),
                })
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
            self.send_json(400, {"error": str(error)})
        except Exception as error:
            self.send_json(500, {"error": f"Unexpected query failure: {error}"})

    def log_message(self, format_string, *args):
        print(f"[{self.log_date_time_string()}] {format_string % args}")


def main():
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    url = f"http://{HOST}:{PORT}/"
    print(f"ASCII Data Pump is running at {url}")
    print("Keep this window open while using the app. Close it to stop the local server.")
    webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping ASCII Data Pump.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
