# 30nama TV: Design Spec

The target is a premium, cinematic UI for a Tizen 1920x1080 web app that is driven by the D-pad only. The spec is written for one implementation pass in vanilla JS and CSS. Everything here can be built on Chromium M94. It uses no CSS nesting, no `:has`, no container queries and no `backdrop-filter`.

---

## 1. Concept: "One Stage"

The app is a dark projection room, and the films provide the color. The chrome stays quiet, warm and near-black. A single brand-red accent (30nama red) works like the glow of a projector lamp. It appears only where the user should look: the progress fill, the primary action, the live indicator.

The architecture follows the concept. There is **one global stage** (a full-bleed backdrop layer) behind every screen except the player. Screens are glass panes of text and cards laid over it. When the user moves focus, opens a details page, or returns home, the stage does not reload. It crossfades or simply stays where it is. That continuity is what makes the app feel expensive.

### Signature moment: the Living Backdrop
On Home, as focus moves across cards in any row, the stage **crossfades to the focused title's wide cover image**, which drifts slowly (Ken Burns). At the same moment the billboard text above the rows (title, meta, plot) re-sets itself with a short staggered rise. Pressing OK opens Details. The backdrop is already the right image, so Details just slides its content in over it with no flash and no reload. It feels like walking into the film.

Everything else stays restrained. There is no parallax, no bouncy springs, no glow storms. There is one secondary delight: on play and pause, a soft glyph pulse appears in the player's center.

---

## 2. Fonts

**Vazirmatn** (SIL Open Font License 1.1) covers both Persian and Latin in one family, and its Latin is Roboto-derived. Using one family keeps mixed fa/en strings visually consistent.

- Source: https://github.com/rastikerdar/vazirmatn/releases. Take the latest release zip and use `fonts/webfonts/*.woff2`.
- Bundle these static weights (static is safer than the variable font on older Tizen):
  - `Vazirmatn-Regular.woff2` (400), `-Medium` (500), `-Bold` (700), `-ExtraBold` (800).
- Also bundle the **Farsi-digits variant** `Vazirmatn-FD` Regular and Bold (in the same release under `misc/Farsi-Digits/` or `Vazirmatn-FD`). It is used only when `lang=fa`, so numbers render as Persian digits.
- Location: `tizen-app/fonts/`. Load with `@font-face { font-display: block; }`. They are local files, so the block period is only milliseconds. The splash covers it.

```css
@font-face{font-family:"Vz";src:url(../fonts/Vazirmatn-Regular.woff2) format("woff2");font-weight:400;font-display:block;ascent-override:112%;descent-override:43%;line-gap-override:0%}
@font-face{font-family:"Vz";src:url(../fonts/Vazirmatn-Medium.woff2) format("woff2");font-weight:500;font-display:block;ascent-override:112%;descent-override:43%;line-gap-override:0%}
@font-face{font-family:"Vz";src:url(../fonts/Vazirmatn-Bold.woff2) format("woff2");font-weight:700;font-display:block;ascent-override:112%;descent-override:43%;line-gap-override:0%}
@font-face{font-family:"Vz";src:url(../fonts/Vazirmatn-ExtraBold.woff2) format("woff2");font-weight:800;font-display:block;ascent-override:112%;descent-override:43%;line-gap-override:0%}
@font-face{font-family:"VzFD";src:url(../fonts/Vazirmatn-FD-Regular.woff2) format("woff2");font-weight:400 600;font-display:block;ascent-override:112%;descent-override:43%;line-gap-override:0%}
@font-face{font-family:"VzFD";src:url(../fonts/Vazirmatn-FD-Bold.woff2) format("woff2");font-weight:700 800;font-display:block;ascent-override:112%;descent-override:43%;line-gap-override:0%}
html{font-family:"Vz",sans-serif}
html[lang=fa]{font-family:"VzFD","Vz",sans-serif}
```

The bundled font files use matching 112% ascent and 43% descent metrics. This keeps the correction effective on Tizen Chromium, which does not support the `@font-face` metric-override descriptors.

Rules:
- **Never set letter-spacing on Persian text.** Tracking breaks Arabic-script joining. Latin-only eyebrows may use `.04em`.
- Use `font-variant-numeric: tabular-nums` on all times and counters (player, countdowns).
- Persian needs more leading. Use `[lang=fa]` overrides (see the type scale).

---

## 3. Tokens

