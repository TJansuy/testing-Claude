"""Zero-dependency mDNS / DNS-SD advertising (how Cast senders find receivers).

Uses the system's avahi-daemon through `avahi-publish` when the built-in
responder can't share port 5353 with it, or when asked to.
"""
from __future__ import annotations

import logging
import shutil
import socket
import struct
import subprocess
import threading
from dataclasses import dataclass, field

log = logging.getLogger(__name__)

MDNS_ADDR, MDNS_PORT = "224.0.0.251", 5353
A, PTR, TXT, SRV, ANY = 1, 12, 16, 33, 255
CLASS_IN, FLUSH = 1, 0x8000
SERVICES_META = ("_services", "_dns-sd", "_udp", "local")


@dataclass
class Service:
    instance: str  # e.g. "SteamCast-1a2b..."
    stype: str  # e.g. "_googlecast._tcp"
    port: int
    txt: dict[str, str] = field(default_factory=dict)

    @property
    def type_labels(self) -> tuple[str, ...]:
        return tuple(self.stype.split(".")) + ("local",)

    @property
    def name_labels(self) -> tuple[str, ...]:
        return (self.instance,) + self.type_labels


def encode_name(labels) -> bytes:
    out = b""
    for label in labels:
        raw = label.encode()[:63]
        out += bytes([len(raw)]) + raw
    return out + b"\0"


def decode_name(data: bytes, off: int) -> tuple[tuple[str, ...], int]:
    labels, end, hops = [], None, 0
    while True:
        length = data[off]
        if length & 0xC0 == 0xC0:  # compression pointer
            if end is None:
                end = off + 2
            off = ((length & 0x3F) << 8) | data[off + 1]
            hops += 1
            if hops > 20:
                raise ValueError("pointer loop")
            continue
        off += 1
        if length == 0:
            break
        labels.append(data[off:off + length].decode(errors="replace").lower())
        off += length
    return tuple(labels), end if end is not None else off


def parse_questions(packet: bytes) -> list[tuple[tuple[str, ...], int, bool]]:
    """Questions of a query as (lower-case labels, qtype, wants unicast reply)."""
    if len(packet) < 12:
        return []
    _id, flags, qdcount = struct.unpack("!3H", packet[:6])
    if flags & 0x8000:  # a response, not a query
        return []
    out, off = [], 12
    try:
        for _ in range(qdcount):
            labels, off = decode_name(packet, off)
            qtype, qclass = struct.unpack("!2H", packet[off:off + 4])
            off += 4
            out.append((labels, qtype, bool(qclass & 0x8000)))
    except (IndexError, ValueError, struct.error):
        pass
    return out


def rr(labels, rtype: int, ttl: int, rdata: bytes, unique: bool = True) -> bytes:
    rclass = CLASS_IN | (FLUSH if unique else 0)
    return encode_name(labels) + struct.pack("!HHIH", rtype, rclass, ttl, len(rdata)) + rdata


def encode_txt(txt: dict[str, str]) -> bytes:
    out = b""
    for key, value in txt.items():
        item = f"{key}={value}".encode()[:255]
        out += bytes([len(item)]) + item
    return out or b"\0"


def build_response(answers: list[bytes], additional: list[bytes] = ()) -> bytes:
    header = struct.pack("!6H", 0, 0x8400, 0, len(answers), 0, len(additional))
    return header + b"".join(answers) + b"".join(additional)


def _lower(labels) -> tuple[str, ...]:
    return tuple(label.lower() for label in labels)


