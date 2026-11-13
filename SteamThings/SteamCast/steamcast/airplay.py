"""AirPlay: supervises UxPlay (an open-source AirPlay mirroring / audio
server built on GStreamer), which advertises itself through avahi."""
from __future__ import annotations

import logging
import shlex
import shutil
import subprocess
import threading
import time

from .config import Config

log = logging.getLogger(__name__)

DISTROBOX_CONTAINER = "steamcast-airplay"


def find_uxplay(cfg: Config) -> list[str] | None:
    if cfg.uxplay_command:
        return shlex.split(cfg.uxplay_command)
    if shutil.which("uxplay"):
        return ["uxplay"]
    # install.sh --with-airplay puts UxPlay in a distrobox container, because
    # SteamOS's root filesystem is read-only.
    if shutil.which("distrobox"):
        result = subprocess.run(["distrobox", "list", "--no-color"], capture_output=True, text=True)
        if DISTROBOX_CONTAINER in result.stdout:
            return ["distrobox", "enter", DISTROBOX_CONTAINER, "--", "uxplay"]
    return None


class AirPlay:
    def __init__(self, cfg: Config, name: str, player):
        self.cfg = cfg
        self.name = name
        self.player = player
        self.command = find_uxplay(cfg)
        self.proc: subprocess.Popen | None = None
        self._stop = threading.Event()

    def start(self) -> bool:
        if not self.command:
            log.warning("AirPlay disabled: UxPlay not found (run install.sh --with-airplay)")
            return False
        threading.Thread(target=self._supervise, name="airplay", daemon=True).start()
        return True

    def args(self) -> list[str]:
        return self.command + ["-n", self.name, "-nh", *shlex.split(self.cfg.uxplay_args)]

    def _supervise(self) -> None:
        delay, failures = 2.0, 0
        while not self._stop.is_set():
            started = time.monotonic()
            log.info("AirPlay: starting %s", shlex.join(self.args()))
            try:
                self.proc = subprocess.Popen(self.args(), stdout=subprocess.PIPE,
                                             stderr=subprocess.STDOUT, text=True, bufsize=1)
            except OSError as exc:
                log.error("AirPlay: cannot start UxPlay: %s", exc)
                return
            for line in self.proc.stdout:
                self._on_line(line.rstrip())
            self.proc.wait()
            if self._stop.is_set():
                return
            failures = failures + 1 if time.monotonic() - started < 30 else 0
            if failures >= 5:
                log.error("AirPlay: UxPlay keeps exiting; giving up (see log above)")
                return
            log.warning("AirPlay: UxPlay exited (%s); restarting", self.proc.returncode)
            self._stop.wait(delay * (failures + 1))

    def _on_line(self, line: str) -> None:
        log.debug("uxplay: %s", line)
        lowered = line.lower()
        if "accepted ipv" in lowered or "connection request from" in lowered:
            # An Apple device connected: pause whatever mpv is showing so the
            # mirror (its own window) and its audio aren't fighting it.
            log.info("AirPlay: client connected")
            self.player.pause()

    def stop(self) -> None:
        self._stop.set()
        if self.proc and self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.proc.kill()