```css
:root{
  /* color */
  --bg-0:#07080b;          /* base, also the scrim color */
  --bg-1:#0e1016;
  --surface:#161922;       /* tiles, sheets */
  --surface-2:#20242f;     /* raised / skeleton */
  --line:rgba(255,255,255,.08);
  --text-1:#f4f1ea;        /* warm white, primary */
  --text-2:rgba(244,241,234,.72);
  --text-3:rgba(244,241,234,.46);
  --accent:#F0454A;        /* 30nama red; --accent-2:#C8323A darker; --accent-ink:#fff (white on accent ~3.7:1, ok for the 26px+ semibold button labels) */
  --accent-ink:#1a1205;    /* text on accent */
  --focus:#ffffff;
  --focus-ink:#0b0c10;     /* text on white focus fill */
  --good:#62d39b;          /* "free" badge */
  --danger:#ff6b5e;

  /* type (px at 1080p; never below 22) */
  --t-display:72px;  /* billboard / details title, 800, lh 1.08 (fa 1.3) */
  --t-xl:56px;       /* screen titles, 700 */
  --t-l:40px;        /* section heads in details/settings, 700 */
  --t-m:32px;        /* row headers, 700 */
  --t-body-l:28px;   /* plot, menu items, 400, lh 1.5 (fa 1.7) */
  --t-body:26px;     /* meta line, buttons 600 */
  --t-cap:22px;      /* card titles, badges, hints 500 */

  /* spacing: 8px grid */
  --s1:8px;--s2:16px;--s3:24px;--s4:32px;--s5:48px;--s6:64px;--s7:96px;
  --safe-x:96px; --safe-y:54px;          /* 5% title-safe */
  --rail:120px;                          /* collapsed sidebar */
  --start:184px;                         /* content start edge = rail + 64 */

  /* radii */
  --r-card:12px; --r-tile:16px; --r-sheet:24px; --r-pill:999px; --r-btn:14px;

  /* motion */
  --e-out:cubic-bezier(.2,.8,.2,1);      /* default: focus, small moves */
  --e-emph:cubic-bezier(.16,1,.3,1);     /* big travel: rows, sheets, pages */
  --e-io:cubic-bezier(.65,0,.35,1);      /* crossfades */
  --d-fast:120ms; --d-focus:180ms; --d-move:320ms; --d-page:420ms; --d-fade:700ms;

  /* RTL sign for transforms (transforms are not logical) */
  --dir:1;
}
html[dir=rtl]{--dir:-1}
body.fast{--d-focus:90ms;--d-move:140ms}      /* key-repeat, see 7.3 */
body.calm{--d-focus:1ms;--d-move:1ms;--d-page:1ms} /* Settings > Reduce motion */
```

**RTL:** use logical properties everywhere (`margin-inline-start`, `padding-inline`, `inset-inline-start`, `text-align:start`), all of which are supported in M94. Delete the `html[dir=rtl]` margin overrides. For every horizontal `translateX(Npx)` use `translateX(calc(var(--dir) * Npx))`. Gradients: define `.scrim-start` once with `to right` and override it under `[dir=rtl]` with `to left`.

---

## 4. Focus treatment

Focus has to be readable from 3 m away, and it may only animate transform and opacity.

**Cards (posters, landscape, tiles):**
- The focused card gets `transform: scale(1.08)`, which is 180ms with `--e-out`. `transform-origin` is center for posters, and `bottom center` in rows so cards grow upward into the free space.
- **Ring:** a pre-rendered `::after` with `inset:-6px; border:4px solid var(--focus); border-radius:calc(var(--r-card) + 6px)`. Only its opacity animates, 0 to 1.
- **Lift shadow:** a pre-rendered `::before` with `box-shadow:0 24px 48px rgba(0,0,0,.55)`. Again only opacity animates, 0 to 1. Never animate `box-shadow` itself.
- Unfocused cards are untouched. Do not dim siblings; it costs repaints and adds no clarity.

```css
.card{position:relative;transition:transform var(--d-focus) var(--e-out)}
.card::before,.card::after{content:"";position:absolute;pointer-events:none;opacity:0;transition:opacity var(--d-focus) var(--e-out)}
.card::before{inset:0;border-radius:var(--r-card);box-shadow:0 24px 48px rgba(0,0,0,.55)}
.card::after{inset:-6px;border:4px solid var(--focus);border-radius:18px}
.card.focus{transform:scale(1.08);z-index:2}
.card.focus::before,.card.focus::after{opacity:1}
```

**Buttons:**
- Resting state is `rgba(255,255,255,.12)` with text-1.
- Focused state is a solid white fill with focus-ink text, plus `scale(1.04)`.
- The primary button (Play) rests on **accent** and turns white on focus. This means focus always looks the same (white) everywhere.
- Height 72, padding-inline 40, radius `--r-btn`, `--t-body` 600, icon 32 to the start of the label with a 12 gap.

**Chips, keys, list rows:** the same white-fill logic, with no scale on list rows (they translate instead; see the rail pill).

**Focus is never lost.** After any screen render, focus is placed deterministically: on Home, the billboard Play button; on Details, Play/Resume; in a grid, the first card; when returning, the previously focused element (store `focusId` per route in history).

---

## 5. Image strategy

| Use | Field | Rendered size | Variant |
|---|---|---|---|
| Stage backdrop | `image.cover.webp` (jpg fallback) | 1920x1080 | the only one |
| Poster card (rows, grids) | `image.poster.webp.*` | 200x300 / 180x270 | smallest variant with width >= rendered width (check real dimensions once; likely `medium`). Never `big`. |
| Landscape card (Continue Watching, Up Next) | `image.cover.webp` | 400x225 | cover (decoded small by GPU; acceptable because there are at most ~6 visible) |
| QR login backdrop | first `hero_header` post's cover | 1920x1080 | goes through the stage |
| Missing cover | poster `large` | rendered as a "poster bleed" | see below |

The TV DPR is 1, so do not fetch 2x.

