# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Unofficial 30nama.com client for Samsung Tizen TVs. A plain HTML/CSS/JS web app (no bundler, no npm deps, no test suite, no linter) at 1920x1080, driven by the remote D-pad only. It ships three ways: a TizenBrew module (root `package.json`, `appPath` = `tizen-app/index.html`, served via jsDelivr), a prebuilt `.wgt` (manual GitHub workflow `.github/workflows/release.yml`), or built from source with Tizen Studio.

## Commands

- Run in a desktop browser: `cd tizen-app && node tools/devserver.js 8080`, then open http://localhost:8080/. Node 18+. Arrow keys/Enter/Backspace (=Back) work; the QR screen has a Guest button. Streaming needs a logged-in subscription (scan the QR with a phone logged in to 30nama.com).
- Build/sign/install on a TV: `./build.sh <security-profile> [<tv-ip>:26101]`. Targets Windows + Git Bash (`TIZEN_HOME` defaults to `/c/tizen-studio`, uses `tizen.bat`, `cygpath`); it won't run as-is on macOS. `./install-wizard.sh` is the guided certificate/profile setup.
- Regenerate icons: `node tizen-app/tools/make-icons.js`. Regenerate TMDB mock fixtures: `node tizen-app/tools/make-fixtures.js <token>`.
- There are no tests. `tools-video/` is a separate puppeteer-core toolset (hardcoded Windows Chrome path) for recording demo tours: `node go.js <tour> [dry] [outDir]`.

## Architecture

All code is global-namespace `N` (`window.N`), loaded by ordered `<script>` tags in `tizen-app/index.html`; load order matters (config → i18n → tmdb-token → api → tmdb → nav → stage → ui → logo → player → screens → app → takeover → preview). No modules.

- `config.js`: constants, API keys, key codes, `N.store` (localStorage) and DOM helpers (`N.$`, `N.el`). Decides whether to route requests through the dev proxy (only when hostname is localhost; disabled under TizenBrew's `127.0.0.1:8081/module/...` origin).
- `api.js`: endpoint discovery with fallback hosts, session in localStorage. Requests go through a scheduler with retry/backoff (30nama is behind Cloudflare rate limiting).
- `nav.js`: custom spatial navigation. Elements can override movement with `onnav(dir)`, hook focus via `onfocus2`; containers have `reveal`; scopes isolate sheets/modals; `body.fast` is set on key-repeat.
- `stage.js`: one persistent global backdrop behind all screens except the player (the "One Stage" concept in `design/DESIGN.md`); screens are overlays that feed it images.
- `screens.js` (largest file): QR login, Home, Details (+ seasons/episodes sheet), Search, Archive, Settings. `app.js`: boot, router with transitions, icon rail, exit/sign-out sheets, splash, Home cache (`N.getHome`, 90 s, falls back to last good copy).
- `player.js`: uses Samsung AVPlay when `window.webapis.avplay` exists, otherwise `<video>` + bundled hls.js (the TizenBrew case). Contains subtitles overlay, resume, skip intro, Up Next, audio/subtitle sheet (Up) and episodes sheet (Down).
- `preview.js` + `service/preview.js`: Smart Hub Preview (rows above the app tile on the TV home bar, `.wgt` only). The app builds the JSON and launches the short-lived `PreviewService`, which calls `webapis.preview.setPreviewData`; tile clicks come back as a `PAYLOAD` app control. Samsung wants 10 min between sets, so changes are throttled. Details in `tizen-app/README.md`; desktop test: `node tizen-app/tools/preview-mock.js`.
- `tmdb.js`: optional enrichment, fully off without a token. Token comes from the git-ignored `js/tmdb-token.js` (copy `tmdb-token.example.js`) or `localStorage.tmdbToken`; `localStorage.tmdbMock='1'` serves `tools/fixtures/*.json`. Mapping between 30nama and TMDB titles is by IMDb id, then fuzzy title/year match.
- `tools/devserver.js`: static server plus `/proxy?url=` (adds CORS, rewrites m3u8 URIs). Intentionally uses Node's `https`, not `fetch`, because Cloudflare blocks undici's TLS fingerprint. `build.sh` and the release workflow strip `tizen-app/tools/` from the package.

## Constraints and conventions

- Target is Tizen's old Chromium (~M94): no CSS nesting, `:has`, container queries, or `backdrop-filter`. Only `transform`/`opacity` are animated (`design/DESIGN.md` is the spec for tokens, motion, focus rings).
- Persian (RTL) is first-class: use logical CSS properties and `--dir`; never set letter-spacing on Persian text; `lang=fa` swaps in the Farsi-digit font variant. All strings go through `i18n.js` (en/fa).
- Text truncated with `…` on or next to a focusable item (titles, names, labels) must scroll automatically while that item is focused, everywhere in the app. Build the text with `ui.mq(text, cls)` and set `el._mq` (one element or a list) on the focusable; `nav.focus` measures it via `ui.mqFit`, and only text that actually overflows scrolls. Single-line text scrolls sideways; add class `mqv` to line-clamped text to scroll it vertically instead. Change marquee text with `ui.mqText`, never `textContent`. The CSS (`.mq-on`/`.mqv-on` in `app.css`) matches descendants of `.f.focus` and the sibling right after it; text outside the nav system (e.g. `#upnext.show`) needs its own selector and an explicit `ui.mqFit` call. Reduce motion (`body.calm`) keeps the ellipsis.
- Back handling is layered (player → sheets → content → rail → exit confirm); the rail collapses whenever focus leaves it. Check these layers when touching focus/Back behavior.
- Never commit or bundle a TMDB token; the release workflow fails if JWT-like strings or `tmdb-token.js` end up in the `.wgt`.
- Version lives in both root `package.json` and `tizen-app/config.xml`; keep them in sync on release.
- `tizen-app/README.md` and `docs/TIZENBREW.md` hold deeper notes (TizenBrew origin/CORS consequences, TMDB cache TTLs).
