"""YouTube casting: runs youtube/receiver.mjs (yt-cast-receiver on Node) and
connects it to the player.

The YouTube app finds the receiver with DIAL, then phone and receiver talk
through YouTube's servers. The sidecar sends commands (play a video id,
pause, seek...) as JSON lines; this side replies with mpv's state.
"""
from __future__ import annotations

import json
import logging
import os
import shlex
import shutil
import subprocess
import threading
from pathlib import Path

from .config import Config, config_dir

log = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent.parent
SIDECAR = ROOT / "youtube" / "receiver.mjs"
BUNDLED_NODE = Path(os.path.expanduser("~/.local/share/steamcast/node/bin/node"))
WATCH_URL = "https://www.youtube.com/watch?v="


def find_node(cfg: Config) -> list[str] | None:
    if cfg.node_command:
        return shlex.split(cfg.node_command)
    if BUNDLED_NODE.is_file():
        return [str(BUNDLED_NODE)]
    node = shutil.which("node")
    return [node] if node else None


class YouTubeReceiver:
    def __init__(self, cfg: Config, name: str, player, on_code=None):
        self.cfg = cfg
        self.name = name
        self.player = player
        self.on_code = on_code or (lambda code: None)
        self.node = find_node(cfg)
        self.proc: subprocess.Popen | None = None
        self.url: str | None = None  # the video this receiver started
        self.code: str | None = None  # "Link with TV code"
        self._ended_sent = False
        self._lock = threading.Lock()
        self._stop = threading.Event()

    def problem(self) -> str | None:
        if not self.node:
            return "Node.js not found (run install.sh)"
        if not (SIDECAR.parent / "node_modules" / "yt-cast-receiver").is_dir():
            return f"dependencies missing: run 'npm ci' in {SIDECAR.parent} (install.sh does this)"
        return None

    def start(self) -> bool:
        problem = self.problem()
        if problem:
            log.warning("YouTube disabled: %s", problem)
            return False
        self.player.add_listener(self._on_player)
        threading.Thread(target=self._supervise, name="youtube", daemon=True).start()
        threading.Thread(target=self._ticker, name="youtube-state", daemon=True).start()
        return True

    # --- sidecar process -------------------------------------------------
    def _supervise(self) -> None:
        env = dict(os.environ, STEAMCAST_NAME=self.name,
                   STEAMCAST_DIAL_PORT=str(self.cfg.youtube_port),
                   STEAMCAST_DATA=str(config_dir() / "youtube-pairing.json"),
                   STEAMCAST_LOG_LEVEL="debug" if self.cfg.log_level == "DEBUG" else "warn")
        delay = 5.0
        while not self._stop.is_set():
            config_dir().mkdir(parents=True, exist_ok=True)
            self.proc = subprocess.Popen(
                self.node + [str(SIDECAR)], cwd=SIDECAR.parent, env=env, text=True, bufsize=1,
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            threading.Thread(target=self._log_stderr, args=(self.proc,), daemon=True).start()
            for line in self.proc.stdout:
                try:
                    self._handle(json.loads(line))
                except ValueError:
                    log.debug("youtube: %s", line.rstrip())
            self.proc.wait()
            if self._stop.is_set():
                return
            # Usually no internet yet (Wi-Fi still connecting); keep trying.
            log.warning("YouTube receiver exited (%s); retrying in %.0fs",
                        self.proc.returncode, delay)
            self._stop.wait(delay)
            delay = min(delay * 2, 120.0)

    @staticmethod
    def _log_stderr(proc: subprocess.Popen) -> None:
        for line in proc.stderr:
            log.debug("youtube: %s", line.rstrip())

    def _send(self, msg: dict) -> None:
        proc = self.proc
        if not proc or proc.poll() is not None:
            return
        with self._lock:
            try:
                proc.stdin.write(json.dumps(msg) + "\n")
                proc.stdin.flush()
            except (OSError, ValueError):
                pass

    # --- commands from YouTube ---------------------------------------------
    def _mine(self) -> bool:
        return self.url is not None and self.player.snapshot()["url"] == self.url

    def _handle(self, msg: dict) -> None:
        cmd, event = msg.get("cmd"), msg.get("event")
        if cmd == "play":
            self.url = WATCH_URL + str(msg.get("id", ""))
            self._ended_sent = False
            self.player.load(self.url, None, float(msg.get("position") or 0))
        elif cmd in ("pause", "resume", "stop", "seek") and self._mine():
            if cmd == "pause":
                self.player.pause()
            elif cmd == "resume":
                self.player.play()
            elif cmd == "stop":
                self.url = None
                self.player.stop()
            else:
                self.player.seek(float(msg.get("position") or 0))
        elif cmd == "volume":
            self.player.set_volume(float(msg.get("level", 100)))
            self.player.set_muted(bool(msg.get("muted")))
        elif event == "ready":
            log.info("YouTube: ready (DIAL on port %s)", msg.get("port"))
        elif event == "pairing":
            self.code = str(msg.get("code"))
            self.on_code(self.code)
        elif event == "connected":
            log.info("YouTube: %s connected", msg.get("name"))
            self.player.show_message(f"YouTube: {msg.get('name')} connected")
        elif event == "disconnected":
            log.info("YouTube: %s disconnected", msg.get("name"))
        elif event == "error":
            log.warning("YouTube: %s", msg.get("message"))

    # --- state back to YouTube ---------------------------------------------
    def state(self) -> dict:
        s = self.player.snapshot()
        return {"position": s["position"], "duration": s["duration"], "volume": round(s["volume"]),
                "muted": s["muted"], "paused": s["paused"], "idle": s["idle"], "mine": self._mine()}

    def _on_player(self) -> None:
        if self.url is None:
            return
        snap = self.player.snapshot()
        if snap["url"] != self.url:
            # Something else (Cast, DLNA, AirPlay, the remote page) took over.
            self.url = None
            self._send({"event": "interrupted"})
        elif snap["idle"] and snap["end_reason"] == "eof" and not self._ended_sent:
            self._ended_sent = True
            self._send({"event": "ended"})
        else:
            self._send({"state": self.state()})

    def _ticker(self) -> None:
        while not self._stop.wait(1.0):
            if self.url is not None:
                self._send({"state": self.state()})

    def stop(self) -> None:
        self._stop.set()
        if self.proc and self.proc.poll() is None:
            try:
                self.proc.stdin.close()  # the sidecar leaves YouTube's lounge on EOF
                self.proc.wait(timeout=5)
            except (OSError, subprocess.TimeoutExpired):
                self.proc.terminate()
