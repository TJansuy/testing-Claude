"""UPnP / DLNA MediaRenderer: AVTransport, RenderingControl, ConnectionManager."""
from __future__ import annotations

import html
import logging
import re
import uuid
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape

from .dlna_scpd import SERVICES, scpd_xml, service_type
from .web import Request, Response, Router

log = logging.getLogger(__name__)

DEVICE_TYPE = "urn:schemas-upnp-org:device:MediaRenderer:1"
SOAP_ENV = "http://schemas.xmlsoap.org/soap/envelope/"
XML = "text/xml; charset=\"utf-8\""
SINK_PROTOCOLS = ",".join(f"http-get:*:{mime}:*" for mime in (
    "video/mp4", "video/x-matroska", "video/x-mkv", "video/webm", "video/mpeg",
    "video/mp2t", "video/quicktime", "video/x-msvideo", "video/avi", "video/x-flv",
    "application/vnd.apple.mpegurl", "application/x-mpegurl", "application/dash+xml",
    "audio/mpeg", "audio/mp4", "audio/aac", "audio/flac", "audio/x-flac", "audio/wav",
    "audio/x-wav", "audio/ogg", "audio/opus", "audio/ac3", "audio/eac3", "audio/vnd.dts",
    "image/jpeg", "image/png", "image/gif", "image/webp"))


class UpnpError(Exception):
    def __init__(self, code: int, description: str):
        super().__init__(description)
        self.code, self.description = code, description


def fmt_time(seconds: float) -> str:
    seconds = max(0, int(seconds or 0))
    return f"{seconds // 3600}:{seconds // 60 % 60:02d}:{seconds % 60:02d}"


def parse_time(value: str) -> float:
    parts = value.strip().split(":")
    if not 1 <= len(parts) <= 3:
        raise UpnpError(711, "Illegal seek target")
    try:
        total = 0.0
        for part in parts:
            total = total * 60 + float(part)
    except ValueError:
        raise UpnpError(711, "Illegal seek target") from None
    return total


def didl_title(metadata: str) -> str | None:
    match = re.search(r"<dc:title>(.*?)</dc:title>", metadata or "", re.S)
    return html.unescape(match.group(1)).strip() if match else None


def parse_soap(body: bytes) -> tuple[str, dict[str, str]]:
    try:
        root = ET.fromstring(body)
    except ET.ParseError:
        raise UpnpError(402, "Invalid Args") from None
    soap_body = root.find(f"{{{SOAP_ENV}}}Body")
    if soap_body is None or len(soap_body) == 0:
        raise UpnpError(401, "Invalid Action")
    action = soap_body[0]
    local = lambda tag: tag.rsplit("}", 1)[-1]  # noqa: E731
    return local(action.tag), {local(c.tag): (c.text or "") for c in action}


def soap_response(service: str, action: str, out: dict) -> bytes:
    args = "".join(f"<{k}>{escape(str(v))}</{k}>" for k, v in out.items())
    return (f'<?xml version="1.0" encoding="utf-8"?>'
            f'<s:Envelope xmlns:s="{SOAP_ENV}" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">'
            f'<s:Body><u:{action}Response xmlns:u="{service_type(service)}">{args}'
            f"</u:{action}Response></s:Body></s:Envelope>").encode()


def soap_fault(err: UpnpError) -> Response:
    body = (f'<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="{SOAP_ENV}" '
            's:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><s:Fault>'
            "<faultcode>s:Client</faultcode><faultstring>UPnPError</faultstring><detail>"
            '<UPnPError xmlns="urn:schemas-upnp-org:control-1-0">'
            f"<errorCode>{err.code}</errorCode><errorDescription>{escape(err.description)}"
            "</errorDescription></UPnPError></detail></s:Fault></s:Body></s:Envelope>")
    return 500, {"Content-Type": XML}, body.encode()


