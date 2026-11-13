"""The `media` namespace (Default Media Receiver behaviour): LOAD, PLAY,
PAUSE, SEEK, STOP and MEDIA_STATUS updates."""
from __future__ import annotations

import logging

from .proto import NS_MEDIA

log = logging.getLogger(__name__)

PLAYABLE = ("http://", "https://", "rtsp://", "rtmp://", "rtmps://", "udp://", "rtp://")
# PAUSE | SEEK | STREAM_VOLUME | STREAM_MUTE
SUPPORTED_COMMANDS = 1 | 2 | 4 | 8
IDLE_REASONS = {"eof": "FINISHED", "error": "ERROR"}


class MediaChannel:
    def __init__(self, server, player):
        self.server = server
        self.player = player
        self.media: dict | None = None
        self.url: str | None = None
        self.media_session_id = 0
        self._last: tuple | None = None

    def reset(self) -> None:
        self.media = self.url = None
        self._last = None

    def player_state(self) -> tuple[str, str | None]:
        snap = self.player.snapshot()
        if snap["url"] != self.url:
            return "IDLE", "CANCELLED" if snap["url"] is None else "INTERRUPTED"
        if snap["idle"]:
            return "IDLE", IDLE_REASONS.get(snap["end_reason"], "CANCELLED")
        if snap["buffering"]:
            return "BUFFERING", None
        return ("PAUSED" if snap["paused"] else "PLAYING"), None

    def entry(self) -> dict:
        snap = self.player.snapshot()
        state, reason = self.player_state()
        media = dict(self.media or {})
        if snap["duration"] and snap["url"] == self.url:
            media["duration"] = snap["duration"]
        entry = {
            "mediaSessionId": self.media_session_id, "playbackRate": 1,
            "playerState": state, "currentTime": snap["position"] if state != "IDLE" else 0,
            "supportedMediaCommands": SUPPORTED_COMMANDS,
            "volume": {"level": round(snap["volume"] / 100.0, 3), "muted": snap["muted"]},
            "media": media, "currentItemId": 1, "repeatMode": "REPEAT_OFF",
        }
        if reason:
            entry["idleReason"] = reason
        return entry

    def status(self, request_id: int = 0) -> dict:
        return {"type": "MEDIA_STATUS", "requestId": request_id,
                "status": [self.entry()] if self.media is not None else []}

    def _broadcast(self, request_id: int = 0) -> None:
        self.server.broadcast(self.server.receiver.transport_id, NS_MEDIA, self.status(request_id))

    def load(self, data: dict) -> bool:
        media = data.get("media") or {}
        url = str(media.get("contentUrl") or media.get("contentId") or "")
        if not url.lower().startswith(PLAYABLE):
            log.warning("cast LOAD with unplayable content id %r", url)
            return False
        receiver = self.server.receiver
        if not receiver.session_id:
            receiver.launch(receiver.app_id or "CC1AD845")
        self.media, self.url = media, url
        self.media_session_id += 1
        title = (media.get("metadata") or {}).get("title")
        start = float(data.get("currentTime") or 0)
        self.player.load(url, title, start, bool(data.get("autoplay", True)))
        return True

    def handle(self, conn, msg) -> None:
        data = msg.json()
        kind, rid = data.get("type"), data.get("requestId", 0)
        mine = self.url is not None and self.player.snapshot()["url"] == self.url
        if kind == "LOAD":
            if not self.load(data):
                self.server.reply(conn, msg, {"type": "LOAD_FAILED", "requestId": rid})
                return
        elif kind == "GET_STATUS":
            self.server.reply(conn, msg, self.status(rid))
            return
        elif kind in ("PLAY", "PAUSE", "STOP", "SEEK") and mine:
            if kind == "PLAY":
                self.player.play()
            elif kind == "PAUSE":
                self.player.pause()
            elif kind == "STOP":
                self.player.stop()
            else:
                if isinstance(data.get("currentTime"), (int, float)):
                    self.player.seek(data["currentTime"])
                if data.get("resumeState") == "PLAYBACK_START":
                    self.player.play()
                elif data.get("resumeState") == "PLAYBACK_PAUSE":
                    self.player.pause()
        elif kind in ("PLAY", "PAUSE", "STOP", "SEEK"):
            pass  # something else took over the screen; just report status
        elif kind == "SET_VOLUME":
            self.server.receiver.apply_volume(data.get("volume") or {})
        else:
            self.server.reply(conn, msg, {"type": "INVALID_REQUEST", "requestId": rid,
                                          "reason": "INVALID_COMMAND"})
            return
        self._last = None
        self._broadcast(rid)

    def on_player_change(self) -> None:
        if self.media is None:
            return
        state = self.player_state()
        if state != self._last:
            self._last = state
            self._broadcast()
