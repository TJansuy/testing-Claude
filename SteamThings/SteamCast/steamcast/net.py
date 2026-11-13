"""Small network helpers."""
from __future__ import annotations

import re
import socket


def local_ip() -> str:
    """The LAN address the default route uses (no packet is sent)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def mdns_hostname(device_id: str) -> str:
    """A host label unlikely to clash with the machine's own avahi name."""
    host = re.sub(r"[^a-zA-Z0-9-]", "-", socket.gethostname().split(".")[0]) or "steamos"
    return f"{host}-steamcast-{device_id[:6]}"
