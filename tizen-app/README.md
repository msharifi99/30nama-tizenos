# 30nama for Samsung Tizen TV (unofficial)

Plain HTML/CSS/JS web app (no build step). Base resolution 1920x1080.

## Structure
- `config.xml`, `icon.png` (117), `icon-512.png`: Tizen widget manifest and placeholder icons (`node tools/make-icons.js` regenerates).
- `index.html`: shell (global `#stage` backdrop, icon `#rail`, `#content`, player layer, splash, AVPlay `<object>`, SVG icon sprite).
- `css/app.css`: "One Stage" design (tokens, fonts, focus rings, motion; only transform/opacity are animated; RTL via logical properties and `--dir`). Spec: `design/DESIGN.md`.
- `fonts/`: bundled Vazirmatn woff2 (Regular/Medium/Bold/ExtraBold + Farsi-digit `FD` variants, SIL OFL 1.1).
- `js/config.js`: constants, API keys (WEBTV verified, ANDROIDTV fallback), key codes, storage and DOM helpers, toast.
- `js/i18n.js`: en/fa strings, `N.setLang` (sets `lang`/`dir`).
- `js/api.js`: endpoint discovery with fallback hosts, `test` probing, `N.api.get/call`, session (`localStorage`).
- `js/nav.js`: spatial navigation with per-element `onnav(dir)` overrides, `onfocus2` focus hook, container `reveal`, scopes, key-repeat "fast" mode (`body.fast`), `tizen.tvinputdevice.registerKey`.
- `js/stage.js`: persistent backdrop (two layers, decode-then-crossfade, Ken Burns, poster-bleed fallback).
- `js/ui.js`: icons, card factory (poster/land/top/grid/tile), meta line, start-anchored tracks, vertical scroll helper, episode tiles.
- `js/player.js`: AVPlay backend (when `window.webapis.avplay` exists) or `<video>` + hls.js; WebVTT overlay (en/fa/off, size from settings), resume, scrubber with seek bubble, skip intro/recap pill, Up Next card with autoplay countdown, audio/subtitle sheet (Up), episodes sheet (Down), observer heartbeat (10 s).
- `js/screens.js`: QR login, Home (billboard + rows + Top 10 + continue watching), Details (+ seasons/episodes sheet and Watchlist/Favorite toggles), Search (on-screen keyboard), Archive (genres + paged grid + sort), My list (Watchlist/Favorites), Settings (two panes).
- `js/app.js`: boot, router with page transitions, icon rail (expands on focus), exit/sign-out confirm sheets, splash, Back handling (content -> rail -> exit confirm).
- `js/preview.js` + `service/preview.js`: Smart Hub Preview rows above the app tile on the TV home bar (see below).
- `js/lib/`: `qrcode.js` (qrcode-generator 1.4.4), `hls.min.js` (hls.js 1.5.17), both bundled locally.
- `tools/devserver.js`: static server plus `/proxy?url=` (adds CORS, rewrites m3u8 URIs). The app routes all requests through it only when `location.hostname` is localhost.

## Test in a desktop browser
    node tools/devserver.js 8080
    open http://localhost:8080/
Window is scaled to fit. Arrow keys / Enter / Backspace (= Back) work. Guest button on the QR screen shows Home. Streaming requires a logged-in subscription, so scan the QR with the phone logged in to 30nama.com. Console helper: `N.player.start(post, items, 0)` with any m3u8 to exercise the player.

## Run on a TV
Open `tizen-app/` as a project in Tizen Studio (TV extension), sign with your Samsung certificate, enable Developer Mode on the TV (Apps, type 12345, set host IP), then Run on TV. Or `tizen package -t wgt -- tizen-app` and `tizen install`/`sdb`.

## Known unknowns
See "Live verification" in `analysis/FINDINGS.md`. Logged-in payload shapes (stream, user, continue_watching, subtitle values) are handled defensively but untested live.