**Loading:**
- Cards render immediately as **placeholders**: `--surface` background plus the title in `--t-cap` text-3, centered and wrapped to 3 lines. A broken image therefore still identifies the film.
- Each card holds an `<img loading="lazy" decoding="async">` positioned over the placeholder, at `opacity:0`. On `load`, add `.in`, which fades opacity to 1 over 240ms `--e-out`. On `error`, remove the img and keep the placeholder.
- `loading="lazy"` does not understand transformed tracks. So **set `src` manually**: when a row is built, set `src` for its first 10 cards. When a row's focus index changes, ensure `src` is set for `index-2 … index+9`. Do the same for rows within ±2 of the focused row. Grids: set `src` for the visible page plus 2 rows ahead.
- **Budget:** at most 2 decoded full-bleed images (stage layers A and B), plus about 60 posters. For rows more than 4 away from the focus, clear the img `src` (set it to `""` and remove `.in`) to release decoded memory.

**Stage backdrop swap:**
1. Focus settles on a new post (350ms debounce, and no swap at all while key-repeat is active).
2. Create `new Image()`, set its src, `await img.decode()`, with a 2.5 s timeout. If it times out, skip the swap.
3. Put it on the hidden layer and crossfade (see section 7).
4. 800ms later, clear the old layer's `src` and stop its animation.

**Missing cover fallback ("poster bleed"):** the stage layer shows the poster `large` at `height:1080px; width:720px`, positioned at the end edge. A static gradient mask element runs from `--bg-0` (start) to transparent across its first 360px. The rest of the stage stays `--bg-1`.

---

## 6. Global layout

```
<body>
  #stage            fixed 1920x1080, z0  (two <img class="bd"> layers + static scrims)
  #app              z1
    #rail           collapsed 120px icon rail, z3, overlays content
    #content        full 1920 width; content starts at --start
  #player           z50
  #toast            z100
  #splash           z200
```

The **stage** contains:
- `img.bd.a`, `img.bd.b`, each `position:absolute; inset:0; width:1920px; height:1080px; object-fit:cover; opacity:0; will-change:transform,opacity`.
- `.scrim-start`: a static `linear-gradient(to right, rgba(7,8,11,.96) 0%, rgba(7,8,11,.78) 30%, rgba(7,8,11,0) 68%)`, mirrored in RTL.
- `.scrim-bottom`: a static `linear-gradient(to top, #07080b 0%, rgba(7,8,11,.85) 32%, rgba(7,8,11,0) 62%)`.
- `.scrim-top`: 200px, `rgba(7,8,11,.5)` to 0, for clock and rail legibility.
- `.stage-dim`: a full black layer whose opacity is set per screen (Home 0, Details 0, grids/search/settings .72 so the backdrop becomes a whisper of color).

Screens toggle `#stage` state classes. They never rebuild it. On player start, `#stage` gets `display:none`, which frees the GPU and is required anyway for AVPlay's transparent body. It is restored on player exit.

---

## 7. Motion spec

### 7.1 Table
| What | Property | Duration | Easing |
|---|---|---|---|
| Card / button / chip focus | transform scale, ring opacity | 180 (`--d-focus`) | `--e-out` |
| Row track horizontal slide | track `translateX` | 320 (`--d-move`) | `--e-emph` |
| Rows container vertical slide | `translateY` | 420 | `--e-emph` |
| Rows passing above focus line | opacity to 0 | 240 | `--e-out` |
| Stage crossfade | new layer opacity 0→1, old 1→0 (old starts 100ms later) | 700 | `--e-io` |
| Ken Burns drift | transform scale+translate | 24 s, linear, `alternate infinite` | linear |
| Billboard text swap | out: opacity→0 (120ms). in: opacity 0→1 + translateY 12→0 (260ms), stagger 40ms: eyebrow, title, meta, plot | 120 + 260 | `--e-out` |
| Page enter | opacity 0→1 + translateY 16→0 | 420 | `--e-emph` |
| Page leave | opacity →0 | 160 | `--e-out` |
| Sheets (episodes, player menu) | translateY / translateX 100%→0 | 420 in / 240 out | `--e-emph` / `--e-out` |
| Rail expand | panel opacity + translateX(-24·dir→0); labels stagger 20ms | 240 | `--e-out` |
| Rail focus pill glide | translateY between items | 200 | `--e-out` |
| Image fade-in | opacity | 240 | `--e-out` |
| Toast | opacity + translateY 16→0, auto-hide after 3 s | 240 | `--e-out` |
| Skeleton pulse | container opacity .5↔.85 | 1.2 s alternate | ease-in-out |

Only `transform` and `opacity` are ever transitioned or animated. Do not transition `width`, `height`, `top`, `left`, `margin`, `box-shadow` or `filter`.

### 7.2 Ken Burns
Four presets are picked by `post.id % 4`. Each applies to the incoming layer as soon as it starts fading in:

