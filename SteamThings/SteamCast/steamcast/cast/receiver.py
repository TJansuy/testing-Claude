"""The `receiver` namespace: app sessions and device volume."""
from __future__ import annotations

import uuid

from .proto import NS_MEDIA, NS_RECEIVER

DEFAULT_MEDIA_RECEIVER = "CC1AD845"
RECEIVER_ID = "receiver-0"


class Receiver:
    def __init__(self, server, player, name: str):
        self.server = server
        self.player = player
        self.name = name
        self.app_id: str | None = None
        self.session_id: str | None = None
        self._last_volume: tuple | None = None

    @property
    def transport_id(self) -> str:
        return self.session_id or RECEIVER_ID

    def launch(self, app_id: str) -> None:
        # Every app id is "launched" as a media player: senders whose receiver
        # app speaks the standard media namespace (most video apps) then work.
        self.app_id = app_id
        self.session_id = str(uuid.uuid4())
        self.server.media.reset()

    def volume(self) -> dict:
        snap = self.player.snapshot()
        return {"controlType": "attenuation", "level": round(snap["volume"] / 100.0, 3),
                "muted": snap["muted"], "stepInterval": 0.05}

    def status(self, request_id: int = 0) -> dict:
        apps = []
        if self.session_id:
            apps.append({
                "appId": self.app_id, "appType": "WEB", "universalAppId": self.app_id,
                "displayName": "Default Media Receiver"
                if self.app_id == DEFAULT_MEDIA_RECEIVER else "SteamCast Player",
                "iconUrl": "", "isIdleScreen": False, "launchedFromCloud": False,
                "namespaces": [{"name": NS_MEDIA}], "sessionId": self.session_id,
                "statusText": f"Casting to {self.name}", "transportId": self.session_id,
            })
        return {"type": "RECEIVER_STATUS", "requestId": request_id,
                "status": {"applications": apps, "volume": self.volume(),
                           "isActiveInput": True, "isStandBy": False}}

    def apply_volume(self, volume: dict) -> None:
        if isinstance(volume.get("level"), (int, float)):
            self.player.set_volume(float(volume["level"]) * 100.0)
        if isinstance(volume.get("muted"), bool):
            self.player.set_muted(volume["muted"])

    def handle(self, conn, msg) -> None:
        data = msg.json()
        kind, rid = data.get("type"), data.get("requestId", 0)
        if kind == "GET_STATUS":
            self.server.reply(conn, msg, self.status(rid))
        elif kind == "LAUNCH":
            self.launch(str(data.get("appId") or DEFAULT_MEDIA_RECEIVER))
            self.server.broadcast(RECEIVER_ID, NS_RECEIVER, self.status(rid))
        elif kind == "STOP":
            if self.session_id and data.get("sessionId") in (None, self.session_id):
                self.session_id = self.app_id = None
                if self.server.media.url and self.player.snapshot()["url"] == self.server.media.url:
                    self.player.stop()
                self.server.media.reset()
            self.server.broadcast(RECEIVER_ID, NS_RECEIVER, self.status(rid))
        elif kind == "SET_VOLUME":
            self.apply_volume(data.get("volume") or {})
            self.server.reply(conn, msg, self.status(rid))
        elif kind == "GET_APP_AVAILABILITY":
            apps = data.get("appId") or []
            self.server.reply(conn, msg, {
                "requestId": rid, "responseType": "GET_APP_AVAILABILITY",
                "availability": {a: "APP_AVAILABLE" for a in apps}})
        else:
            self.server.reply(conn, msg, {"type": "INVALID_REQUEST", "requestId": rid,
                                          "reason": "INVALID_COMMAND"})

    def on_player_change(self) -> None:
        vol = self.volume()
        key = (vol["level"], vol["muted"])
        if key != self._last_volume:
            self._last_volume = key
            self.server.broadcast(RECEIVER_ID, NS_RECEIVER, self.status())
