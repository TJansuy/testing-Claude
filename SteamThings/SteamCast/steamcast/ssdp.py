"""SSDP: lets UPnP / DLNA control points ("Cast to device" in Windows,
BubbleUPnP, Web Video Caster, many TV-cast apps) discover the renderer."""
from __future__ import annotations

import logging
import socket
import threading

log = logging.getLogger(__name__)

SSDP_ADDR, SSDP_PORT = "239.255.255.250", 1900
SERVER = "Linux/SteamOS UPnP/1.0 SteamCast/1.0"


def parse_headers(text: str) -> tuple[str, dict[str, str]]:
    lines = text.split("\r\n")
    headers = {}
    for line in lines[1:]:
        if ":" in line:
            key, value = line.split(":", 1)
            headers[key.strip().lower()] = value.strip()
    return lines[0], headers


class SsdpServer:
    def __init__(self, ip: str, location: str, udn: str, device_type: str,
                 service_types: list[str]):
        self.ip = ip
        self.location = location
        self.udn = udn
        self.targets = ["upnp:rootdevice", udn, device_type, *service_types]
        self.sock: socket.socket | None = None
        self._stop = threading.Event()

    def usn(self, target: str) -> str:
        return self.udn if target == self.udn else f"{self.udn}::{target}"

    def search_response(self, st: str) -> list[bytes]:
        if st == "ssdp:all":
            targets = self.targets
        elif st in self.targets:
            targets = [st]
        else:
            return []
        return [(
            "HTTP/1.1 200 OK\r\nCACHE-CONTROL: max-age=1800\r\nEXT:\r\n"
            f"LOCATION: {self.location}\r\nSERVER: {SERVER}\r\n"
            f"ST: {t}\r\nUSN: {self.usn(t)}\r\n\r\n").encode() for t in targets]

    def notify(self, nts: str) -> list[bytes]:
        return [(
            f"NOTIFY * HTTP/1.1\r\nHOST: {SSDP_ADDR}:{SSDP_PORT}\r\n"
            f"CACHE-CONTROL: max-age=1800\r\nLOCATION: {self.location}\r\n"
            f"NT: {t}\r\nNTS: {nts}\r\nSERVER: {SERVER}\r\nUSN: {self.usn(t)}\r\n\r\n"
        ).encode() for t in self.targets]

    def start(self) -> None:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        if hasattr(socket, "SO_REUSEPORT"):
            try:
                s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
            except OSError:
                pass
        s.bind(("", SSDP_PORT))
        group = socket.inet_aton(SSDP_ADDR)
        try:
            s.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, group + socket.inet_aton(self.ip))
            s.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_IF, socket.inet_aton(self.ip))
        except OSError:
            s.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, group + socket.inet_aton("0.0.0.0"))
        s.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 4)
        self.sock = s
        threading.Thread(target=self._loop, name="ssdp", daemon=True).start()
        threading.Thread(target=self._advertise, name="ssdp-notify", daemon=True).start()
        log.info("SSDP: advertising %s", self.location)

    def _send(self, packets: list[bytes], addr=(SSDP_ADDR, SSDP_PORT)) -> None:
        for packet in packets:
            try:
                self.sock.sendto(packet, addr)
            except OSError as exc:
                log.debug("SSDP send failed: %s", exc)

    def _advertise(self) -> None:
        while not self._stop.is_set():
            self._send(self.notify("ssdp:alive"))
            self._stop.wait(60)

    def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                data, addr = self.sock.recvfrom(4096)
            except OSError:
                break
            first, headers = parse_headers(data.decode(errors="replace"))
            if first.upper().startswith("M-SEARCH") and "ssdp:discover" in headers.get("man", ""):
                self._send(self.search_response(headers.get("st", "")), addr)

    def stop(self) -> None:
        self._stop.set()
        if self.sock:
            self._send(self.notify("ssdp:byebye"))
            self.sock.close()