```css
@keyframes kb0{from{transform:scale(1.04) translate(0,0)}to{transform:scale(1.12) translate(-1.5%,-1%)}}
@keyframes kb1{from{transform:scale(1.12) translate(-1%,0)}to{transform:scale(1.04) translate(1%,-1%)}}
@keyframes kb2{from{transform:scale(1.04) translate(1%,1%)}to{transform:scale(1.10) translate(-1%,0)}}
@keyframes kb3{from{transform:scale(1.10) translate(0,-1%)}to{transform:scale(1.04) translate(0,1%)}}
.bd.on{opacity:1;animation:kb0 24s linear infinite alternate}
```
The drift must stay subtle, never above 1.12. In RTL, swap the translate signs by using the presets in mirrored order (kb0 becomes kb1 and so on), or just accept the direction; it is subtle. `body.calm` sets `animation:none`.

### 7.3 Key-repeat ("fast" mode)
When `keydown` events arrive less than 160ms apart (a held D-pad), add `body.fast`. This halves the move durations so the row keeps up with the finger. While it is active, suppress the stage swap and the billboard text swap. Remove `fast` 220ms after the last keydown, then run the debounced swap once for the final focus. This is the single biggest contributor to perceived smoothness on TV.

### 7.4 What does NOT animate
Text content changes inside the player OSD (time), list contents, settings values, and the QR code itself all update instantly.

---

## 8. Sidebar: collapsed icon rail

**Collapsed (default, content focused):**
- The rail is 120px wide at the start edge, full height, with a static background `linear-gradient(to right, rgba(7,8,11,.8), rgba(7,8,11,0))` (mirrored in RTL).
- At the top (y=54) is the brand monogram "30" in Vz 800, 40px, accent.
- Icons are inline SVG, 40px, with a 2.5px stroke and `currentColor`. They are stacked and centered vertically, with a 72px pitch. The order is: **Search, Home, My list, Movies, Series, Anime, Archive, Settings**. My list has Watchlist and Favorites tabs. Account details live in Settings, not the rail. Movies, Series and Anime route to archive with the slug.
- Icon colors are text-3. The current page's icon is text-1, with a 4x28px accent bar at the start edge (x=0).

**Expanded (focus enters the rail):**
- A `.rail-panel` layer, 440px wide, fades in with `linear-gradient(to right, rgba(7,8,11,.97) 0 340px, rgba(7,8,11,0) 440px)`. It animates opacity plus `translateX(calc(var(--dir)*-24px))` to 0 over 240ms. Use no width animation. The panel overlays content, and content never reflows.
- Labels (`--t-body-l` 600) sit at x=104. Each fades in with a 12px slide, staggered 20ms.
- A full-screen `.rail-scrim` (black) fades from opacity 0 to .45 over content.
- Focus indicator: **one shared white pill** (300x64, radius 32) behind the items. It glides with `translateY` to the focused item over 200ms. The focused item's icon and label switch to focus-ink. The pill is created once and never re-rendered.

**Navigation:**
- Entering: press Left (Right in RTL) from the start-most focusable element, or press **Back** from a top-level screen's content. Focus lands on the current page's item.
- Moving Up/Down inside the rail only moves the pill. It does **not** navigate.
- OK navigates and collapses the rail. Right (Left in RTL) collapses it and returns focus to the remembered content element.
- Pressing Back in the rail opens a small "Exit 30nama?" confirm sheet (Exit / Cancel; Cancel is focused).

---

## 9. Screens

### 9.1 Splash / intro (at most 1.8 s, never blocks)
- `--bg-0`, centered.
- **0–300ms:** black.
- **300–1100ms:** a soft **red light bloom** appears behind the wordmark. It is a 900x900 `radial-gradient(closest-side, rgba(240,69,74,.38), transparent)` element that animates `scale(.6)→scale(1.15)` and opacity `0→1→.35`.
- **450–1050ms:** the wordmark "30nama" (Vz 800, 120px, text-1, with "30" in accent) fades in from opacity 0 with `translateY(14px)→0`.
- A thin 2px × 240px accent line under the wordmark animates `scaleX(0→1)`, origin center.
- In parallel: boot, the `test` probe, and the `home_stream` fetch. As soon as the first hero cover is **decoded**, the splash may exit, but not before 1200ms. Exit: splash opacity →0 over 400ms while the stage's first backdrop fades in under it. The splash dissolves into the hero.
- If data is not ready by 1.8 s, keep the wordmark and show a small 3-dot pulse below it (opacity only).

### 9.2 QR login
- The stage shows the first `hero_header` cover (fetched as guest), with `.stage-dim` set to .55. The wall behind the login is the content itself.
- **Start column** (x=--start, vertically centered, width 760):
  - Eyebrow (`--t-cap`, text-3): "Sign in".
  - Title (`--t-xl` 700): "Scan with your phone".
  - Three numbered steps (`--t-body-l`, text-2, 20 gap; the numerals are 40px accent circles with accent-ink text):
    1. Open the camera.
    2. Scan the code.
    3. Confirm on 30nama.com.
  - Fallback line: "Or visit **30nama.com/auth** and enter" followed by the code in 48px tabular, letter-spaced .12em (the code is Latin, so that is allowed).
  - Buttons: **Continue as guest** (focused), **New code**.
- **End column:** a white QR tile 460x460, radius `--r-sheet`, with 28px padding and the QR inside. It sits at x = 1920-96-460, vertically centered. Under it, a status line shows an 12px accent dot with an opacity pulse, then "Waiting for scan…" (`--t-cap`, text-2).
- **On success:** the QR tile crossfades to a white tile containing a large check glyph (accent), with a `scale(.9→1)` over 260ms. Then wait 400ms, and the page leaves to Home. The hero is already behind it.
- **Expired code:** the tile dims to opacity .3 and shows a "Code expired" overlay. Focus moves to New code.

