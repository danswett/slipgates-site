# Custom-domain cutover and rollback (slipgates.com)

Owner decisions (danswett/agent-bridge #762): GitHub Pages hosting, one small public repo per site, DNS-only records (no Cloudflare proxy), HTTPS enforced, no tokens or private network details in any page. This repo serves `slipgates.com` and `www.slipgates.com`. The PWA's repo serves `app.slipgates.com` and is not touched here.

## Preconditions (all must be true before step 1)

- Site content is ready: landing, `/download/`, `/docs/`, `/privacy/` in the Pages artifact (an empty "coming soon" page is acceptable first).
- Pages is enabled for this repo with the Actions build source, and a deploy has succeeded on the default `github.io` URL, checked by eye.
- `slipgates.com` is a verified Pages domain on the owner's account (the `_github-pages-challenge-danswett` TXT record exists).
- SRE and Platform have confirmed this cutover's order relative to the relay and app cutovers.

## Cutover order

1. Record the current state: export the `slipgates.com` DNS zone (names and values only) and note the Pages settings. Keep the export in the cutover ticket, not in this repo.
2. In the repo's Pages settings, set the custom domain to `slipgates.com`, immediately before the DNS change.
3. In Cloudflare DNS, with the proxy **off** (DNS-only, grey cloud):
   - apex `slipgates.com`: the `A` and `AAAA` records listed in GitHub's "Managing a custom domain for your GitHub Pages site" documentation (check the current list at cutover time).
   - `www`: `CNAME` to `danswett.github.io`.
4. Wait for GitHub's DNS check to pass and the managed certificate to be issued, then enable **Enforce HTTPS**.
5. Run `pwsh scripts/smoke.ps1`. Every check must pass.
6. Post the smoke output on the hub issue.

Add a record only together with its Pages custom-domain setting, never ahead of it, so no hostname can be taken over.

## Rollback

Trigger: smoke check fails, wrong content is live, or the certificate is not issued within the agreed window.

1. In Cloudflare, delete the records added in step 3 (or restore the zone exported in step 1). `slipgates.com` stops resolving to Pages; nothing else depends on it.
2. Clear the custom domain in the repo's Pages settings.
3. Confirm with `Resolve-DnsName slipgates.com` that the records are gone and the default `github.io` URL still serves.
4. Post the failing smoke output and the reason on the hub issue.

A bad deploy with correct DNS is rolled back by re-running the Pages workflow on the last good commit, or by reverting the bad commit and letting CI redeploy.

## Smoke check

`scripts/smoke.ps1` is read-only (GET requests only). It checks that HTTP redirects to HTTPS, `www` redirects to the apex, each public path returns 200, and no page contains token-shaped strings or IPv4 addresses. For another site use `-Site status.slipgates.com -Paths /`; `www` is only checked for apex sites.

## Other sites

`status.slipgates.com` and `roadmap.slipgates.com` each get their own small repo and follow the same steps, with a single `CNAME` record to `danswett.github.io`.
