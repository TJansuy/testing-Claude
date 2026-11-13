"""The TV side: one long-lived, fullscreen mpv window driven over JSON IPC.

mpv does the heavy lifting for the surround system: it decodes 5.1 / 7.1
tracks and opens the HDMI output with as many channels as the receiver
reports, or bitstreams AC-3 / E-AC-3 / DTS / TrueHD untouched when
`passthrough` is set.
"""
from __future__ import annotations

import json
import logging
import os
import shlex
import shutil
import socket
import subprocess
import threading
import time
from typing import Callable

from .config import Config, runtime_dir
from .mpv_options import mpv_args

log = logging.getLogger(__name__)

OBSERVED = ("time-pos", "duration", "pause", "volume", "mute", "idle-active",
            "media-title", "paused-for-cache", "hwdec-current", "video-codec",
            "width", "height", "container-fps", "frame-drop-count",
            "decoder-frame-drop-count")


def find_mpv(cfg: Config, ipc_dir: str, extra_dirs: tuple[str, ...] = ()) -> list[str] | None:
    """mpv from the config, from PATH, or the Flathub build (the usual way on SteamOS)."""
    if cfg.mpv_command:
        return shlex.split(cfg.mpv_command)
    if shutil.which("mpv"):
        return ["mpv"]
    if shutil.which("flatpak"):
        found = subprocess.run(["flatpak", "info", "io.mpv.Mpv"],
                               capture_output=True).returncode == 0
        if found:
            xdg_run = os.environ.get("XDG_RUNTIME_DIR", "")
            share = ipc_dir
            if xdg_run and ipc_dir.startswith(xdg_run + "/"):
                share = "xdg-run/" + ipc_dir[len(xdg_run) + 1:]
            shares = [f"--filesystem={share}"] + [f"--filesystem={d}:ro" for d in extra_dirs]
            return ["flatpak", "run", *shares, "io.mpv.Mpv"]
    return None


