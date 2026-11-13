"""A stand-in for Player that records calls instead of driving mpv."""


class FakePlayer:
    def __init__(self):
        self.calls = []
        self.listeners = []
        self.state = {"url": None, "title": None, "idle": True, "buffering": False,
                      "paused": False, "position": 0.0, "duration": 0.0,
                      "volume": 100.0, "muted": False, "end_reason": None}

    def snapshot(self):
        return dict(self.state)

    def video_info(self):
        return {"codec": "", "size": "", "fps": 0, "decoder": "software", "dropped_frames": 0}

    def show_message(self, text, ms=4000):
        self.calls.append(("message", text))

    def add_listener(self, fn):
        self.listeners.append(fn)

    def _changed(self):
        for fn in self.listeners:
            fn()

    def load(self, url, title=None, start=0.0, autoplay=True):
        self.calls.append(("load", url, title, start, autoplay))
        self.state.update(url=url, title=title, idle=False, paused=not autoplay,
                          position=start, duration=60.0, end_reason=None)
        self._changed()

    def play(self):
        self.calls.append(("play",))
        self.state["paused"] = False
        self._changed()

    def pause(self):
        self.calls.append(("pause",))
        self.state["paused"] = True
        self._changed()

    def stop(self):
        self.calls.append(("stop",))
        self.state.update(url=None, idle=True, end_reason="stop")
        self._changed()

    def seek(self, seconds):
        self.calls.append(("seek", seconds))
        self.state["position"] = seconds

    def set_volume(self, percent):
        self.calls.append(("volume", percent))
        self.state["volume"] = percent
        self._changed()

    def set_muted(self, muted):
        self.calls.append(("mute", muted))
        self.state["muted"] = muted
        self._changed()