### 9.3 Home (dynamic hero + rows)

**Vertical zones (browse mode):**
```
y   54 ┌─ clock (end edge, --t-cap tabular, text-2)
y  150 │  Billboard (x=--start, width 860)
       │    eyebrow   --t-cap 500 accent   e.g. "Top 10 · #3" / row name / "Series · 4 seasons"
       │    title     --t-display 800, 2-line clamp (local title in fa, english in en)
       │    subtitle  --t-body text-2: the other-language title, 1 line
       │    meta      --t-body text-2: [IMDb 7.8] · 2024 · 2h 10m · [16+] · Drama, Thriller
       │    plot      --t-body-l text-2, 3-line clamp, max-width 820
y  600 ├─ rows viewport (clips at y=600 via the row opacity rule, not overflow)
y  640 │  FOCUS LINE: the focused row's header top is always here
       │  header --t-m 700 (48 incl. gap) + cards 300 → bottom 988
y 1036 │  next row header peeks (scroll affordance)
```
- **Score badges** are outlined pills (2px text-3 border, 2/12 padding) grouped 8px apart, always LTR and monochrome (text-1, no brand colors): IMDb (solid "IMDb" plate icon + score), Rotten Tomatoes (tomato icon at 60%+, splat below + percentage), Metacritic ("Metacritic" label + score), and TMDB when enriched. The billboard shows only IMDb; Details shows all. The 30nama site score is not shown. Age is an outlined square badge. Show at most 2 genres.
- **Badges on cards** (top-start, at most one, `--t-cap` 600, radius 8, 4/10 padding): "SOON" (surface-2) when `coming_soon`, "FREE" (good, dark ink) when `free_stream`, and "زیرنویس" / "SUB" (rgba black .7) when `persian_subtitle`. Badges in rows only; the billboard already has room for everything else.
- **Row cards have no titles under them.** The billboard names the focused card, which keeps rows clean and posters large.

**Hero mode (on arrival):**
- The billboard shows `hero_header.posts[i]`. It auto-advances every 9 s (pause while the user is pressing keys, and resume after 9 s idle). Each advance runs the full stage crossfade and text swap.
- Under the plot (y≈ 620) are buttons: **Play** (primary, focused; Resume when `continue_watching` exists) and **Details**.
- Below the buttons sit dots: `n` 8x8 pills at 12 gap. The active dot is `scaleX(3)` in accent (transform-origin start).
- The rows container rests lower: the first row header is at y=860, and its posters are cut off by the screen bottom, which is intentional (peek).
- Pressing **Down** enters browse mode: buttons and dots fade out (160ms), the rows container slides to the focus line (420ms emph), and the billboard switches to following the focused card.
- Pressing **Up** from the first row returns to hero mode. The billboard shows the current hero post again, and the buttons fade in.

**Rows:**
- Row order: Continue Watching (landscape, logged-in only), New Releases, Suggested, Top 10, Movies, Series, Anime. `hero_header` is not a row; it feeds the billboard.
- **Poster cards:** 200x300, gap 24, radius `--r-card`.
- **Landscape cards (Continue Watching):** 400x225. A 6px progress track sits at the bottom inside the card, inset 12. The track is `rgba(255,255,255,.25)`, and the fill is accent, drawn with `scaleX(progress)` and origin start. Below the card is one line in `--t-cap` text-2: "S2 · E5 · 23 min left".
- **Top 10:** each card is 300 wide. A rank numeral (Vz 800, 260px, line-height .8, `color:transparent; -webkit-text-stroke:3px rgba(244,241,234,.35)`) sits behind the poster's start edge. The poster overlaps the numeral's end side by 40px. On focus, the numeral stroke goes to text-1 via opacity: swap two stacked numerals and fade between them.
- **Start-anchored tracks:** the focused card is always at x=`--start` (184). The track is `translateX(calc(var(--dir) * (184 - cardOffset)))`, clamped so the last card's end edge never passes 1920-96. Cards before the focused one slide off under the rail.
- **Each row remembers its index.** Because the remembered card is always at x=184, the existing geometric Up/Down nav naturally lands on it. Only Left at index 0 enters the rail.
- **Vertical:** the rows container is `translateY(640 - row.offsetTop)`. Rows above the focused one get `.past`, which sets opacity 0 so they never overlap the billboard. The focused row header goes to text-1, others to text-2.
- **Focus flow:** each focus change on a card triggers (1) the billboard text swap and (2) the debounced stage swap. Both are suppressed in fast mode.
- **Guest note:** below the last row, a one-line `--t-body` text-2 message, "Sign in to stream and continue watching", with a **Sign in** button.

**Skeleton (loading):** the billboard shows three bars (surface-2: 600x64, 420x28, 760x28 ×2). Below them, two rows of 7 poster rectangles. The container uses the opacity pulse.