## TMDB enrichment (optional)
`js/tmdb.js` adds TMDB data on top of 30nama. It is fully off when no token is configured (Home/Details behave as before).
- Token: `N.config.tmdbToken` (kept empty in `js/config.js`), set in `js/tmdb-token.js` (loaded after config.js), or `localStorage.tmdbToken` (override, written by Settings > TMDB metadata after TMDB accepts it). Either a v3 "API Key" (32 hex, sent as `api_key`) or a v4 "API Read Access Token" (Bearer). TMDB supports CORS, the dev proxy is not used; `config.xml` allows `*`.
- Mock mode: `localStorage.tmdbMock = '1'` serves `tools/fixtures/*.json` (regenerate with `node tools/make-fixtures.js <token>`). 30nama itself is still called live.
- 30nama -> TMDB: IMDb id from `score.imdb.link` -> `/find`, else `/search/movie|tv` (with year, then without), best normalized-title match. TMDB -> 30nama: `search` action, title similarity + year (+-1) + movie/series kind, streamable preferred, coming-soon skipped. Resolutions run through a 4-wide pool with start spacing and back-off (30nama is behind Cloudflare rate limiting). Caches: memory LRU + localStorage `n30.tc.*` (details 7 d, trending lists 6 h, 30nama resolutions 7 d, misses 1 d); Settings > TMDB metadata has "Clear metadata cache".
- UI: Home rows Trending this week / New & returning series / Popular movies now (rows with <5 resolvable items are omitted; hero billboard uses trending with backdrops + title logos when >=3 resolve). Details: logo, tagline, TMDB rating, next-episode badge, Cast, Crew, Reviews (OK opens a sheet), More like this (only titles found on 30nama).

## Smart Hub Preview (.wgt installs only)
Rows shown above the 30nama tile when it is highlighted on the TV's home bar (Samsung "Personal Preview"). Not available under TizenBrew: the preview belongs to the installed app, which there is TizenBrew itself.
- Rows: signed in, Continue watching (the 2 most recent **series**, 16:9, playable; a >=95% watched episode shows "Next episode" and starts the one after it), Popular movies now (the Home TMDB row; without TMDB or with <5 matches, 30nama Top 10 minus series topped up from Movies), New releases (the guest `home_stream` has none: latest Movies and Series, interleaved). Guest: the last two. Max 10 tiles per row, no title repeats across rows. Images are 30nama JPG URLs (Smart Hub decodes JPG/PNG only), fetched by the TV without cookies.
- Flow: `js/preview.js` builds the JSON (`N.preview.build`) after Home loads, 5 s after the player closes, and on sign-out (forced, so the history leaves the TV at once). It launches `Nama30TvAp.PreviewService` (operation `pick`, data `caller=ForegroundApp`, `preview=<json>`); `service/preview.js` saves it to `/home/owner/share/30nama-preview.json`, calls `webapis.preview.setPreviewData`, replies `status=ok|error: ...` and exits. The TV also starts the service itself about every 10 minutes; it then re-applies the saved copy.
- Samsung asks for 10 minutes between `setPreviewData` calls: an unchanged JSON is never re-sent, and a change inside that window waits for it (or goes out when the app is hidden or exited). Last result: `localStorage['n30.pvStatus']`. Last built JSON (also on desktop): `N.preview.last`.
- Tile click: `action_data` is `{"a":"play"|"details","id":<post id>,"next"?:1}`. It arrives as the `PAYLOAD` app-control key, at boot (`N.preview.onBoot`, after Home/login is on the stack) or as an `appcontrol` event while running (`config.xml` declares `eden_resume` with `reload="disable"`). Play opens Details with autoplay, so Back lands on Details.
- `service/takeover.js` exits on any launch that is not the UI's `operation/service` while takeover is off, in case the TV starts that service for previews.
- Test the service on a desktop: `node tools/preview-mock.js [preview.json]`.
