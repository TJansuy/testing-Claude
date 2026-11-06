# Hello World PWA

A minimal, dependency-free Progressive Web App with a counter.

## Counter

The **−**, **Reset** and **+** buttons change a counter on the page. Its value is
saved in the browser's `localStorage` under the key `hello-pwa-counter`, so it:

- persists across reloads and app restarts,
- works with no internet connection (storage is on the device),
- stays in sync between open tabs of the app.

The value is stored per browser and per origin, so it isn't shared between
devices, and clearing site data resets it.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The app page. |
| `styles.css` | Styling (light and dark). |
| `src/app.ts` | Counter logic, service worker registration, status display, install button (TypeScript). |
| `src/sw.ts` | Service worker: caches the app shell so it works offline (TypeScript). |
| `app.js`, `sw.js` | Built from `src/` by `npm run build` at the repository root. Committed so it runs without a build step. |
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

After editing `src/`, run `npm run build` (and `npm run check`) from the repository root.
When you change any cached file, bump `CACHE` in `src/sw.ts` (e.g. `hello-pwa-v2`)
so returning visitors get the new version.
