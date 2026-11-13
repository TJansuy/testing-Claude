"""A self-signed TLS certificate for the Cast socket (port 8009)."""
from __future__ import annotations

import logging
import shutil
import subprocess
from pathlib import Path

log = logging.getLogger(__name__)


def ensure_certificate(directory: Path, common_name: str) -> tuple[Path, Path] | None:
    cert, key = directory / "cast-cert.pem", directory / "cast-key.pem"
    if cert.exists() and key.exists():
        return cert, key
    if not shutil.which("openssl"):
        log.error("Google Cast needs the openssl command to create its TLS certificate")
        return None
    directory.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        ["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "3650",
         "-subj", f"/CN={common_name}", "-keyout", str(key), "-out", str(cert)],
        capture_output=True, text=True)
    if result.returncode != 0:
        log.error("openssl failed: %s", result.stderr.strip())
        return None
    key.chmod(0o600)
    return cert, key
