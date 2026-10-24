# AGENTS.md

> Fork-owned maintenance notes for `janbam/page-assist`.
> Keep this file and its procedures out of upstream PRs to `n4ze3m/page-assist`.

## Package age gate

This machine suppresses very fresh package versions. If an install or update fails because the required version is gated, do not bypass it silently: ask Jan for approval first. If approved, refresh `caniuse-lite` via a temporary `package.json` override plus a cache-bypassing bun install, then restore `package.json` and reinstall, leaving only `bun.lockb` changed. If the build still warns afterwards, look for orphaned nested copies (for example under `autoprefixer` or `browserslist`) and delete them so resolution hoists to the fresh top-level copy.