class DlnaRenderer:
    def __init__(self, player, name: str, udn: str):
        self.player = player
        self.name = name
        self.udn = udn
        self.uri = ""
        self.metadata = ""
        self.pending = False  # SetAVTransportURI seen, Play not yet

    def register(self, router: Router) -> None:
        router.add("GET", "/dlna/description.xml", self.description)
        for svc in SERVICES:
            xml = scpd_xml(svc).encode()
            router.add("GET", f"/dlna/{svc}.xml", lambda _r, x=xml: (200, {"Content-Type": XML}, x))
            router.add("POST", f"/dlna/control/{svc}", lambda r, s=svc: self.control(s, r))
            router.add("SUBSCRIBE", f"/dlna/event/{svc}", self.subscribe)
            router.add("UNSUBSCRIBE", f"/dlna/event/{svc}", lambda _r: (200, {}, b""))

    def description(self, _req: Request) -> Response:
        services = "".join(
            f"<service><serviceType>{service_type(s)}</serviceType>"
            f"<serviceId>urn:upnp-org:serviceId:{s}</serviceId>"
            f"<SCPDURL>/dlna/{s}.xml</SCPDURL><controlURL>/dlna/control/{s}</controlURL>"
            f"<eventSubURL>/dlna/event/{s}</eventSubURL></service>" for s in SERVICES)
        body = ('<?xml version="1.0" encoding="utf-8"?>'
                '<root xmlns="urn:schemas-upnp-org:device-1-0" xmlns:dlna="urn:schemas-dlna-org:device-1-0">'
                "<specVersion><major>1</major><minor>0</minor></specVersion><device>"
                f"<deviceType>{DEVICE_TYPE}</deviceType><friendlyName>{escape(self.name)}</friendlyName>"
                "<manufacturer>SteamThings</manufacturer><modelName>SteamCast</modelName>"
                "<modelDescription>SteamOS media receiver</modelDescription><modelNumber>1</modelNumber>"
                f"<UDN>{self.udn}</UDN><dlna:X_DLNADOC>DMR-1.50</dlna:X_DLNADOC>"
                f"<serviceList>{services}</serviceList></device></root>")
        return 200, {"Content-Type": XML}, body.encode()

    def subscribe(self, _req: Request) -> Response:
        # Accepted so control points don't give up; state is read by polling.
        return 200, {"SID": f"uuid:{uuid.uuid4()}", "TIMEOUT": "Second-1800"}, b""

    def control(self, service: str, req: Request) -> Response:
        try:
            action, args = parse_soap(req.body)
            fn = getattr(self, f"_{service}_{action}", None)
            if fn is None:
                raise UpnpError(401, "Invalid Action")
            log.debug("DLNA %s.%s %s", service, action, args)
            out = fn(args) or {}
        except UpnpError as err:
            return soap_fault(err)
        return 200, {"Content-Type": XML}, soap_response(service, action, out)

    # --- AVTransport -----------------------------------------------------
    def transport_state(self) -> str:
        snap = self.player.snapshot()
        if not self.uri:
            return "NO_MEDIA_PRESENT"
        if self.pending or snap["url"] != self.uri or snap["idle"]:
            return "STOPPED"
        if snap["buffering"]:
            return "TRANSITIONING"
        return "PAUSED_PLAYBACK" if snap["paused"] else "PLAYING"

    def _AVTransport_SetAVTransportURI(self, args):
        uri = args.get("CurrentURI", "").strip()
        if not uri:
            raise UpnpError(714, "Illegal MIME-type")
        self.uri, self.metadata, self.pending = uri, args.get("CurrentURIMetaData", ""), True

    def _AVTransport_SetNextAVTransportURI(self, _args):
        return None

    def _AVTransport_Play(self, _args):
        if not self.uri:
            raise UpnpError(701, "Transition not available")
        snap = self.player.snapshot()
        if self.pending or snap["url"] != self.uri or snap["idle"]:
            self.pending = False
            self.player.load(self.uri, didl_title(self.metadata))
        else:
            self.player.play()

    def _AVTransport_Pause(self, _args):
        self.player.pause()

    def _AVTransport_Stop(self, _args):
        if self.player.snapshot()["url"] == self.uri:
            self.player.stop()

    def _AVTransport_Seek(self, args):
        if args.get("Unit") not in ("REL_TIME", "ABS_TIME"):
            raise UpnpError(710, "Seek mode not supported")
        self.player.seek(parse_time(args.get("Target", "0")))

    def _AVTransport_GetTransportInfo(self, _args):
        return {"CurrentTransportState": self.transport_state(),
                "CurrentTransportStatus": "OK", "CurrentSpeed": "1"}

    def _AVTransport_GetPositionInfo(self, _args):
        snap = self.player.snapshot()
        mine = snap["url"] == self.uri and bool(self.uri)
        pos = snap["position"] if mine else 0
        return {"Track": 1 if self.uri else 0,
                "TrackDuration": fmt_time(snap["duration"] if mine else 0),
                "TrackMetaData": self.metadata, "TrackURI": self.uri,
                "RelTime": fmt_time(pos), "AbsTime": fmt_time(pos),
                "RelCount": 2147483647, "AbsCount": 2147483647}

    def _AVTransport_GetMediaInfo(self, _args):
        snap = self.player.snapshot()
        mine = snap["url"] == self.uri and bool(self.uri)
        return {"NrTracks": 1 if self.uri else 0,
                "MediaDuration": fmt_time(snap["duration"] if mine else 0),
                "CurrentURI": self.uri, "CurrentURIMetaData": self.metadata,
                "NextURI": "", "NextURIMetaData": "", "PlayMedium": "NETWORK",
                "RecordMedium": "NOT_IMPLEMENTED", "WriteStatus": "NOT_IMPLEMENTED"}

    def _AVTransport_GetTransportSettings(self, _args):
        return {"PlayMode": "NORMAL", "RecQualityMode": "NOT_IMPLEMENTED"}

    def _AVTransport_GetDeviceCapabilities(self, _args):
        return {"PlayMedia": "NETWORK", "RecMedia": "NOT_IMPLEMENTED",
                "RecQualityModes": "NOT_IMPLEMENTED"}

    def _AVTransport_GetCurrentTransportActions(self, _args):
        return {"Actions": "Play,Pause,Stop,Seek"}

    # --- RenderingControl ------------------------------------------------
    def _RenderingControl_GetVolume(self, _args):
        return {"CurrentVolume": int(round(self.player.snapshot()["volume"]))}

    def _RenderingControl_SetVolume(self, args):
        try:
            self.player.set_volume(int(args.get("DesiredVolume", "")))
        except ValueError:
            raise UpnpError(402, "Invalid Args") from None

    def _RenderingControl_GetMute(self, _args):
        return {"CurrentMute": 1 if self.player.snapshot()["muted"] else 0}

    def _RenderingControl_SetMute(self, args):
        self.player.set_muted(args.get("DesiredMute", "0").lower() in ("1", "true", "yes"))

    def _RenderingControl_ListPresets(self, _args):
        return {"CurrentPresetNameList": "FactoryDefaults"}

    def _RenderingControl_SelectPreset(self, _args):
        return None

    # --- ConnectionManager -----------------------------------------------
    def _ConnectionManager_GetProtocolInfo(self, _args):
        return {"Source": "", "Sink": SINK_PROTOCOLS}

    def _ConnectionManager_GetCurrentConnectionIDs(self, _args):
        return {"ConnectionIDs": "0"}

    def _ConnectionManager_GetCurrentConnectionInfo(self, _args):
        return {"RcsID": 0, "AVTransportID": 0, "ProtocolInfo": "",
                "PeerConnectionManager": "", "PeerConnectionID": -1,
                "Direction": "Input", "Status": "OK"}

