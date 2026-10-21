# 30nama native app for Samsung Tizen TV

A Samsung Tizen TV app: an unofficial client for 30nama.com.

![30nama TV](docs/images/poster.png)

> **Disclaimer:** This is an unofficial, community project. It is not affiliated with, endorsed by, or supported by 30nama. You need your own valid 30nama subscription to use it. No content is bundled with this app.

## Features

- Sign in by scanning a QR code with your phone
- TV UI: hero banner, rows, details pages, search, remote-friendly navigation
- Samsung AVPlay player with HLS playback at the highest available quality
- Persian (fa) and English (en) subtitles
- Persian UI with full right-to-left support
- Optional TMDB enrichment: trending rows, cast and crew, reviews, recommendations

## Screenshots

| Home | Browse |
|---|---|
| ![Home](docs/images/home-hero.png) | ![Browse](docs/images/home-browse.png) |
| **Details** | **Search** |
| ![Details](docs/images/details.png) | ![Search](docs/images/search.png) |

## Install

### Option 1: TizenBrew (simplest)

1. Turn on Developer Mode on the TV: open Apps, type `12345`, switch Developer mode on, enter your PC's IP address, then reboot the TV.
2. Install [TizenBrew](https://github.com/reisxd/TizenBrew/blob/main/docs/README.md) on the TV with the TizenBrew Installer (one-time).
3. In TizenBrew open Module Manager, Add GitHub Module, and enter `msharifi99/30nama-tizenos`.
4. Launch "30nama" from the TizenBrew home screen.

Playback uses the TV's HTML5 player here (AVPlay is not available inside TizenBrew).

### Option 2: prebuilt .wgt

1. Turn on Developer Mode on the TV: open Apps, type `12345`, switch Developer mode on, enter your PC's IP address, then reboot the TV.
2. Download `30nama-v*.wgt` from the [latest release](https://github.com/msharifi99/30nama-tizenos/releases/latest).
3. Install [Apps2Samsung](https://github.com/Apps2Samsung/Apps2Samsung/releases/latest) (Windows, Linux, macOS or Android). It handles your Samsung certificate and re-signs the package for your TV.
4. In Apps2Samsung select your TV, choose a custom `.wgt`, pick the downloaded file and install. Tizen 7+ TVs ask you to sign in to a Samsung account once to create a certificate.

### Option 3: build from source

First turn on Developer Mode on the TV: open Apps, type `12345`, switch Developer mode on, enter your PC's IP address, then reboot the TV.

Requires [Tizen Studio](https://developer.tizen.org/development/tizen-studio/download) (CLI tools + TV extension), a Samsung certificate that includes your TV's DUID, and Bash. `build.sh` supports Unix SDK paths and Windows Git Bash; set `TIZEN_HOME` or `TIZEN_CLI` if needed. The guided install wizard requires Windows Git Bash.

```
./install-wizard.sh                              # guided: reads the DUID, creates certificate and profile
./build.sh <security-profile> [<tv-ip>:26101 | sdb-target-name] # manual build; with a target it also installs and launches
```

## Optional: TMDB setup

TMDB adds trending rows, cast, reviews and recommendations. It is off by default and the app works fully without it. You can turn it on from the app itself, with any install method (TizenBrew, `.wgt` or built from source):

1. Create a free account at themoviedb.org and open Settings, API. Copy your **API Key** (32 characters) or the longer **API Read Access Token**.
2. On the TV open **Settings > TMDB metadata**. The page also shows a QR code that opens your TMDB API settings on your phone.
3. Enter the key and choose **Check and save**. The 32-character API Key is easy to type with the on-screen keyboard; for the long Read Access Token use **Keyboard** or paste it.
4. The app checks the key with TMDB and shows **Connected** with the last characters of the key. Home and Details then show the extra content. Use **Remove key** to turn it off again, or **Clear metadata cache** to refresh the data.

The key is stored only on your TV.

**Build-from-source alternative.** To bake a token into your own build instead, copy `tizen-app/js/tmdb-token.example.js` to `tizen-app/js/tmdb-token.js`, paste the token between the quotes (`N.config.tmdbToken = '...';`) and rebuild. A key set in Settings overrides it. Never commit this file or share a build that contains it.

## Development

Run the app in a desktop browser with a small proxy (no dependencies, Node 18+):

```
cd tizen-app
node tools/devserver.js 8080
```

Then open http://localhost:8080/. The proxy forwards API and HLS requests to avoid CORS. See `tizen-app/README.md` for developer notes and `design/DESIGN.md` for the design spec.

## Structure

```
tizen-app/    the Tizen web app (config.xml, index.html, js/, css/, fonts/, tools/)
design/       design spec
docs/        README screenshots, TizenBrew notes
package.json TizenBrew module manifest
.github/     release workflow (auto-releases on merge to main)
media/        poster
build.sh      build, sign and install
install-wizard.sh  guided TV setup
```

## License

Released under the [MIT License](LICENSE). The Vazirmatn font in `tizen-app/fonts/` is licensed under the SIL Open Font License (see `tizen-app/fonts/OFL.txt`).

## Compatibility

| Samsung TV | Tizen | Chromium | Validation |
|---|---|---|---|
| 2022 | 6.5 | 85 | English/Persian UI regression checks; installed and launched on a physical TV |

Browser versions: [Samsung web-engine specifications](https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html).
