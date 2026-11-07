// Picks the newest complete published Beta and validates its beta-release.json (#735 contract v1).
// Visitors never call GitHub: the build reads this once and writes static files.

export const REPO = 'danswett/agent-bridge';
export const INSTALLERS = {
  'win-x64': 'AgentBridgeApp-win-Setup.exe',
  'win-arm64': 'AgentBridgeApp-win-arm64-Setup.exe',
};
export const MANIFEST_ASSET = 'beta-release.json';
const SHA256 = /^[0-9a-fA-F]{64}$/;
const TAG = /^v(\d+)\.(\d+)\.(\d+)$/;

function tagParts(tag) {
  return TAG.exec(tag).slice(1).map(Number);
}

function compareTags(a, b) {
  const x = tagParts(a);
  const y = tagParts(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

function hasUsableAsset(release, name) {
  return release.assets?.some((a) => a.name === name && a.size > 0 && a.state !== 'open') ?? false;
}

// Newest (by version, not date) published pre-release with both installers and the manifest.
export function selectRelease(releases) {
  return (
    releases
      .filter(
        (r) =>
          r &&
          r.prerelease === true &&
          r.draft !== true &&
          TAG.test(r.tag_name ?? '') &&
          Object.values(INSTALLERS).every((n) => hasUsableAsset(r, n)) &&
          hasUsableAsset(r, MANIFEST_ASSET),
      )
      .sort((a, b) => compareTags(b.tag_name, a.tag_name))[0] ?? null
  );
}

// Returns the manifest when it is complete and canonical for its tag, otherwise null.
export function validateManifest(m) {
  if (!m || m.schemaVersion !== 1 || m.channel !== 'beta') return null;
  if (typeof m.tag !== 'string' || !TAG.test(m.tag) || m.version !== m.tag.slice(1)) return null;
  if (Number.isNaN(Date.parse(m.publishedAt))) return null;
  const base = `https://github.com/${REPO}/releases/download/${m.tag}/`;
  if (m.releaseNotesUrl !== `https://github.com/${REPO}/releases/tag/${m.tag}`) return null;
  for (const [key, fileName] of Object.entries(INSTALLERS)) {
    const d = m.downloads?.[key];
    if (!d || d.fileName !== fileName || d.url !== base + fileName) return null;
    if (!Number.isInteger(d.sizeBytes) || d.sizeBytes <= 0) return null;
    // v1 has no digest yet; when Platform adds one it must be a 64-character hex SHA-256.
    if (d.sha256 !== undefined && !SHA256.test(d.sha256)) return null;
  }
  return m;
}

export async function fetchLatestManifest({ token, fetchImpl = fetch } = {}) {
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetchImpl(`https://api.github.com/repos/${REPO}/releases?per_page=100`, { headers });
  if (!res.ok) throw new Error(`release list failed: HTTP ${res.status}`);
  const release = selectRelease(await res.json());
  if (!release) return null;
  const asset = release.assets.find((a) => a.name === MANIFEST_ASSET);
  const file = await fetchImpl(asset.browser_download_url);
  if (!file.ok) throw new Error(`manifest download failed: HTTP ${file.status}`);
  const manifest = validateManifest(await file.json());
  return manifest && manifest.tag === release.tag_name ? manifest : null;
}