### 9.4 Details (full-bleed)
- The stage keeps the current backdrop. If the backdrop is a different post (deep link or grid entry), it runs the normal crossfade. `.stage-dim` is 0. The scrim-start and scrim-bottom layers are stronger: add a `.details` class that raises a second static gradient layer's opacity (0→1, 300ms).
- The content column is x=--start, top y=180, width 880, and staggers in with the page enter:
  - Eyebrow: "Movie" / "Series · 4 seasons" / "Anime", plus a "Persian dub/sub" tag when relevant.
  - Title `--t-display` 800, 2-line clamp.
  - Other-language title `--t-body-l` text-2.
  - Meta line, the same as the billboard, but with all scores and up to 3 genres.
  - Plot `--t-body-l` text-2, 4-line clamp (`-webkit-line-clamp`, supported).
  - Buttons (y≈ 700): **Play** or **Resume S2·E5** (primary), **Episodes** (series only), **Trailer** (only if a field exists, otherwise omit), followed by icon-only Watchlist (eye) and Favorite (heart) toggles for signed-in users. Filled icons indicate membership; their labels appear while focused.
  - Cast: one line of text-3 `--t-cap`, "Cast: A, B, C…" (not focusable).
- **Back** goes to the previous screen and restores focus. The stage stays (no crossfade), so the return is instant and seamless.

### 9.5 Seasons and episodes (series)
- **Episodes** (or Down from the buttons) raises a **sheet** from the bottom: 1920x600 at y=480, background `linear-gradient(to top, #07080b 70%, rgba(7,8,11,0))`, `translateY(100%)→0`, 420ms emph. At the same time the details column moves `translateY(-140px)` and its plot fades to 0, so the title and meta stay visible above the sheet.
- **Season tabs:** a row of pills at y=540, height 56, padding-inline 28, `--t-body` 600. The current season is text-1 with a 3px accent underline bar inside the pill. Others are text-2. Focus uses the white fill. Moving focus across tabs **switches the season immediately**. The episode track crossfades (opacity 160ms out, 220ms in) without needing OK.
- **Episode tiles** (there are no episode stills in the API, so the tiles are typographic): 360x200, `--surface`, radius `--r-tile`, in a horizontal start-anchored track at y=640, gap 24.
  - With TMDB on, the episode still (w300) fades in (240ms) as the tile background under a dark top/bottom gradient. The number shrinks to 36px text-1, text stays light on focus (no white fill; the ring and scale mark focus). When the API has no episode title, the TMDB title (Persian if translated, else English; generic "Episode N" names ignored) replaces the "Episode N" fallback.
  - The episode number "E05" (Vz 800, 64px, text-3) sits top-start.
  - The episode title (`--t-body` 600, 2-line clamp) sits bottom-start.
  - Duration (`--t-cap` text-2) sits top-end.
  - Progress, when present, is a 4px accent `scaleX` bar on the bottom edge. A watched episode shows a small check in the top-end corner instead of the duration.
  - Focus uses a white fill with focus-ink text, plus scale 1.06 and the ring.
- On open, focus goes to the season and episode to resume, otherwise E01.
- **Back** closes the sheet (240ms out) and returns focus to the Episodes button.

### 9.6 Search (on-screen grid keyboard)
- `.stage-dim` .72. The stage shows the last backdrop as an ambient tint.
- **Start panel** (x=--start, width 620):
  - **Query field** (y=120): `--t-xl` 600 text-1, with placeholder "Search movies, series, anime" in text-3. There is a 3px × 56px accent caret after the text that blinks by opacity (1 s steps), and a 2px `--line` underline below.
  - **Keyboard grid** (y=240): 64x64 keys, gap 8, radius 12, `--surface` with `--t-body-l` 500 labels.
    - English: 7 columns, a–z then 0–9 (6 rows).
    - Persian: 8 columns, ا ب پ ت ث ج چ ح خ د ذ ر ز ژ س ش ص ض ط ظ ع غ ف ق ک گ ل م ن و ه ی plus ۰–۹ (6 rows).
    - Function row, full-width keys: **Space** (wide), **⌫**, **Clear**, **EN / فا**, **🎤** (focuses the hidden native input for the Samsung IME or voice, if available).
    - The keyboard layout follows the UI language by default, and the toggle switches it. Keep keys LTR-ordered for English and RTL-ordered for Persian.
- Hint under the grid (`--t-cap` text-3): "◀ ▶ ▲ ▼ to type · Right to results". In RTL, read Left.
- **Results** (x = --start + 620 + 64 → end): a "Top results" header (`--t-m`), then a poster grid of 5 columns, 180x270, gap 24/40. The title is under each card (`--t-cap`, 1 line, text-2; text-1 when focused).
  - Live search runs 500ms after the last key, keeping the current seq guard. On result change, the grid crossfades: old opacity →0 over 120ms, new cards fade in with a 15ms stagger, capped at 12 animated cards.
  - The results grid scrolls by `translateY` to keep the focused row at y=300.
- **Empty query:** show "Popular now" using `suggested` from the cached home payload.
- **No results:** text-2 message "Nothing for “query”", with suggestions below.

