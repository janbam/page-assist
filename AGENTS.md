# AGENTS.md

> Fork-owned maintenance notes for `janbam/page-assist`.
> Keep this file and its procedures out of upstream PRs to `n4ze3m/page-assist`.

## Package age gate

This machine suppresses very fresh package versions. If an install or update fails because the required version is gated, do not bypass it silently: ask Jan for approval first. If approved, refresh `caniuse-lite` via a temporary `package.json` override plus a cache-bypassing bun install, then restore `package.json` and reinstall, leaving only `bun.lockb` changed. If the build still warns afterwards, look for orphaned nested copies (for example under `autoprefixer` or `browserslist`) and delete them so resolution hoists to the fresh top-level copy.

## Build memory

Node's default heap (~2 GB here) OOMs on production builds. Build with the `pabuild` shell function (`~/.bashrc`), i.e. `NODE_OPTIONS=--max-old-space-size=6144 bun run build`.

## Firefox for Android

Keep Android chat in a normal tab by default. On the tested Nightly build, the fullscreen extension popup does not expose the keyboard's occupied space through viewport APIs, but a normal tab resizes correctly with `interactive-widget=resizes-content`. The popup route remains behind `ANDROID_CHAT_POPUP_ENABLED` in `src/entries-firefox/background.ts`; enable it only for explicit browser testing. This has not been compared with stable Firefox.

Preserve the background's source-page tracking (`src/libs/current-page-tab.ts`): when chat is active, an active-tab query names the chat itself. Keep sidebar, command, and context-menu API calls guarded on Android. For device debugging, Firefox's remote-debugging setting is named "via USB" but also works over wireless ADB and ADB tunnels. Unsigned installation on Nightly does not establish installability on stable Firefox.

Firefox builds now also package: `bun run build:firefox` runs `wxt zip -b firefox` and copies the fresh `build/pageassist-<version>-firefox.zip` to `build/page-assist-firefox.xpi` via `scripts/make-xpi.ts`. The version-stamped zip stays in place next to it, together with the sources zip, because those are the AMO upload artifacts; the xpi is for loading the build locally.