class Player:
    def __init__(self, cfg: Config, idle_text: str = "", ytdl_path: str | None = None):
        self.cfg = cfg
        self.idle_text = idle_text
        self.ytdl_path = ytdl_path
        self.ipc_dir = str(runtime_dir())
        self.sock_path = os.path.join(self.ipc_dir, "mpv.sock")
        extra = (os.path.dirname(ytdl_path),) if ytdl_path else ()
        self.command = find_mpv(cfg, self.ipc_dir, extra)
        self.proc: subprocess.Popen | None = None
        self.sock: socket.socket | None = None
        self.url: str | None = None
        self.title: str | None = None
        self.loading = False
        self.end_reason: str | None = None
        self._props: dict = {"idle-active": True, "volume": 100.0}
        self._send_lock = threading.Lock()
        self._listeners: list[Callable[[], None]] = []
        self._last_key: tuple | None = None

    # --- lifecycle -------------------------------------------------------
    def mpv_args(self) -> list[str]:
        return mpv_args(self.cfg, self.sock_path, self.ytdl_path)

    def start(self, timeout: float = 30.0) -> None:
        if not self.command:
            raise RuntimeError("mpv was not found: install it (flatpak install flathub io.mpv.Mpv)")
        os.makedirs(self.ipc_dir, exist_ok=True)
        if os.path.exists(self.sock_path):
            os.unlink(self.sock_path)
        cmd = self.command + self.mpv_args()
        log.info("starting player: %s", shlex.join(cmd))
        self.proc = subprocess.Popen(cmd, stdin=subprocess.DEVNULL)
        deadline = time.monotonic() + timeout
        while True:
            if self.proc.poll() is not None:
                raise RuntimeError(f"mpv exited early with code {self.proc.returncode}")
            try:
                sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                sock.connect(self.sock_path)
                break
            except OSError:
                sock.close()
                if time.monotonic() > deadline:
                    raise RuntimeError("mpv did not open its IPC socket") from None
                time.sleep(0.2)
        self.sock = sock
        threading.Thread(target=self._reader, name="mpv-ipc", daemon=True).start()
        for i, name in enumerate(OBSERVED, 1):
            self._cmd("observe_property", i, name)
        self.show_idle()

    def running(self) -> bool:
        return self.proc is not None and self.proc.poll() is None

    def close(self) -> None:
        if not self.running():
            return
        self._cmd("quit")
        try:
            self.proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            self.proc.terminate()

    # --- commands --------------------------------------------------------
    def _cmd(self, *command) -> None:
        if not self.sock:
            return
        data = json.dumps({"command": list(command)}).encode() + b"\n"
        with self._send_lock:
            try:
                self.sock.sendall(data)
            except OSError as exc:
                log.warning("mpv IPC send failed: %s", exc)

    def load(self, url: str, title: str | None = None, start: float = 0.0,
             autoplay: bool = True) -> None:
        log.info("play %s", url)
        self.url, self.title = url, title
        self.loading, self.end_reason = True, None
        self._cmd("set_property", "force-media-title", title or "")
        self._cmd("set_property", "start", f"{start:.3f}" if start > 0 else "none")
        self._cmd("set_property", "pause", not autoplay)
        self._cmd("loadfile", url, "replace")
        self._notify()

    def play(self) -> None:
        self._cmd("set_property", "pause", False)

    def pause(self) -> None:
        self._cmd("set_property", "pause", True)

    def stop(self) -> None:
        self.url = self.title = None
        self.end_reason = "stop"
        self._cmd("stop")
        self._notify()

    def seek(self, seconds: float) -> None:
        self._cmd("seek", max(0.0, float(seconds)), "absolute")

    def set_volume(self, percent: float) -> None:
        self._cmd("set_property", "volume", max(0.0, min(100.0, float(percent))))

    def set_muted(self, muted: bool) -> None:
        self._cmd("set_property", "mute", bool(muted))

    def show_message(self, text: str, ms: int = 4000) -> None:
        self._cmd("show-text", text, ms)

    def show_idle(self) -> None:
        if self.idle_text:
            self.show_message(self.idle_text, 2**31 - 1)

    # --- state -----------------------------------------------------------
    def add_listener(self, fn: Callable[[], None]) -> None:
        self._listeners.append(fn)

    def snapshot(self) -> dict:
        p = self._props
        volume = p.get("volume")
        return {
            "url": self.url,
            "title": self.title or p.get("media-title"),
            "idle": bool(p.get("idle-active")) and not self.loading,
            "buffering": self.loading or bool(p.get("paused-for-cache")),
            "paused": bool(p.get("pause")),
            "position": float(p.get("time-pos") or 0.0),
            "duration": float(p.get("duration") or 0.0),
            "volume": float(100.0 if volume is None else volume),
            "muted": bool(p.get("mute")),
            "end_reason": self.end_reason,
        }

    def video_info(self) -> dict:
        """How the current video is being decoded, for the log and remote page."""
        p = self._props
        hwdec = p.get("hwdec-current") or ""
        return {
            "codec": p.get("video-codec") or "",
            "size": f"{p.get('width')}x{p.get('height')}" if p.get("width") else "",
            "fps": round(float(p.get("container-fps") or 0), 3),
            "decoder": f"hardware ({hwdec})" if hwdec and hwdec != "no" else "software",
            "dropped_frames": int(p.get("frame-drop-count") or 0)
            + int(p.get("decoder-frame-drop-count") or 0),
        }

    def _log_video(self) -> None:
        info = self.video_info()
        if not info["codec"]:
            return  # audio only
        level = logging.WARNING if info["decoder"] == "software" else logging.INFO
        log.log(level, "video: %s %s @ %s fps, %s decoding", info["codec"].split(" /")[0],
                info["size"], info["fps"], info["decoder"])

    def _notify(self) -> None:
        s = self.snapshot()
        key = (s["url"], s["idle"], s["buffering"], s["paused"], s["duration"],
               s["volume"], s["muted"], s["end_reason"])
        if key == self._last_key:
            return
        self._last_key = key
        for fn in list(self._listeners):
            try:
                fn()
            except Exception:  # a broken listener must not stop the IPC reader
                log.exception("player listener failed")

    def _reader(self) -> None:
        buf = b""
        while True:
            try:
                data = self.sock.recv(65536)
            except OSError:
                break
            if not data:
                break
            buf += data
            while b"\n" in buf:
                line, buf = buf.split(b"\n", 1)
                try:
                    self._handle(json.loads(line))
                except ValueError:
                    continue
        log.info("mpv IPC closed")

    def _handle(self, msg: dict) -> None:
        event = msg.get("event")
        if event == "property-change":
            name, value = msg.get("name"), msg.get("data")
            self._props[name] = value
            if name == "idle-active" and value:
                self.loading = False
                self.show_idle()
            if name in ("hwdec-current", "frame-drop-count", "decoder-frame-drop-count",
                        "time-pos", "width", "height", "video-codec", "container-fps"):
                return
        elif event == "start-file":
            self.loading = True
        elif event == "file-loaded":
            self.loading = False
            threading.Timer(2.0, self._log_video).start()
        elif event == "end-file":
            self.loading = False
            reason = msg.get("reason")
            if reason in ("eof", "error"):
                self.end_reason = reason
            if reason == "error":
                log.warning("mpv could not play %s: %s", self.url, msg.get("file_error"))
                self.show_message(f"Could not play: {msg.get('file_error', 'error')}")
        else:
            return
        self._notify()
