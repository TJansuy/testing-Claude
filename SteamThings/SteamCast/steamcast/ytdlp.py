"""yt-dlp, which mpv uses to turn YouTube links into streams.

YouTube changes often and old yt-dlp versions stop working, so the copy that
install.sh puts in ~/.local/share/steamcast/bin is updated in the background
at most once a day.
"""
from __future__ import annotations

import logging
import os
import shlex
import subprocess
import threading
import time
from pathlib import Path

from .config import Config

log = logging.getLogger(__name__)

BUNDLED = Path(os.path.expanduser("~/.local/share/steamcast/bin/yt-dlp"))
UPDATE_EVERY = 24 * 3600


def find_ytdlp(cfg: Config) -> str | None:
    """The yt-dlp mpv should use, or None to let mpv find its own."""
    if cfg.ytdlp_command:
        return shlex.split(cfg.ytdlp_command)[0]
    if BUNDLED.is_file() and os.access(BUNDLED, os.X_OK):
        return str(BUNDLED)
    return None


def update_in_background(path: str | None) -> None:
    if not path or Path(path) != BUNDLED:
        return
    stamp = BUNDLED.with_name(".yt-dlp-updated")
    try:
        if time.time() - stamp.stat().st_mtime < UPDATE_EVERY:
            return
    except OSError:
        pass

    def run() -> None:
        result = subprocess.run([path, "-U"], capture_output=True, text=True, timeout=300)
        if result.returncode == 0:
            stamp.touch()
            log.info("yt-dlp: %s", (result.stdout.strip().splitlines() or ["up to date"])[-1])
        else:
            log.warning("yt-dlp update failed: %s", result.stderr.strip()[-300:])

    threading.Thread(target=run, name="yt-dlp-update", daemon=True).start()