### 9.7 Archive and genre grid
- **Archive landing:**
  - Title `--t-xl` "Browse".
  - **Categories** as a pill row.
  - Below that, **Genres** as tiles: 360x200, radius `--r-tile`, using `menu.genres[].image` as the background (fade-in like posters). A static bottom gradient overlays it, with the genre name in `--t-l` 700 bottom-start and the count in `--t-cap` text-2. The grid has 4 columns, gap 24.
- **Grid page** (slug):
  - Header row: the title (`--t-xl`), a result count (text-3), and **sort pills** (Newest · IMDb · Popular, mapped to `orderby`) aligned to the end. The current sort uses an accent underline.
  - Grid: 7 columns of 200x300 posters, gap 32 horizontal / 56 vertical, with the title under each card.
  - Vertical scroll by `translateY` keeps the focused row at y=260. The header slides up and fades with the first scroll.
  - **Paging:** when focus reaches the second-to-last loaded row, fetch the next page. Append skeleton cards immediately and replace them as data arrives. Never reset focus.
- `.stage-dim` .72 for both pages.

### 9.8 Settings
- **Two panes.** The start list (width 520) holds sections: **Account**, **Language**, **Playback**, **Display**, **TMDB metadata**, **About**. The end pane (x=760, width 1000) shows the focused section's options. The pane content swaps as the list focus moves (fade 120/220ms).
- List rows: height 80, `--t-body-l`. The current section is text-1 with an accent bar; focus uses the white fill.
- **Option rows:** 1000x88, `--surface`, radius `--r-tile`. The label is at the start and the current value is at the end in text-2 with a "‹ ›" hint. Left/Right cycles values in place; OK does the same.
  - **Account:** name, subscription expiry, Sign out (danger text; it confirms with a sheet).
  - **Language:** English / فارسی. Switching re-renders with `dir`. The rail and stage stay mounted.
  - **Playback:** Default subtitles (Off / فارسی / English), Subtitle size (S/M/L = 38/46/54px), with a live sample line rendered on a dark strip. Also Autoplay next episode (On/Off).
  - **Display:** Reduce motion (adds `body.calm`, disables Ken Burns and auto-advance).
  - **TMDB metadata:** a status row, then a key strip: 4 `--surface` tiles of 8 slots each that fill as the 32-character v3 API Key is typed (the next slot carries the blinking accent caret; a rejected key outlines the tiles in `--danger`; a saved key shows masked except its last 4). Below it is a 16-key hex pad (0–9, a–f, always LTR) with ⌫ / Clear / Keyboard (native IME for a long v4 token), and at the end a 196px white QR tile linking to themoviedb.org/settings/api. Actions: **Check and save** (verifies against TMDB `/authentication` before persisting to `localStorage.tmdbToken`), **Remove key** (confirms), **Clear metadata cache**. Remote number keys, USB keyboards and desktop paste also feed the strip.
  - **About:** version, a "Unofficial client" note, and the active API host.

### 9.9 Player overlay (OSD)
OSD states: **hidden** → **peek** (any key: top and bottom chrome, auto-hide after 4 s while playing) → **paused** (chrome stays, plus a center glyph).

**Top chrome:** a static gradient band, 240px tall, from `rgba(0,0,0,.7)` to 0.
- At x=96, y=64: the title (`--t-l` 700). Below it, the episode line "S2 · E5 — Episode title" (`--t-body` text-2).
- At the end edge: a clock (`--t-body` tabular, text-2).

**Bottom chrome:** a static gradient band, 380px tall, from `rgba(0,0,0,.85)` to 0.
- **Scrubber** at y=930, x=96 → 1824 (1728 wide):
  - The track is 6px with radius 3, `rgba(255,255,255,.22)`.
  - The buffered layer is `rgba(255,255,255,.35)` and the played layer is accent. **Both are `scaleX`, origin start.** Do not use the current `width:%` approach.
  - The thumb is a 20px white circle positioned with `translateX`.
  - When the scrubber is "active" (seeking, or OSD focus on it), the track goes to `scaleY(1.67)` and the thumb to `scale(1.4)`, 180ms.
- **Times** at y=966: elapsed at the start, `-remaining` at the end, `--t-body` tabular text-2.
- **Seeking** (Left/Right with the existing `seekAcc`):
  - A **time bubble** floats above the thumb: a `--surface` pill, 6/16 padding, showing the target time in `--t-body-l` 600 tabular. It is positioned with `translateX`, and the delta "+30s" sits in accent beside it.
  - The played fill previews the target position.
  - It commits after a 700ms idle (existing logic).
- **Hint line** at y=1010 (`--t-cap` text-3): "▲ Audio & subtitles · OK Play/Pause · ▼ Episodes" (series only).

**Center glyph** on play and pause: a 140px circle `rgba(0,0,0,.45)` with a 64px play or pause icon. It animates `scale(.85)→1` with opacity 0→1→0 over 600ms. When paused, it stays visible at opacity .9.

**Spinner:** a 72px ring with a 6px stroke. The track is `rgba(255,255,255,.15)` with a 90° accent arc, rotating 900ms linear. Use one element with `border-top-color` on accent plus `transform: rotate`.

**Subtitles:**
- Vz 500, the size from settings, text-1, with `text-shadow:0 0 4px #000,0 2px 6px #000`. Use `line-height:1.4`, and 1.6 for fa.
- Position: bottom 110px. While the OSD is visible, subtitles move up with `translateY(-150px)` over 240ms so they never collide with the scrubber.

