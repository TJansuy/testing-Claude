"""mpv command-line options: decoding, smooth playback, network caching and
surround output."""
from __future__ import annotations

import shlex

from .config import Config

# Hardware decoders the Steam Deck's APU (and other AMD/Intel GPUs) handle
# through VA-API. AV1 isn't one of them on the Deck, so streams are picked
# to avoid it when there's a choice (see youtube_format).
SMOOTH = [
    # Time each frame to the display's refresh instead of the audio clock and
    # blend frames where 24/25/30 fps doesn't divide 60 Hz evenly. This removes
    # the regular judder of film content on a 60 Hz TV.
    "--video-sync=display-resample",
    "--interpolation=yes",
    "--tscale=oversample",
]


def cache_options(cache_mb: int) -> list[str]:
    """Read further ahead on network streams and, after running dry, wait for
    a few seconds of video instead of stuttering through a near-empty buffer."""
    return [
        "--cache=yes",
        f"--demuxer-max-bytes={max(32, cache_mb)}MiB",
        f"--demuxer-max-back-bytes={max(16, cache_mb // 4)}MiB",
        "--demuxer-readahead-secs=30",
        "--cache-pause-initial=yes",
        "--cache-pause-wait=4",
    ]


def mpv_args(cfg: Config, sock_path: str, ytdl_path: str | None = None) -> list[str]:
    script_opts = ["osc-idlescreen=no"]
    if ytdl_path:
        script_opts.append(f"ytdl_hook-ytdl_path={ytdl_path}")
    args = [
        "--idle=yes", "--force-window=yes", "--keep-open=no",
        f"--input-ipc-server={sock_path}", "--title=SteamCast",
        "--image-display-duration=inf", "--msg-level=all=error",
        f"--script-opts={','.join(script_opts)}",
        "--osd-font-size=38",
        # gpu-next has better frame timing and HDR handling; older mpv
        # builds fall back to the classic renderer.
        "--vo=gpu-next,gpu",
        f"--hwdec={cfg.hwdec}",
        "--framedrop=vo",
        f"--ytdl-format={cfg.youtube_format}",
        f"--audio-channels={cfg.audio_channels}",
    ]
    if cfg.video_profile and cfg.video_profile != "default":
        args.append(f"--profile={cfg.video_profile}")
    # Bitstreamed audio can't be resampled, so display-synced timing would
    # drift; keep the audio clock in charge when passthrough is on.
    if cfg.smooth_motion and not cfg.passthrough:
        args += SMOOTH
    args += cache_options(cfg.cache_mb)
    if cfg.fullscreen:
        args.append("--fs")
    if cfg.passthrough:
        args.append(f"--audio-spdif={cfg.passthrough}")
    if cfg.audio_device:
        args.append(f"--audio-device={cfg.audio_device}")
    return args + shlex.split(cfg.mpv_args)