class Responder:
    def __init__(self, hostname: str, ip: str, services: list[Service]):
        self.host = (hostname, "local")
        self.ip = ip
        self.services = services
        self.sock: socket.socket | None = None
        self._stop = threading.Event()

    def _host_rr(self, ttl: int) -> bytes:
        return rr(self.host, A, ttl, socket.inet_aton(self.ip))

    def _service_rrs(self, svc: Service, ttl: int) -> tuple[bytes, list[bytes]]:
        ptr = rr(svc.type_labels, PTR, ttl, encode_name(svc.name_labels), unique=False)
        srv = rr(svc.name_labels, SRV, ttl,
                 struct.pack("!3H", 0, 0, svc.port) + encode_name(self.host))
        txt = rr(svc.name_labels, TXT, ttl, encode_txt(svc.txt))
        return ptr, [srv, txt, self._host_rr(ttl)]

    def answer(self, questions) -> tuple[list[bytes], list[bytes]]:
        answers: list[bytes] = []
        extra: list[bytes] = []
        for labels, qtype, _unicast in questions:
            if labels == SERVICES_META and qtype in (PTR, ANY):
                answers += [rr(SERVICES_META, PTR, 4500, encode_name(s.type_labels), False)
                            for s in self.services]
            for svc in self.services:
                ptr, rest = self._service_rrs(svc, 4500)
                if labels == _lower(svc.type_labels) and qtype in (PTR, ANY):
                    answers.append(ptr)
                    extra += rest
                elif labels == _lower(svc.name_labels) and qtype in (SRV, TXT, ANY):
                    answers += rest[:2]
                    extra.append(rest[2])
            if labels == _lower(self.host) and qtype in (A, ANY):
                answers.append(self._host_rr(120))
        extra = [r for i, r in enumerate(extra) if r not in extra[:i] and r not in answers]
        return answers, extra

    def announcement(self, ttl: int = 4500) -> bytes:
        answers: list[bytes] = []
        for svc in self.services:
            ptr, rest = self._service_rrs(svc, ttl)
            answers += [ptr] + rest[:2]
        return build_response(answers + [self._host_rr(ttl)])

    def start(self) -> None:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        if hasattr(socket, "SO_REUSEPORT"):
            try:
                s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
            except OSError:
                pass
        s.bind(("", MDNS_PORT))  # raises if avahi owns the port exclusively
        group = socket.inet_aton(MDNS_ADDR)
        try:
            s.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, group + socket.inet_aton(self.ip))
            s.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_IF, socket.inet_aton(self.ip))
        except OSError:
            s.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, group + socket.inet_aton("0.0.0.0"))
        s.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 255)
        self.sock = s
        threading.Thread(target=self._loop, name="mdns", daemon=True).start()
        self._send(self.announcement())
        threading.Timer(1.0, lambda: self._send(self.announcement())).start()

    def _send(self, packet: bytes, addr=(MDNS_ADDR, MDNS_PORT)) -> None:
        try:
            self.sock.sendto(packet, addr)
        except OSError as exc:
            log.debug("mDNS send failed: %s", exc)

    def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                packet, addr = self.sock.recvfrom(9000)
            except OSError:
                break
            questions = parse_questions(packet)
            answers, extra = self.answer(questions)
            if not answers:
                continue
            unicast = addr[1] != MDNS_PORT or any(q[2] for q in questions)
            self._send(build_response(answers, extra), addr if unicast else (MDNS_ADDR, MDNS_PORT))

    def stop(self) -> None:
        self._stop.set()
        if self.sock:
            self._send(self.announcement(ttl=0))  # "goodbye"
            self.sock.close()


class AvahiPublisher:
    """Hands the services to the system avahi-daemon."""

    def __init__(self, services: list[Service]):
        self.services = services
        self.procs: list[subprocess.Popen] = []

    def start(self) -> None:
        for svc in self.services:
            txt = [f"{k}={v}" for k, v in svc.txt.items()]
            cmd = ["avahi-publish", "-s", svc.instance, svc.stype, str(svc.port), *txt]
            self.procs.append(subprocess.Popen(cmd, stdout=subprocess.DEVNULL))

    def stop(self) -> None:
        for proc in self.procs:
            proc.terminate()


def advertise(mode: str, hostname: str, ip: str, services: list[Service]):
    """Start advertising; returns an object with stop()."""
    has_avahi = shutil.which("avahi-publish") is not None
    if mode != "avahi":
        responder = Responder(hostname, ip, services)
        try:
            responder.start()
            log.info("mDNS: built-in responder on %s", ip)
            return responder
        except OSError as exc:
            if mode == "builtin" or not has_avahi:
                raise
            log.info("mDNS port busy (%s); using avahi-daemon", exc)
    publisher = AvahiPublisher(services)
    publisher.start()
    return publisher