**Audio and subtitle menu** (Up):
- An end-side sheet, 640x1080, `rgba(14,16,22,.96)`, sliding `translateX(calc(var(--dir)*100%))→0`, 420ms emph.
- Two sections, **Audio** and **Subtitles**, with `--t-cap` text-3 headers. Items are 72px rows with a check glyph in the start slot for the selected item. Focus uses the white fill.
- Back closes the sheet.

**Episodes in the player** (Down, series only): a bottom sheet reusing the episode tiles from 9.5, without the season tabs (current season only). The video keeps playing behind it.

### 9.10 Skip intro / recap
- An end-anchored pill at the end edge, x inset 96, y=800 (above the bottom chrome).
- Rest state: `rgba(20,22,30,.85)`, a 2px `rgba(255,255,255,.6)` border, height 72, padding 36. Label "Skip intro ⏭" in `--t-body` 600.
- **It takes focus automatically**, so OK skips (matching current behavior). Focused, it becomes a white fill with focus-ink text.
- It appears with opacity plus a 24px slide from the end edge (320ms emph). It stays only during the intro window; if untouched, it fades out at `intro_end`.
- It never stacks with the OSD. If the OSD is visible, it moves up 140px with `translateY`.

### 9.11 Up Next card
- It triggers at `options.end` (credits start) when there is a next item and Autoplay is on.
- The card is 640x200 at the end side, inset 96, y=780. It uses `--surface` at .94 opacity with radius `--r-sheet` and enters with a translateX slide plus opacity (420ms emph).
  - **Start:** a 320x180 thumbnail (the series cover; no stills) with an inset 10px radius.
  - **End:** "Next episode" (`--t-cap` text-3), "S2 · E6" (`--t-body-l` 700), and the title (`--t-body` text-2, 1 line).
  - **Countdown:** a 4px accent bar along the card's bottom edge, `scaleX(0→1)` over 10 s linear (CSS animation). When it completes, play the next item. Any key other than OK/Back pauses the countdown, and the bar holds.
  - **Buttons**, inside the card under the text: **Play now** (focused) and **Credits** (dismisses; it does not come back for this item).
- Without autoplay, show the same card with no countdown bar.

### 9.12 System states
- **Toast:** a bottom-center pill, `--surface` .96, with a 1px `--line` border, `--t-body`, and 16/32 padding.
- **Error:** centered within the content. A 64px icon in text-3, a message in `--t-body-l` text-2, and a **Retry** button (focused).
- **Exit confirm and sign-out confirm:** a centered sheet, 720 wide, `--surface`, radius `--r-sheet`, with a scrim at .6. The two buttons default to the safe choice.

---

## 10. Implementation notes for this codebase

1. **index.html:** add `#stage` (two `img.bd` and the scrims) before `#app`. Add `#rail` (replacing `#sidebar`) with an SVG sprite `<svg style="display:none"><symbol id="i-home">…`. Add `#splash` markup with `.bloom`, `.wordmark` and `.line`.
2. **nav.js:**
   - Add a focus hook. `nav.focus` should call `el.onfocus2 && el.onfocus2()` and dispatch to a screen-level `nav.onFocusChange`. Screens use this to drive the billboard, the stage and track transforms.
   - Replace `ensureVisible` (scrollTop/scrollLeft) with **transform-driven layout** for Home rows, grids, the episode track and search results. Each layout registers a `reveal(el)` function on its container (`container.reveal = fn`); `ensureVisible` calls the nearest container's `reveal` if present and otherwise falls back to the current scroll logic (used by Settings).
   - Add key-repeat detection that toggles `body.fast` (7.3).
   - Read `el.offsetLeft` and `el.offsetTop` for layout math, never `getBoundingClientRect`. The latter includes the in-flight transform and makes targets drift during animation.
3. **Stage module** (a new `js/stage.js`, about 80 lines): `N.stage.show(post, {immediate})`, `N.stage.dim(level)`, `N.stage.hide()` and `N.stage.restore()`. It owns the debounce, decode, layer swap, Ken Burns preset choice and old-layer cleanup.
4. **Cards:** one `card(post, kind)` factory for `poster | landscape | top10 | episode | genre`. It creates the placeholder title, the lazy img (`data-src`) and the badge. The row/grid owner sets `src` according to the windows in section 5.
5. **Player:** convert the OSD fill to `scaleX`. Add the buffered layer, thumb, time bubble, center glyph, clock and Up Next card markup. Keep `#stage` hidden during playback (AVPlay transparency).
6. **Performance checklist:**
   - Put `will-change: transform` only on stage layers, row tracks, the rows container and grid containers. Never put it on every card.
   - No more than 2 full-bleed images decoded.
   - No animated `box-shadow`, `filter`, `width` or `top`.
   - No `backdrop-filter`; the spec uses none.
   - Gradients are static layers.
   - Test held-D-pad scrolling across a 30-card row: it must keep up with no dropped focus.
7. **i18n:** add strings for every new label: the eyebrows, "min left", "Skip intro", "Next episode", "Play now", "Credits", the settings sections, and the keyboard function keys.
