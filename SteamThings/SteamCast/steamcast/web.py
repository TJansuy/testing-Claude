"""A tiny threaded HTTP server with exact-path routing, shared by DLNA and
the phone remote page."""
from __future__ import annotations

import logging
import threading
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Callable
from urllib.parse import urlsplit

log = logging.getLogger(__name__)


@dataclass
class Request:
    method: str
    path: str
    query: str
    headers: dict[str, str]
    body: bytes
    client: str


Response = tuple[int, dict[str, str], bytes]
Handler = Callable[[Request], Response]


def text(status: int, body: str, ctype: str = "text/plain; charset=utf-8") -> Response:
    return status, {"Content-Type": ctype}, body.encode()


class Router:
    def __init__(self):
        self.routes: dict[tuple[str, str], Handler] = {}

    def add(self, method: str, path: str, fn: Handler) -> None:
        self.routes[(method.upper(), path)] = fn

    def dispatch(self, req: Request) -> Response:
        fn = self.routes.get((req.method, req.path))
        if fn is None:
            if any(path == req.path for _m, path in self.routes):
                return text(405, "method not allowed")
            return text(404, "not found")
        try:
            return fn(req)
        except Exception:
            log.exception("%s %s failed", req.method, req.path)
            return text(500, "internal error")


def _make_handler(router: Router):
    class RequestHandler(BaseHTTPRequestHandler):
        server_version = "SteamCast/1.0"
        protocol_version = "HTTP/1.1"

        def _handle(self) -> None:
            length = int(self.headers.get("Content-Length") or 0)
            body = self.rfile.read(length) if length > 0 else b""
            parts = urlsplit(self.path)
            req = Request(self.command, parts.path, parts.query,
                          {k.lower(): v for k, v in self.headers.items()},
                          body, self.client_address[0])
            status, headers, payload = router.dispatch(req)
            self.send_response(status)
            for key, value in headers.items():
                self.send_header(key, value)
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(payload)

        do_GET = do_POST = do_HEAD = do_SUBSCRIBE = do_UNSUBSCRIBE = _handle

        def log_message(self, fmt, *args) -> None:
            log.debug("http %s " + fmt, self.client_address[0], *args)

    return RequestHandler


class WebServer:
    def __init__(self, port: int, router: Router):
        self.httpd = ThreadingHTTPServer(("", port), _make_handler(router))
        self.httpd.daemon_threads = True
        self.port = self.httpd.server_address[1]

    def start(self) -> None:
        threading.Thread(target=self.httpd.serve_forever, name="http", daemon=True).start()

    def stop(self) -> None:
        self.httpd.shutdown()
        self.httpd.server_close()
