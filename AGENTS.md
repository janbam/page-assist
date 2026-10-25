# AGENTS.md

> Fork-owned maintenance notes for `janbam/page-assist`.
> Keep this file and its procedures out of upstream PRs to `n4ze3m/page-assist`.

## Package age gate

This machine suppresses very fresh package versions. If an install or update fails because the required version is gated, do not bypass it silently: ask Jan for approval first. If approved, refresh `caniuse-lite` via a temporary `package.json` override plus a cache-bypassing bun install, then restore `package.json` and reinstall, leaving only `bun.lockb` changed. If the build still warns afterwards, look for orphaned nested copies (for example under `autoprefixer` or `browserslist`) and delete them so resolution hoists to the fresh top-level copy.

## Build memory

Node's default heap (~2 GB here) OOMs on production builds. Build with the `pabuild` shell function (`~/.bashrc`), i.e. `NODE_OPTIONS=--max-old-space-size=6144 bun run build`.

## Firefox for Android

Mobile Firefox has no `sidebarAction`, no `commands`, no `contextMenus`, and no `windows` (all `false` in MDN's compat data for `firefox_android`), so `tabs.query({ active: true, currentWindow: true })` cannot be trusted there. The mobile chat therefore rides on `browser.browserAction.setPopup("sidepanel.html")`, which Firefox for Android renders as a fullscreen, URL-bar-less view. Page context keeps working because the background tracks the last non-extension tab (`src/libs/current-page-tab.ts`) and every page reader asks it instead of querying tabs itself.

Test on device with `web-ext run --target=firefox-android` over USB debugging, or sign an unlisted build on AMO and install it from a collection — Firefox for Android does not sideload XPI files.

Firefox builds now also package: `bun run build:firefox` runs `wxt zip -b firefox` and copies the fresh `build/pageassist-<version>-firefox.zip` to `build/page-assist-firefox.xpi` via `scripts/make-xpi.ts`. The version-stamped zip stays in place next to it, together with the sources zip, because those are the AMO upload artifacts; the xpi is for loading the build locally.
