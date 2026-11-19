# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A frontend-only world choropleth map: users enter a number per country, countries are colored on a gradient between the min and max entered values, and **all state lives in the URL hash** so a shared link reproduces the same map. There is no backend, API, build step, package.json, or test suite.

## Commands

- `./run.sh` — builds the `mapinfo` image if missing, creates the `mapinfo` container if missing, runs it attached on http://localhost:8088. Ctrl+C / SIGTERM stops the container.
- `./run.sh --rebuild` — force image rebuild (needed after editing any served file, since files are COPY'd into the image, not mounted).
- `PORT=9000 ./run.sh` — different host port (port 8080 is occupied on the dev machine; that's why the default is 8088).
- `node --check app.js` — quick syntax check.

`run.sh` re-creates the container automatically when its port or image ID no longer matches. It runs `docker start -a` in the background and `wait`s on it so the INT/TERM trap fires immediately — keep that pattern if editing. Don't edit `run.sh` while an instance is running (bash reads scripts incrementally and the running process breaks).

## Architecture

- `index.html` loads `vendor/d3.min.js`, `vendor/topojson-client.min.js` as classic scripts (globals `d3`, `topojson`), then `app.js` (an IIFE, not an ES module).
- `vendor/` does **not exist in the repo**: the Dockerfile's `fetch` stage downloads pinned d3@7.9.0, topojson-client@3.1.0 and world-atlas@2.0.2 `countries-110m.json` from jsdelivr. To run the page outside Docker you must fetch these into `vendor/` yourself.
- `.dockerignore` is an allowlist (`*` then `!file`) — a new served file must be added there and to the Dockerfile `COPY` line.
- `help.html` is the user/LLM help page, served at `/help` by an exact-match nginx `location` and linked from the round "?" button and `<link rel="help">`. It documents the URL hash format, the defaults and the full list of country keys. **Any change to the hash format, defaults, UI controls or the atlas must be mirrored there**, because LLMs build links from it. The country list was generated from the atlas (`keyOf()` order: ISO numeric, else name slug).
- nginx serves static files only; missing paths return 404 (no SPA fallback needed since state is in the hash).

### app.js data flow

`state` (`u` units, `a`/`b` gradient hex colors, `n` no-data color, `data: Map<key, number>`) is the single source of truth.
- `parseHash()` ← `location.hash` on load and on `hashchange`.
- Every UI change mutates `state` → `saveHash()` (`history.replaceState`, so no `hashchange` fires) → `render()`.
- `layout()` recomputes projection/paths on resize; `render()` recolors countries, updates labels and legend; `updateLabels()` runs on every zoom frame. It works in screen space: labels sit in a `<g>` outside the zoomed `root`, and `screenProj` is the projection combined with the zoom transform and clipped to the viewport. Each label goes at the centroid of its country's largest *visible* polygon. A label that doesn't fit that polygon's bounds is hidden and its country is listed in the bottom `#overflow` strip, which shows a swatch, the name and the value. Off-screen countries appear in neither. The strip's height is exposed as the CSS var `--strip-h` so the legend and zoom controls sit above it.
- Default colors are soft red → soft green (`e57373` → `81c784`). They changed from `ffffcc` → `bd0026` in Nov 2026, so links made before that which omitted `a`/`b` now render with the new defaults.

URL hash format (keep backward compatible — shared links depend on it):
`#u=<uri-encoded units>&a=ffffcc&b=bd0026&n=d3d3d3&d=840:331.9,276:83.2&v=3.2,10.45,51.17`
Params equal to `DEFAULTS` are omitted. `v=<zoom>,<lon>,<lat>` is the zoom level and the geographic point at the screen center (omitted at the default whole-world view); it's converted to/from the d3.zoom transform via `projection`/`projection.invert` (`viewToTransform`/`transformToView`) so it's independent of window size. It's written on zoom `end`; `applyingView` suppresses writes when code applies a view (on layout/resize and `hashchange`). Country keys are ISO 3166-1 numeric ids without leading zeros; the three world-atlas features without an id (N. Cyprus, Somaliland, Kosovo) use a lowercase letters-only slug of their name (`keyOf()`). Antarctica is filtered out.

## Testing

No automated tests. Verify in a browser against the running container. The Claude-in-Chrome extension cannot reach this machine's localhost; use local headless `google-chrome` instead (`--headless=new --screenshot=...` for a snapshot, or `--remote-debugging-port` + `node --experimental-websocket` to drive CDP for click/type flows).
