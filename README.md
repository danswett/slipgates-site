# slipgates-site
Static source for slipgates.com (GitHub Pages). No runtime dependencies.

- `src/` pages, styles, fonts. `build/` assembles `dist/`, the folder deployed to Pages.
- `npm run build` builds; `npm test` runs the tests (Node 24).
- The build embeds the newest published Beta's `beta-release.json` (needs `GH_TOKEN`).
  Without it the download button falls back to GitHub Releases. Use `BETA_MANIFEST_FILE=<file>`
  for a local manifest or `BETA_MANIFEST=none` to force the fallback.
- The Pages workflow rebuilds hourly so new releases appear without a commit.
- `docs/cutover.md` covers the custom domain, rollback and smoke check. No CNAME until SRE confirms.
- `src/tokens.css` is copied from the app's design tokens; update it from there.
