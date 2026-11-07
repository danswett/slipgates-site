// Renders the home page's download block from a validated manifest. No manifest: a plain
// "Download from GitHub Releases" link, never a dead or blank button.

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function renderDownload(manifest, config) {
  if (!manifest) {
    return `<div class="download" data-state="fallback" id="download">
  <a class="btn" id="get" href="${esc(config.releasesUrl)}">Download from GitHub Releases</a>
  <p class="meta" id="meta">Pick the installer for your PC from the newest Beta.</p>
  <p class="meta" id="notwindows" hidden>${notWindowsLine(config)}</p>
</div>`;
  }
  const x64 = manifest.downloads['win-x64'].url;
  const arm = manifest.downloads['win-arm64'].url;
  return `<div class="download" data-state="ready" id="download" data-x64="${esc(x64)}" data-arm64="${esc(arm)}">
  <a class="btn" id="get" href="${esc(x64)}">Get the beta for Windows</a>
  <p class="alt" id="alt"><a id="alt-link" href="${esc(arm)}">Windows on Arm? Get the Arm64 version.</a></p>
  <p class="meta" id="meta">Beta ${esc(manifest.version)} · ${esc(formatDate(manifest.publishedAt))} · <a href="${esc(manifest.releaseNotesUrl)}">Release notes</a></p>
  <p class="meta" id="notwindows" hidden>${notWindowsLine(config)}</p>
</div>`;
}

function notWindowsLine(config) {
  const link = config.webAppUrl ? ` <a href="${esc(config.webAppUrl)}">Open the web app</a>.` : '';
  return `Slipgates runs on Windows. On your phone, open the web app after setup.${link}`;
}
