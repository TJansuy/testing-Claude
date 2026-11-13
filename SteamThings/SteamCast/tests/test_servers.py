"""Talks to the DLNA and Cast servers over real sockets, with a fake player."""
import json
import shutil
import socket
import ssl
import tempfile
import unittest
import urllib.request
from pathlib import Path

from steamcast import remote
from steamcast.cast import CastServer, ensure_certificate, proto
from steamcast.dlna import DlnaRenderer, fmt_time, parse_time
from steamcast.web import Router, WebServer

from .fakes import FakePlayer

SOAP = ('<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">'
        '<s:Body><u:{action} xmlns:u="urn:schemas-upnp-org:service:{svc}:1">{args}'
        "</u:{action}></s:Body></s:Envelope>")
DIDL = ('&lt;DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/"&gt;&lt;item&gt;'
        "&lt;dc:title&gt;Big Buck Bunny&lt;/dc:title&gt;&lt;/item&gt;&lt;/DIDL-Lite&gt;")


class DlnaHttpTest(unittest.TestCase):
    def setUp(self):
        self.player = FakePlayer()
        router = Router()
        DlnaRenderer(self.player, "Test TV", "uuid:1234").register(router)
        remote.register(router, self.player, "Test TV", ["DLNA"])
        self.web = WebServer(0, router)
        self.web.start()
        self.base = f"http://127.0.0.1:{self.web.port}"

    def tearDown(self):
        self.web.stop()

    def soap(self, svc, action, **args):
        body = SOAP.format(svc=svc, action=action,
                           args="".join(f"<{k}>{v}</{k}>" for k, v in args.items()))
        req = urllib.request.Request(f"{self.base}/dlna/control/{svc}", body.encode(), headers={
            "SOAPACTION": f'"urn:schemas-upnp-org:service:{svc}:1#{action}"',
            "Content-Type": 'text/xml; charset="utf-8"'})
        try:
            with urllib.request.urlopen(req) as resp:
                return resp.status, resp.read().decode()
        except urllib.error.HTTPError as err:
            return err.code, err.read().decode()

    def test_description(self):
        with urllib.request.urlopen(f"{self.base}/dlna/description.xml") as resp:
            body = resp.read().decode()
        self.assertIn("MediaRenderer:1", body)
        self.assertIn("<friendlyName>Test TV</friendlyName>", body)

    def test_play_flow(self):
        status, body = self.soap("AVTransport", "GetTransportInfo", InstanceID=0)
        self.assertIn("NO_MEDIA_PRESENT", body)
        self.soap("AVTransport", "SetAVTransportURI", InstanceID=0,
                  CurrentURI="http://host/movie.mkv", CurrentURIMetaData=DIDL)
        self.assertIn("STOPPED", self.soap("AVTransport", "GetTransportInfo", InstanceID=0)[1])
        self.soap("AVTransport", "Play", InstanceID=0, Speed=1)
        self.assertEqual(self.player.calls[-1][:3], ("load", "http://host/movie.mkv", "Big Buck Bunny"))
        self.assertIn("PLAYING", self.soap("AVTransport", "GetTransportInfo", InstanceID=0)[1])
        self.soap("AVTransport", "Seek", InstanceID=0, Unit="REL_TIME", Target="0:01:30")
        self.assertEqual(self.player.calls[-1], ("seek", 90.0))
        status, body = self.soap("AVTransport", "GetPositionInfo", InstanceID=0)
        self.assertIn("<RelTime>0:01:30</RelTime>", body)
        self.soap("AVTransport", "Pause", InstanceID=0)
        self.assertIn("PAUSED_PLAYBACK", self.soap("AVTransport", "GetTransportInfo", InstanceID=0)[1])

    def test_volume_and_errors(self):
        self.soap("RenderingControl", "SetVolume", InstanceID=0, Channel="Master", DesiredVolume=40)
        self.assertIn("<CurrentVolume>40</CurrentVolume>",
                      self.soap("RenderingControl", "GetVolume", InstanceID=0, Channel="Master")[1])
        status, body = self.soap("AVTransport", "Explode", InstanceID=0)
        self.assertEqual(status, 500)
        self.assertIn("<errorCode>401</errorCode>", body)

    def test_remote_api(self):
        req = urllib.request.Request(f"{self.base}/api/play", b'{"url": "https://x/y.mp4"}',
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(json.load(resp)["url"], "https://x/y.mp4")
        with urllib.request.urlopen(f"{self.base}/") as resp:
            self.assertIn(b"Test TV", resp.read())

    def test_time_helpers(self):
        self.assertEqual(fmt_time(3725), "1:02:05")
        self.assertEqual(parse_time("1:02:05.5"), 3725.5)


@unittest.skipUnless(shutil.which("openssl"), "openssl needed for the Cast certificate")
class CastSocketTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.cert = ensure_certificate(Path(cls.tmp.name), "test")

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def setUp(self):
        self.player = FakePlayer()
        self.server = CastServer(self.player, "Test TV", *self.cert, port=0)
        self.server.start()
        ctx = ssl.create_default_context()
        ctx.check_hostname, ctx.verify_mode = False, ssl.CERT_NONE
        raw = socket.create_connection(("127.0.0.1", self.server.port), timeout=5)
        self.sock = ctx.wrap_socket(raw)

    def tearDown(self):
        self.sock.close()
        self.server.stop()

    def send(self, dst, ns, payload):
        if isinstance(payload, dict):
            payload = json.dumps(payload)
        self.sock.sendall(proto.frame(proto.CastMessage("sender-0", dst, ns, payload)))

    def expect(self, ns, kind):
        """Read until a message of the given namespace and type arrives."""
        for _ in range(20):
            msg = proto.read_message(self.sock)
            if msg.namespace == ns and msg.json().get("type") == kind:
                return msg
        self.fail(f"no {kind} on {ns}")

    def test_full_session(self):
        self.send("receiver-0", proto.NS_DEVICEAUTH, b"\x0a\x00")
        self.assertEqual(proto.read_message(self.sock).namespace, proto.NS_DEVICEAUTH)
        self.send("receiver-0", proto.NS_CONNECTION, {"type": "CONNECT"})
        self.send("receiver-0", proto.NS_HEARTBEAT, {"type": "PING"})
        self.expect(proto.NS_HEARTBEAT, "PONG")
        self.send("receiver-0", proto.NS_RECEIVER, {"type": "LAUNCH", "appId": "CC1AD845", "requestId": 1})
        status = self.expect(proto.NS_RECEIVER, "RECEIVER_STATUS").json()
        transport = status["status"]["applications"][0]["transportId"]
        self.send(transport, proto.NS_MEDIA, {
            "type": "LOAD", "requestId": 2, "autoplay": True, "currentTime": 5,
            "media": {"contentId": "http://host/a.mkv", "contentType": "video/x-matroska",
                      "metadata": {"title": "A"}}})
        media = self.expect(proto.NS_MEDIA, "MEDIA_STATUS").json()
        self.assertEqual(media["status"][0]["playerState"], "PLAYING")
        self.assertEqual(self.player.calls[0], ("load", "http://host/a.mkv", "A", 5.0, True))
        self.send(transport, proto.NS_MEDIA, {"type": "PAUSE", "requestId": 3, "mediaSessionId": 1})
        while True:
            media = self.expect(proto.NS_MEDIA, "MEDIA_STATUS").json()
            if media["requestId"] == 3:
                break
        self.assertEqual(media["status"][0]["playerState"], "PAUSED")
        self.send("receiver-0", proto.NS_RECEIVER,
                  {"type": "SET_VOLUME", "requestId": 4, "volume": {"level": 0.25}})
        while self.expect(proto.NS_RECEIVER, "RECEIVER_STATUS").json()["requestId"] != 4:
            pass
        self.assertIn(("volume", 25.0), self.player.calls)
        self.send(transport, proto.NS_MEDIA, {"type": "LOAD", "requestId": 5,
                                              "media": {"contentId": "youtube-video-id"}})
        self.expect(proto.NS_MEDIA, "LOAD_FAILED")


if __name__ == "__main__":
    unittest.main()
