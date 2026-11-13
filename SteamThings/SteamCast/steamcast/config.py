"""Settings: defaults, the INI file and command-line overrides."""
from __future__ import annotations

import argparse
import configparser
import os
import socket
import uuid
from dataclasses import dataclass, fields
from pathlib import Path

SECTION = "steamcast"


def config_dir() -> Path:
    base = os.environ.get("XDG_CONFIG_HOME") or os.path.expanduser("~/.config")
    return Path(base) / "steamcast"


def runtime_dir() -> Path:
    base = os.environ.get("XDG_RUNTIME_DIR")
    if base and os.path.isdir(base):
        return Path(base) / "steamcast"
    return Path(os.path.expanduser("~/.cache")) / "steamcast"


def default_name() -> str:
    host = socket.gethostname().split(".")[0] or "steamdeck"
    return f"SteamCast ({host})"


@dataclass
class Config:
    name: str = ""
    http_port: int = 8090
    cast_port: int = 8009
    dlna: bool = True
    googlecast: bool = True
    airplay: bool = True
    mdns: str = "auto"  # auto | builtin | avahi
    fullscreen: bool = True
    # Surround: "auto" lets mpv open the output device with as many channels
    # as it supports (5.1 / 7.1 over HDMI). "stereo" forces a downmix.
    audio_channels: str = "auto"
    # Bitstream these codecs to an AV receiver, e.g. "ac3,eac3,dts-hd,truehd".
    passthrough: str = ""
    audio_device: str = ""
    # --- video ---
    hwdec: str = "auto-safe"  # hardware decoding (VA-API on SteamOS)
    smooth_motion: bool = True  # display-synced timing + frame blending
    video_profile: str = "default"  # "fast" for weak GPUs / 4K output
    cache_mb: int = 400  # network read-ahead
    # --- YouTube ---
    youtube: bool = True
    youtube_port: int = 8091
    # Up to 1080p60, avoiding AV1 (no hardware decoder on the Steam Deck).
    youtube_format: str = ("bestvideo[height<=?1080][fps<=?60][vcodec!^=av01]"
                           "+bestaudio/best[height<=?1080]")
    node_command: str = ""
    ytdlp_command: str = ""
    mpv_command: str = ""
    mpv_args: str = ""
    uxplay_command: str = ""
    uxplay_args: str = "-fs"
    log_level: str = "INFO"

    @property
    def display_name(self) -> str:
        return self.name or default_name()


def load_ini(cfg: Config, path: Path) -> None:
    parser = configparser.ConfigParser()
    if not parser.read(path) or not parser.has_section(SECTION):
        return
    section = parser[SECTION]
    for f in fields(cfg):
        if f.name not in section:
            continue
        if f.type == "bool":
            setattr(cfg, f.name, section.getboolean(f.name))
        elif f.type == "int":
            setattr(cfg, f.name, section.getint(f.name))
        else:
            setattr(cfg, f.name, section.get(f.name))


def device_id(directory: Path) -> str:
    """A stable random id, so senders remember this receiver across runs."""
    path = directory / "device-id"
    try:
        value = path.read_text().strip()
        if len(value) == 32:
            return value
    except OSError:
        pass
    value = uuid.uuid4().hex
    directory.mkdir(parents=True, exist_ok=True)
    path.write_text(value + "\n")
    return value


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="steamcast",
        description="Receive YouTube, Google Cast, DLNA and AirPlay on a SteamOS TV box.")
    p.add_argument("--config", type=Path, help="INI file (default ~/.config/steamcast/steamcast.ini)")
    p.add_argument("--name", help="name shown to phones and laptops")
    p.add_argument("--http-port", type=int)
    p.add_argument("--windowed", action="store_true", help="don't go fullscreen")
    p.add_argument("--audio-channels", help='"auto", "7.1", "5.1", "stereo"...')
    p.add_argument("--passthrough", help='codecs to bitstream, e.g. "ac3,eac3,dts-hd,truehd"')
    p.add_argument("--no-dlna", action="store_true")
    p.add_argument("--no-googlecast", action="store_true")
    p.add_argument("--no-airplay", action="store_true")
    p.add_argument("--no-youtube", action="store_true")
    p.add_argument("--verbose", "-v", action="store_true")
    return p.parse_args(argv)


def load_config(argv: list[str] | None = None) -> Config:
    args = parse_args(argv)
    cfg = Config()
    load_ini(cfg, args.config or config_dir() / "steamcast.ini")
    if args.name:
        cfg.name = args.name
    if args.http_port:
        cfg.http_port = args.http_port
    if args.windowed:
        cfg.fullscreen = False
    if args.audio_channels:
        cfg.audio_channels = args.audio_channels
    if args.passthrough is not None:
        cfg.passthrough = args.passthrough
    cfg.dlna &= not args.no_dlna
    cfg.googlecast &= not args.no_googlecast
    cfg.airplay &= not args.no_airplay
    cfg.youtube &= not args.no_youtube
    if args.verbose:
        cfg.log_level = "DEBUG"
    return cfg
