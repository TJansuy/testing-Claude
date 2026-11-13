"""Google Cast (CASTV2) receiver."""
from __future__ import annotations

from .server import CastServer
from .tls import ensure_certificate

CAST_SERVICE = "_googlecast._tcp"


def txt_record(device_id: str, name: str) -> dict[str, str]:
    """TXT keys a Chromecast advertises (id, friendly name, capabilities...)."""
    return {"id": device_id, "cd": device_id.upper(), "rm": "", "ve": "05",
            "md": "SteamCast", "ic": "/setup/icon.png", "fn": name,
            "ca": "4101", "st": "0", "bs": "FA8FCA000000", "nf": "1", "rs": ""}


__all__ = ["CAST_SERVICE", "CastServer", "ensure_certificate", "txt_record"]
