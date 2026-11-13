"""The Cast TLS socket (port 8009): connections, heartbeats, device auth and
routing to the receiver and media channels."""
from __future__ import annotations

import json
import logging
import socket
import ssl
import threading
from pathlib import Path

from .media import MediaChannel
from .proto import (NS_CONNECTION, NS_DEVICEAUTH, NS_HEARTBEAT, NS_MEDIA, NS_RECEIVER,
                    CastMessage, device_auth_error, frame, read_message)
from .receiver import Receiver

log = logging.getLogger(__name__)


class Connection:
    def __init__(self, sock: ssl.SSLSocket, addr):
        self.sock = sock
        self.addr = addr
        self.lock = threading.Lock()

    def send(self, source: str, destination: str, namespace: str, payload) -> None:
        if isinstance(payload, dict):
            payload = json.dumps(payload)
        data = frame(CastMessage(source, destination, namespace, payload))
        with self.lock:
            try:
                self.sock.sendall(data)
            except OSError as exc:
                log.debug("cast send to %s failed: %s", self.addr, exc)


class CastServer:
    def __init__(self, player, name: str, cert: Path, key: Path, port: int = 8009):
        self.player = player
        self.port = port
        self.ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        self.ctx.load_cert_chain(str(cert), str(key))
        self.connections: set[Connection] = set()
        self.lock = threading.Lock()
        self.receiver = Receiver(self, player, name)
        self.media = MediaChannel(self, player)
        self.listener: socket.socket | None = None
        player.add_listener(self._on_player)

    # --- sockets ---------------------------------------------------------
    def start(self) -> None:
        listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        listener.bind(("", self.port))
        listener.listen(8)
        self.listener = listener
        self.port = listener.getsockname()[1]
        threading.Thread(target=self._accept, name="cast-accept", daemon=True).start()
        log.info("Google Cast: listening on port %d", self.port)

    def stop(self) -> None:
        if self.listener:
            self.listener.close()
        with self.lock:
            for conn in self.connections:
                try:
                    conn.sock.close()
                except OSError:
                    pass

    def _accept(self) -> None:
        while True:
            try:
                raw, addr = self.listener.accept()
            except OSError:
                return
            threading.Thread(target=self._serve, args=(raw, addr), daemon=True).start()

    def _serve(self, raw: socket.socket, addr) -> None:
        try:
            tls = self.ctx.wrap_socket(raw, server_side=True)
        except (ssl.SSLError, OSError) as exc:
            log.debug("cast TLS handshake with %s failed: %s", addr[0], exc)
            raw.close()
            return
        conn = Connection(tls, addr)
        with self.lock:
            self.connections.add(conn)
        log.info("cast sender connected: %s", addr[0])
        try:
            while True:
                msg = read_message(tls)
                if msg is None:
                    break
                self.dispatch(conn, msg)
        except (OSError, ValueError) as exc:
            log.debug("cast connection %s ended: %s", addr[0], exc)
        finally:
            with self.lock:
                self.connections.discard(conn)
            tls.close()
            log.info("cast sender disconnected: %s", addr[0])

    # --- messages --------------------------------------------------------
    def reply(self, conn: Connection, msg: CastMessage, payload) -> None:
        conn.send(msg.destination, msg.source, msg.namespace, payload)

    def broadcast(self, source: str, namespace: str, payload: dict) -> None:
        with self.lock:
            connections = list(self.connections)
        for conn in connections:
            conn.send(source, "*", namespace, payload)

    def dispatch(self, conn: Connection, msg: CastMessage) -> None:
        ns = msg.namespace
        if ns != NS_HEARTBEAT:
            log.debug("cast <- %s %s %s", msg.source, ns, msg.payload)
        if ns == NS_DEVICEAUTH:
            self.reply(conn, msg, device_auth_error())
        elif ns == NS_HEARTBEAT:
            if msg.json().get("type") == "PING":
                self.reply(conn, msg, {"type": "PONG"})
        elif ns == NS_CONNECTION:
            pass  # virtual CONNECT / CLOSE: nothing to set up per channel
        elif ns == NS_RECEIVER:
            self.receiver.handle(conn, msg)
        elif ns == NS_MEDIA:
            self.media.handle(conn, msg)
        else:
            log.debug("cast: unsupported namespace %s", ns)

    def _on_player(self) -> None:
        self.receiver.on_player_change()
        self.media.on_player_change()
