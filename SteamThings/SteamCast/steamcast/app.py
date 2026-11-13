"""Wires everything together and runs until the TV window is closed."""
from __future__ import annotations

import logging
import signal
import threading

from . import remote
from .airplay import AirPlay
from .config import Config, config_dir, device_id, load_config
from .mdns import Service, advertise
from .net import local_ip, mdns_hostname
from .player import Player
from .web import Router, WebServer

log = logging.getLogger("steamcast")


class App:
    def __init__(self, cfg: Config):
        self.cfg = cfg
        self.name = cfg.display_name
        self.ip = local_ip()
        self.device_id = device_id(config_dir())
        self.stopping = threading.Event()
        self.parts: list = []  # started components, stopped in reverse order
        self.services: list[str] = []

    def idle_text(self) -> str:
        enabled = [n for n, on in (("Google Cast", self.cfg.googlecast), ("DLNA", self.cfg.dlna),
                                   ("AirPlay", self.cfg.airplay)) if on]
        return (f"{self.name}\n\nReady: {' · '.join(enabled)}\n"
                f"Remote: http://{self.ip}:{self.cfg.http_port}/")

    def _try(self, label: str, fn) -> None:
        try:
            fn()
        except Exception as exc:
            log.error("%s unavailable: %s", label, exc)

    def start(self) -> None:
        cfg = self.cfg
        self.player = Player(cfg, self.idle_text())
        self.player.start()
        router = Router()
        mdns_services: list[Service] = []

        if cfg.dlna:
            self._try("DLNA", lambda: self._start_dlna(router))
        if cfg.googlecast:
            self._try("Google Cast", lambda: self._start_cast(mdns_services))
        remote.register(router, self.player, self.name, self.services)
        web = WebServer(cfg.http_port, router)
        web.start()
        self.parts.append(web)
        if mdns_services:
            self._try("mDNS", lambda: self.parts.append(advertise(
                cfg.mdns, mdns_hostname(self.device_id), self.ip, mdns_services)))
        if cfg.airplay:
            airplay = AirPlay(cfg, self.name, self.player)
            if airplay.start():
                self.parts.append(airplay)
                self.services.append("AirPlay")
        log.info("%s ready on %s (%s); remote page http://%s:%d/", self.name, self.ip,
                 ", ".join(self.services) or "remote page only", self.ip, cfg.http_port)

    def _start_dlna(self, router: Router) -> None:
        from .dlna import DEVICE_TYPE, DlnaRenderer
        from .dlna_scpd import SERVICES, service_type
        from .ssdp import SsdpServer
        udn = f"uuid:{self.device_id[:8]}-{self.device_id[8:12]}-{self.device_id[12:16]}-" \
              f"{self.device_id[16:20]}-{self.device_id[20:]}"
        DlnaRenderer(self.player, self.name, udn).register(router)
        location = f"http://{self.ip}:{self.cfg.http_port}/dlna/description.xml"
        ssdp = SsdpServer(self.ip, location, udn, DEVICE_TYPE, [service_type(s) for s in SERVICES])
        ssdp.start()
        self.parts.append(ssdp)
        self.services.append("DLNA")

    def _start_cast(self, mdns_services: list[Service]) -> None:
        from .cast import CAST_SERVICE, CastServer, ensure_certificate, txt_record
        cert = ensure_certificate(config_dir(), f"SteamCast-{self.device_id}")
        if not cert:
            raise RuntimeError("no TLS certificate")
        server = CastServer(self.player, self.name, *cert, port=self.cfg.cast_port)
        server.start()
        self.parts.append(server)
        mdns_services.append(Service(f"SteamCast-{self.device_id}", CAST_SERVICE, server.port,
                                     txt_record(self.device_id, self.name)))
        self.services.append("Google Cast")

    def run(self) -> int:
        for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
            signal.signal(sig, lambda *_: self.stopping.set())
        try:
            self.start()
        except Exception as exc:
            log.error("%s", exc)
            self.stop()
            return 1
        # Closing the player window (or "Exit game" in Steam) ends the app.
        while not self.stopping.wait(0.5):
            if not self.player.running():
                break
        self.stop()
        return 0

    def stop(self) -> None:
        for part in reversed(self.parts):
            try:
                part.stop()
            except Exception:
                log.exception("error while stopping %s", type(part).__name__)
        player = getattr(self, "player", None)
        if player:
            player.close()


def main(argv: list[str] | None = None) -> int:
    cfg = load_config(argv)
    logging.basicConfig(level=getattr(logging, cfg.log_level.upper(), logging.INFO),
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    return App(cfg).run()
