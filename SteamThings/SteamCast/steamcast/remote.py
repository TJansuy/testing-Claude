"""Phone-friendly remote page and JSON API: open http://<deck>:8090/ and paste
any link mpv can play. Works for devices with no Cast / AirPlay / DLNA app."""
from __future__ import annotations

import json
from importlib import resources

from .web import Request, Response, Router, text


def _json(data, status: int = 200) -> Response:
    return status, {"Content-Type": "application/json"}, json.dumps(data).encode()


def _body(req: Request) -> dict:
    try:
        data = json.loads(req.body or b"{}")
    except ValueError:
        return {}
    return data if isinstance(data, dict) else {}


def register(router: Router, player, name: str, services: list[str], extra=dict) -> None:
    page = resources.files(__package__).joinpath("remote.html").read_text()
    page = page.replace("{{NAME}}", name.replace("<", "&lt;"))

    def status(_req: Request) -> Response:
        return _json({"name": name, "services": services, **player.snapshot(),
                      "video": player.video_info(), **extra()})

    def play(req: Request) -> Response:
        data = _body(req)
        url = str(data.get("url") or "").strip()
        if not url:
            return _json({"error": "url is required"}, 400)
        player.load(url, data.get("title") or None)
        return status(req)

    def simple(action):
        def handler(req: Request) -> Response:
            action(_body(req))
            return status(req)
        return handler

    router.add("GET", "/", lambda _r: text(200, page, "text/html; charset=utf-8"))
    router.add("GET", "/api/status", status)
    router.add("POST", "/api/play", play)
    router.add("POST", "/api/pause", simple(lambda _d: player.pause()))
    router.add("POST", "/api/resume", simple(lambda _d: player.play()))
    router.add("POST", "/api/stop", simple(lambda _d: player.stop()))
    router.add("POST", "/api/seek", simple(lambda d: player.seek(float(d.get("position", 0)))))
    router.add("POST", "/api/volume", simple(lambda d: player.set_volume(float(d.get("level", 100)))))
