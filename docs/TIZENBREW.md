# TizenBrew module notes

Research date: 2026-10-11. All facts are from the primary sources linked inline.

## Module format (application modules)

Source: [TizenBrew docs/MODULES.md](https://github.com/reisxd/TizenBrew/blob/main/docs/MODULES.md).
An app module is a normal npm-style package whose `package.json` has:

| Field | Meaning | Our value |
|---|---|---|
| `packageType` | `app` (served web page) or `mods` (JS injected into a site) | `app` |
| `appName` | user-facing name | `30nama` |
| `appPath` | path to the entry html inside the package | `tizen-app/index.html` |
| `keys` | key names registered via `tizen.tvinputdevice.registerKey` | media keys + red/green |
| `serviceFile` | optional Node service | not used |
| `evaluateScriptOnDocumentStart` | only for injected scripts | not used |

The repo-root `package.json` is that manifest. Nothing else is needed; `tizen-app/` stays the source of the `.wgt` too.

## How modules are fetched and served

Source: TizenBrew service code,
[moduleLoader.js](https://github.com/reisxd/TizenBrew/blob/main/tizenbrew-app/TizenBrew/service-nextgen/service/utils/moduleLoader.js)
and [service index.js](https://github.com/reisxd/TizenBrew/blob/main/tizenbrew-app/TizenBrew/service-nextgen/service/index.js).

- A module id is `npm/<package>` or `gh/<user>/<repo>`. The module manager UI ("Add GitHub Module") prepends `gh/` to what the user types ([ModuleManager.jsx](https://github.com/reisxd/TizenBrew/blob/main/tizenbrew-app/TizenBrew/tizenbrew-ui/src/pages/ModuleManager.jsx)), so users enter `msharifi99/30nama-tizenos`.
- Metadata is read from `https://cdn.jsdelivr.net/<id>/package.json`. GitHub modules are therefore served through the **jsDelivr CDN** (default branch, cached by jsDelivr). No GitHub API or auth is involved; the repo must be public.
- The app runs from a local proxy on the TV: `http://127.0.0.1:8081/module/<url-encoded id>/<appPath>`, which fetches each file from jsDelivr and sets `Access-Control-Allow-Origin: *` and a content type from the file extension.
- Launch: the TizenBrew UI registers the module's `keys` and then does `location.href = appPath` ([Modules.jsx](https://github.com/reisxd/TizenBrew/blob/main/tizenbrew-app/TizenBrew/tizenbrew-ui/src/components/Modules.jsx)). The page therefore runs inside the TizenBrew widget with TizenBrew's privileges from its [config.xml](https://github.com/reisxd/TizenBrew/blob/main/tizenbrew-app/TizenBrew/config.xml) (`internet`, `tv.inputdevice`, `network.public`, ..., `access origin="*"`), not ours.

## Consequences for this app (and what was changed)

1. **Origin is `127.0.0.1:8081`.** `config.js` used to enable the desktop dev proxy for any `127.0.0.1` host, which would break every API call on the TV. Fixed: the proxy is off when the path starts with `/module/` or the port is 8081.
2. **`$WEBAPIS/webapis/webapis.js` does not resolve** on an http page (it is a platform placeholder for packaged apps). `webapis.avplay` is expected to be unavailable, and the player already falls back to `<video>` + hls.js (`player.js`, `hasAV()`). The TizenBrew widget does not declare an avplay privilege either. Verified locally: with that script 404 the app boots and `hasAV()` is false.
3. **`tizen.tvinputdevice`**: TizenBrew's UI registers the `package.json` `keys` before navigating, and the app also calls `registerKey` itself (wrapped in try/catch).
4. **Exit**: the Back-to-exit confirm calls `tizen.application.getCurrentApplication().exit()`, which closes TizenBrew itself. Acceptable.
5. **TMDB**: `js/tmdb-token.js` is git-ignored, so it 404s via jsDelivr (harmless). Users enable TMDB from Account > TMDB metadata, which validates the key and stores it in the `tmdbToken` localStorage key. The 32-character API Key is the practical choice with a remote; the long Read Access Token also works via the Keyboard option or paste.
6. `index.html` uses relative paths only, so it works under the `/module/<id>/tizen-app/` prefix.

## Verification done / not done

- `package.json` checked against the documented fields (`packageType=app`, `appName`, `appPath` exists on disk).
- Emulated TizenBrew's proxy URL layout locally (`http://127.0.0.1:8081/module/gh%2F.../tizen-app/index.html`) in a desktop browser: app boots to the sign-in screen, `useProxy=false`, `webapis` absent, only the expected 404s.
- NOT verified on a real TV (by design): HLS playback without AVPlay; CORS of the 30nama API and HLS hosts from an `http://127.0.0.1:8081` origin (the discovery JSON sends `Access-Control-Allow-Origin: *`, the API hosts could not be probed); remote keys; jsDelivr serving `.html`/`.woff2` through the proxy.
- If playback or CORS fails under TizenBrew, use the prebuilt `.wgt` route instead.

## Updating

jsDelivr caches the default branch for a while. After pushing, purge with `https://purge.jsdelivr.net/gh/msharifi99/30nama-tizenos/package.json` (and other changed files).

## Prebuilt .wgt route

[Apps2Samsung](https://github.com/Apps2Samsung/Apps2Samsung) (formerly Jellyfin2Samsung / Samsung Jellyfin Installer; Windows, Linux, macOS, Android) installs "your own `.wgt`" ([README](https://github.com/Apps2Samsung/Apps2Samsung#readme)). From its source ([WgtInstaller.cs](https://github.com/Apps2Samsung/Apps2Samsung/blob/beta/Apps2Samsung.Mobile/Services/WgtInstaller.cs), [WgtPrivileges.cs](https://github.com/Apps2Samsung/Apps2Samsung/blob/beta/Apps2Samsung.Core/Packaging/WgtPrivileges.cs)): it reads the privileges in `config.xml` to pick a Public or Partner certificate, then **re-signs** the package with the author and distributor certificates for your TV and installs it. So the input is any structurally valid `.wgt`; the original signature is replaced. The release workflow therefore signs with a throwaway author certificate generated on the CI runner and discarded. This app only needs Public-level privileges. From its FAQ: Developer Mode must be on with the PC's IP set (entered reversed in some cases), and Tizen 7+ needs a Samsung account sign-in to create the certificate.
