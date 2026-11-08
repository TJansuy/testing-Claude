# The relay server

[← Back to LocalChatter](../README.md)

## Server settings

Set these as environment variables (or the `LOCALCHATTER_*` names with Docker Compose).

| Compose variable | Server variable | Default | Meaning |
| --- | --- | --- | --- |
| `LOCALCHATTER_HOST` | `ADVERTISED_HOST` | *(empty)* | LAN address devices use to reach the server. Goes in the certificate and on the setup page. If empty, the address a device opened the setup page with is used. |
| `LOCALCHATTER_PORT` | `ADVERTISED_PORT` | `8443` | Port devices use. |
| `LOCALCHATTER_APP_URL` | `APP_URL` | `https://tjansuy.github.io/testing-Claude/PWA/LocalChatter/` | Where the app is hosted. Change this if your GitHub Pages URL differs. |
| `LOCALCHATTER_ROOM` | `ROOM_NAME` | `LocalChatter` | Room name shown in the app. |
| `LOCALCHATTER_MAX_MB` | `MAX_MESSAGE_MB` | `25` | Largest message in MB. Files are sent base64-encoded, so the largest file is about ¾ of this. |
| – | `MAX_PEERS` | `200` | Most people connected at once. |
| – | `PORT` | `8443` | Port the server listens on inside the container. |
| – | `CERT_DIR` | `/certs` | Where the TLS certificate is kept. |
| – | `TLS` | `on` | `off` serves plain HTTP/WS. Only for use behind your own TLS proxy: the HTTPS-hosted app can't connect to a plain `ws://` address. |

To use your own certificate, put `key.pem` and `cert.pem` in the `certs`
volume. If you change `LOCALCHATTER_HOST`, run `docker compose down -v` first
so a new certificate is made for the new address (devices will need to accept it again).

### Endpoints

| Path | Purpose |
| --- | --- |
| `/` | Setup page with the **Set up LocalChatter** button and the server address. |
| `/ws` | WebSocket the app connects to. |
| `/config.json` | Room name, relay address, number connected. |
| `/health` | Returns `ok` (used by the Docker health check). |

## Privacy

- The server forwards each message to everyone else connected and then drops it.
  It writes nothing to disk except its TLS certificate, and logs only how many
  people are connected: never names or message contents.
- The app keeps messages in memory only. Close or reload it and they're gone.
  It saves just your name and the server address on the device.
- Someone who joins later sees nothing sent before they arrived.
- Traffic is encrypted between each device and the server (TLS). The server
  itself can read messages as it passes them on, so run it on a machine you trust.

## How it works

```
 phone ──┐                         ┌── laptop
         │   wss://192.168.1.50    │
 tablet ─┼──────► relay server ◄───┼── phone
         │     (Docker, no disk)   │
```

Each device opens a secure WebSocket to the relay. Text is sent as JSON;
images and files are base64-encoded inside the same JSON message. The relay
checks each message, keeps only the expected fields, stamps the sender's name
and the time, and sends it to everyone else. Effects are ordinary messages
(`/fire` etc.) that each app recognises and animates, so the server needs no
special support for them. Polls have their own message type (new poll, vote,
close, clear, and the reminder for someone who joins); the relay checks and
passes these on like everything else, but keeps no polls and counts no votes.
