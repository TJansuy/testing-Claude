# Hello World PWA

A minimal, dependency-free Progressive Web App.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The app page. |
| `styles.css` | Styling (light and dark). |
| `app.js` | Registers the service worker, shows status, handles the install button. |
| `sw.js` | Service worker: caches the app shell so it works offline. |
| `manifest.webmanifest` | App name, colours, icons, display mode. |
| `icons/` | SVG icon plus 192px and 512px PNGs. |

## Running without a server

Open `index.html` directly in a browser (double-click it). The page works fully.

Browsers only allow service workers and app install in a secure context
(`https://` or `http://localhost`), so from `file://` the app shows
"Service worker: skipped" and can't be installed or cached offline.
That's a browser rule, not a bug in the app.

## Hosting on GitHub Pages

Copy this folder into your Pages repo. Every path is relative, so it works
at any sub-path, e.g. `https://<user>.github.io/<repo>/PWA/Sample/`.
Once served over HTTPS, the service worker registers, the app works offline,
and browsers offer to install it.

To test locally first, run `python3 -m http.server` from the repo root and open
`http://localhost:8000/PWA/Sample/`.

## Updating

When you change any cached file, bump `CACHE` in `sw.js` (e.g. `hello-pwa-v2`)
so returning visitors get the new version.
