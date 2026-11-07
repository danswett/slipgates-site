import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchLatestManifest, validateManifest } from './release.mjs';
import { renderDownload } from './download-block.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');
const dist = path.join(root, 'dist');
const config = JSON.parse(await readFile(path.join(src, 'site.json'), 'utf8'));

// The manifest comes from a file (tests, local previews) or from the newest complete published Beta.
async function loadManifest() {
  const file = process.env.BETA_MANIFEST_FILE;
  if (file) return validateManifest(JSON.parse(await readFile(file, 'utf8')));
  if (process.env.BETA_MANIFEST === 'none') return null;
  try {
    return await fetchLatestManifest({ token: process.env.GH_TOKEN });
  } catch (err) {
    console.warn(`Release lookup failed, using the GitHub Releases fallback: ${err.message}`);
    return null;
  }
}

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const partials = {};
for (const name of ['header', 'footer']) {
  partials[name] = await readFile(path.join(src, 'partials', `${name}.html`), 'utf8');
}
const markFull = (await readFile(path.join(src, 'mark.svg'), 'utf8')).trim();
const mark24 = (await readFile(path.join(src, 'mark-24.svg'), 'utf8')).trim();
const withClass = (svg, cls) => svg.replace('<svg ', `<svg class="${cls}" aria-hidden="true" focusable="false" `);

const manifest = await loadManifest();
console.log(manifest ? `Beta ${manifest.version} selected` : 'No complete Beta found: GitHub Releases fallback');

await rm(dist, { recursive: true, force: true });
for await (const file of walk(src)) {
  const rel = path.relative(src, file);
  if (rel.startsWith('partials') || rel === 'site.json' || rel === 'mark.svg' || rel === 'mark-24.svg') continue;
  const out = path.join(dist, rel);
  await mkdir(path.dirname(out), { recursive: true });
  if (!rel.endsWith('.html')) {
    await cp(file, out);
    continue;
  }
  const depth = rel.split(path.sep).length - 1;
  const rootPath = rel === '404.html' ? process.env.SITE_BASE || '/' : '../'.repeat(depth);
  let html = await readFile(file, 'utf8');
  html = html
    .replaceAll('{{> header}}', partials.header)
    .replaceAll('{{> footer}}', partials.footer)
    .replaceAll('{{mark-24}}', withClass(mark24, 'mark mark-24'))
    .replaceAll('{{mark}}', withClass(markFull, 'mark mark-lockup'))
    .replaceAll('{{download}}', renderDownload(manifest, config))
    .replaceAll('{{root}}', rootPath)
    .replaceAll('{{name}}', config.name)
    .replaceAll('{{githubUrl}}', config.githubUrl);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, html);
}
if (manifest) await writeFile(path.join(dist, 'beta-release.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(path.join(dist, '.nojekyll'), '');
