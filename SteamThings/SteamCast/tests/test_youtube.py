"""The YouTube bridge and mpv option building, without Node or mpv."""
import io
import json
import unittest

from steamcast.config import Config
from steamcast.mpv_options import mpv_args
from steamcast.youtube import WATCH_URL, YouTubeReceiver

from .fakes import FakePlayer


class FakeProc:
    def __init__(self):
        self.stdin = io.StringIO()

    def poll(self):
        return None

    def sent(self):
        return [json.loads(line) for line in self.stdin.getvalue().splitlines()]


class YouTubeBridgeTest(unittest.TestCase):
    def setUp(self):
        self.player = FakePlayer()
        self.codes = []
        self.yt = YouTubeReceiver(Config(), "TV", self.player, self.codes.append)
        self.yt.proc = FakeProc()
        self.player.add_listener(self.yt._on_player)

    def test_play_pause_and_state(self):
        self.yt._handle({"cmd": "play", "id": "dQw4w9WgXcQ", "position": 12})
        self.assertEqual(self.player.calls[0], ("load", WATCH_URL + "dQw4w9WgXcQ", None, 12.0, True))
        self.yt._handle({"cmd": "pause"})
        self.assertEqual(self.player.calls[-1], ("pause",))
        state = self.yt.proc.sent()[-1]["state"]
        self.assertTrue(state["mine"])
        self.assertTrue(state["paused"])

    def test_end_of_video_is_reported_once(self):
        self.yt._handle({"cmd": "play", "id": "a"})
        self.player.state.update(idle=True, end_reason="eof")
        self.yt._on_player()
        self.yt._on_player()
        self.assertEqual([m for m in self.yt.proc.sent() if m.get("event")], [{"event": "ended"}])

    def test_other_source_takes_over(self):
        self.yt._handle({"cmd": "play", "id": "a"})
        self.player.load("http://other/video.mkv")
        self.assertIn({"event": "interrupted"}, self.yt.proc.sent())
        self.yt._handle({"cmd": "pause"})  # no longer ours: ignored
        self.assertNotEqual(self.player.calls[-1], ("pause",))

    def test_pairing_code(self):
        self.yt._handle({"event": "pairing", "code": "123456789012"})
        self.assertEqual(self.codes, ["123456789012"])


class MpvOptionsTest(unittest.TestCase):
    def test_defaults_are_smooth_and_hardware_decoded(self):
        args = mpv_args(Config(), "/tmp/s.sock", "/x/yt-dlp")
        self.assertIn("--hwdec=auto-safe", args)
        self.assertIn("--video-sync=display-resample", args)
        self.assertIn("--interpolation=yes", args)
        self.assertIn("--script-opts=osc-idlescreen=no,ytdl_hook-ytdl_path=/x/yt-dlp", args)
        self.assertTrue(any("vcodec!^=av01" in a for a in args))

    def test_passthrough_keeps_audio_clock(self):
        args = mpv_args(Config(passthrough="ac3,eac3"), "/tmp/s.sock")
        self.assertIn("--audio-spdif=ac3,eac3", args)
        self.assertNotIn("--video-sync=display-resample", args)

    def test_user_args_come_last(self):
        args = mpv_args(Config(mpv_args="--hwdec=no", video_profile="fast"), "/s")
        self.assertEqual(args[-1], "--hwdec=no")
        self.assertIn("--profile=fast", args)


if __name__ == "__main__":
    unittest.main()
