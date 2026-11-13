"""CASTV2 wire format: length-prefixed protobuf `CastMessage`s, hand-encoded
so no protobuf library is needed.

    message CastMessage {
      ProtocolVersion protocol_version = 1;  // 0 = CASTV2_1_0
      string source_id = 2;
      string destination_id = 3;
      string namespace = 4;
      PayloadType payload_type = 5;          // 0 = STRING, 1 = BINARY
      optional string payload_utf8 = 6;
      optional bytes payload_binary = 7;
    }
"""
from __future__ import annotations

import json
import struct
from dataclasses import dataclass

MAX_FRAME = 1 << 20

NS_CONNECTION = "urn:x-cast:com.google.cast.tp.connection"
NS_HEARTBEAT = "urn:x-cast:com.google.cast.tp.heartbeat"
NS_DEVICEAUTH = "urn:x-cast:com.google.cast.tp.deviceauth"
NS_RECEIVER = "urn:x-cast:com.google.cast.receiver"
NS_MEDIA = "urn:x-cast:com.google.cast.media"


@dataclass
class CastMessage:
    source: str
    destination: str
    namespace: str
    payload: str | bytes

    def json(self) -> dict:
        if isinstance(self.payload, bytes):
            return {}
        try:
            data = json.loads(self.payload)
        except ValueError:
            return {}
        return data if isinstance(data, dict) else {}


def _varint(n: int) -> bytes:
    out = bytearray()
    while True:
        byte = n & 0x7F
        n >>= 7
        if n:
            out.append(byte | 0x80)
        else:
            out.append(byte)
            return bytes(out)


def _read_varint(data: bytes, off: int) -> tuple[int, int]:
    result = shift = 0
    while True:
        byte = data[off]
        off += 1
        result |= (byte & 0x7F) << shift
        if not byte & 0x80:
            return result, off
        shift += 7
        if shift > 63:
            raise ValueError("varint too long")


def _int_field(num: int, value: int) -> bytes:
    return _varint(num << 3) + _varint(value)


def _bytes_field(num: int, value: bytes) -> bytes:
    return _varint(num << 3 | 2) + _varint(len(value)) + value


def parse_fields(data: bytes) -> dict[int, int | bytes]:
    """Last value wins per field; enough for the flat messages used here."""
    fields: dict[int, int | bytes] = {}
    off = 0
    while off < len(data):
        key, off = _read_varint(data, off)
        num, wire = key >> 3, key & 7
        if wire == 0:
            fields[num], off = _read_varint(data, off)
        elif wire == 2:
            length, off = _read_varint(data, off)
            if off + length > len(data):
                raise ValueError("truncated field")
            fields[num] = data[off:off + length]
            off += length
        elif wire == 1:
            off += 8
        elif wire == 5:
            off += 4
        else:
            raise ValueError(f"unsupported wire type {wire}")
    return fields


def encode(msg: CastMessage) -> bytes:
    out = _int_field(1, 0)
    out += _bytes_field(2, msg.source.encode())
    out += _bytes_field(3, msg.destination.encode())
    out += _bytes_field(4, msg.namespace.encode())
    if isinstance(msg.payload, bytes):
        out += _int_field(5, 1) + _bytes_field(7, msg.payload)
    else:
        out += _int_field(5, 0) + _bytes_field(6, msg.payload.encode())
    return out


def decode(data: bytes) -> CastMessage:
    f = parse_fields(data)
    text = lambda n: f.get(n, b"").decode(errors="replace")  # noqa: E731
    payload: str | bytes = f.get(7, b"") if f.get(5) == 1 else text(6)
    return CastMessage(text(2), text(3), text(4), payload)


def frame(msg: CastMessage) -> bytes:
    body = encode(msg)
    return struct.pack(">I", len(body)) + body


def read_exact(sock, n: int) -> bytes | None:
    buf = b""
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            return None
        buf += chunk
    return buf


def read_message(sock) -> CastMessage | None:
    head = read_exact(sock, 4)
    if head is None:
        return None
    (length,) = struct.unpack(">I", head)
    if length > MAX_FRAME:
        raise ValueError(f"frame too large: {length}")
    body = read_exact(sock, length)
    return None if body is None else decode(body)


def device_auth_error() -> bytes:
    """DeviceAuthMessage { error: AuthError { error_type: INTERNAL_ERROR } }.

    A real Chromecast answers the challenge with a signature chained to
    Google's device CA. That key never leaves certified hardware, so the best
    an open receiver can do is say it can't; senders that require the
    signature (Chrome, Android's system picker) then refuse to connect.
    """
    return _bytes_field(3, _int_field(1, 0))
