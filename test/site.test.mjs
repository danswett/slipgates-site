import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { renderDownload } from '../build/download-block.mjs';
import { INSTALLERS, MANIFEST_ASSET, selectRelease, validateManifest } from '../build/release.mjs';
import { apply, chooseState } from '../src/download.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(path.join(root, 'src/site.json'), 'utf8'));

const NEW = ['Slipgates-win-Setup.exe', 'Slipgates-win-arm64-Setup.exe'];
const OLD = ['AgentBridgeApp-win-Setup.exe', 'AgentBridgeApp-win-arm64-Setup.exe'];
const asset = (name, size = 100) => ({ name, size, state: 'uploaded', browser_download_url: `https://example.invalid/${name}` });
const release = (tag, over = {}) => ({
  tag_name: tag,
  prerelease: true,
  draft: false,
  assets: [...Object.values(INSTALLERS), MANIFEST_ASSET].map((n) => asset(n)),
  ...over,
});

function manifest(tag = 'v0.1.3276') {
  const base = `https://github.com/danswett/agent-bridge/releases/download/${tag}/`;
  return {
    schemaVersion: 1,
    channel: 'beta',
    version: tag.slice(1),
    tag,
    publishedAt: '2026-11-07T03:23:33Z',
    releaseNotesUrl: `https://github.com/danswett/agent-bridge/releases/tag/${tag}`,
    downloads: {
      'win-x64': { fileName: INSTALLERS['win-x64'], url: base + INSTALLERS['win-x64'], sizeBytes: 1000 },
      'win-arm64': { fileName: INSTALLERS['win-arm64'], url: base + INSTALLERS['win-arm64'], sizeBytes: 900 },
    },
  };
}

test('selectRelease takes the highest version among complete published Betas', () => {
  const picked = selectRelease([
    release('v0.1.999'),
    release('v0.1.3276'),
    release('v0.1.4000', { draft: true }),
    release('v0.1.4001', { assets: release('x').assets.filter((a) => a.name !== MANIFEST_ASSET) }),
    release('v0.1.4002', { assets: release('x').assets.map((a) => (a.name === INSTALLERS['win-arm64'] ? { ...a, size: 0 } : a)) }),
    release('v0.1.4003', { prerelease: false }),
    release('nightly'),
  ]);
  assert.equal(picked.tag_name, 'v0.1.3276');
  assert.equal(selectRelease([release('v0.1.1', { draft: true })]), null);
});

test('validateManifest accepts the v1 contract and rejects incomplete or foreign ones', () => {
  assert.ok(validateManifest(manifest()));
  const badSum = manifest();
  badSum.downloads['win-x64'].sha256 = 'abc';
  assert.equal(validateManifest(badSum), null);
  const goodSum = manifest();
  goodSum.downloads['win-x64'].sha256 = 'A'.repeat(64);
  assert.ok(validateManifest(goodSum));
  const noArm = manifest();
  delete noArm.downloads['win-arm64'];
  assert.equal(validateManifest(noArm), null);
  const foreign = manifest();
  foreign.downloads['win-x64'].url = 'https://evil.example/Slipgates-win-Setup.exe';
  assert.equal(validateManifest(foreign), null);
  assert.equal(validateManifest({ ...manifest(), schemaVersion: 2 }), null);
  assert.equal(validateManifest({ ...manifest(), version: '9.9.9' }), null);
  assert.equal(validateManifest(null), null);
});

test('INSTALLERS are exactly the renamed Slipgates downloads', () => {
  assert.deepEqual(Object.values(INSTALLERS), NEW);
});

test('selectRelease refuses a release that only has the old installer names', () => {
  const oldOnly = release('v0.1.5000', { assets: [...OLD, MANIFEST_ASSET].map((n) => asset(n)) });
  assert.equal(selectRelease([oldOnly]), null);
  assert.equal(selectRelease([oldOnly, release('v0.1.10')]).tag_name, 'v0.1.10');
});

test('validateManifest refuses old names and url/fileName mismatches', () => {
  const base = 'https://github.com/danswett/agent-bridge/releases/download/v0.1.3276/';
  const oldNames = manifest();
  oldNames.downloads['win-x64'] = { ...oldNames.downloads['win-x64'], fileName: OLD[0], url: base + OLD[0] };
  oldNames.downloads['win-arm64'] = { ...oldNames.downloads['win-arm64'], fileName: OLD[1], url: base + OLD[1] };
  assert.equal(validateManifest(oldNames), null);
  const urlMismatch = manifest();
  urlMismatch.downloads['win-x64'].url = base + NEW[1];
  assert.equal(validateManifest(urlMismatch), null);
  const wrongTag = manifest();
  wrongTag.downloads['win-arm64'].url = `https://github.com/danswett/agent-bridge/releases/download/v0.1.1/${NEW[1]}`;
  assert.equal(validateManifest(wrongTag), null);
  const wrongName = manifest();
  wrongName.downloads['win-x64'].fileName = NEW[1];
  assert.equal(validateManifest(wrongName), null);
});

test('download block: ready state links both installers and the release notes', () => {
  const html = renderDownload(manifest(), config);
  assert.match(html, /data-state="ready"/);
  assert.match(html, /Get the beta for Windows/);
  assert.match(html, /Beta 0\.1\.3276 · Nov 7, 2026 · <a href="[^"]+tag\/v0\.1\.3276">Release notes/);
  assert.match(html, /win-arm64|Slipgates-win-arm64-Setup\.exe/);
});

test('download block: shows SHA-256 when the manifest has it, says so plainly when it does not', () => {
  assert.match(renderDownload(manifest(), config), /No SHA-256 checksums are published/);
  const m = manifest();
  m.downloads['win-x64'].sha256 = 'A'.repeat(64);
  m.downloads['win-arm64'].sha256 = 'b'.repeat(64);
  const html = renderDownload(m, config);
  assert.match(html, new RegExp(`x64: <code>${'a'.repeat(64)}</code>`));
  assert.match(html, new RegExp(`Arm64: <code>${'b'.repeat(64)}</code>`));
});

test('download block: missing metadata falls back to GitHub Releases, never a dead button', () => {
  const html = renderDownload(null, config);
  assert.match(html, /data-state="fallback"/);
  assert.match(html, /href="https:\/\/github\.com\/danswett\/agent-bridge\/releases">Download from GitHub Releases/);
});

test('chooseState trusts only real hints', () => {
  assert.equal(chooseState(null), 'unknown');
  assert.equal(chooseState({ platform: 'Windows', architecture: 'arm', bitness: '64' }), 'arm64');
  assert.equal(chooseState({ platform: 'Windows', architecture: 'x86', bitness: '64' }), 'x64');
  assert.equal(chooseState({ platform: 'Windows' }), 'unknown');
  assert.equal(chooseState({ platform: 'macOS', architecture: 'arm', bitness: '64' }), 'not-windows');
});

test('apply swaps the links for Arm64 and reveals the not-Windows line', () => {
  const els = {
    download: { dataset: { state: 'ready', x64: 'X', arm64: 'A' } },
    get: { href: 'X' },
    'alt-link': { href: 'A', textContent: 'Windows on Arm? Get the Arm64 version.' },
    notwindows: { hidden: true },
  };
  const doc = { getElementById: (id) => els[id] };
  apply(doc, 'arm64');
  assert.equal(els.get.href, 'A');
  assert.equal(els['alt-link'].href, 'X');
  assert.equal(els['alt-link'].textContent, 'Need x64 instead?');
  apply(doc, 'not-windows');
  assert.equal(els.notwindows.hidden, false);
});

test('built site: pages exist, links are relative, and nothing loads from another origin', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'site-'));
  const file = path.join(dir, 'm.json');
  writeFileSync(file, JSON.stringify(manifest()));
  execFileSync(process.execPath, ['build/build.mjs'], { cwd: root, env: { ...process.env, BETA_MANIFEST_FILE: file } });
  const read = (p) => readFileSync(path.join(root, 'dist', p), 'utf8');
  for (const p of ['index.html', 'download/index.html', 'docs/index.html', 'privacy/index.html', 'conditions/index.html', '404.html']) {
    const html = read(p);
    assert.doesNotMatch(html, /\{\{/, `${p} has an unreplaced placeholder`);
    assert.match(html, /<html lang="en">/);
    assert.doesNotMatch(html, /(src|href)="https?:\/\/(?!github\.com\/|danswett\.github\.io\/agent-bridge\/app\/)/, `${p} references another origin`);
    assert.match(html, /http-equiv="Content-Security-Policy"/, `${p} has no CSP`);
    assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)/, `${p} has an inline script`);
    assert.doesNotMatch(html, /\son[a-z]+=|\sstyle=|javascript:/i, `${p} has inline handlers or styles`);
  }
  const build = (base) => {
    execFileSync(process.execPath, ['build/build.mjs'], { cwd: root, env: { ...process.env, BETA_MANIFEST_FILE: file, SITE_BASE: base } });
    return read('404.html');
  };
  assert.match(build('/slipgates-site'), /href="\/slipgates-site\/tokens\.css"/);
  assert.match(build('/slipgates-site/'), /href="\/slipgates-site\/docs\/"/);
  assert.match(build(''), /href="\/tokens\.css"/);
  assert.match(read('docs/index.html'), /href="\.\.\/tokens\.css"/);
  assert.match(read('index.html'), /href="tokens\.css"/);
  assert.equal(JSON.parse(read('beta-release.json')).tag, 'v0.1.3276');
  assert.doesNotMatch(read('site.css') + read('tokens.css'), /url\(["']?https?:/);
});

test('logo intro: scoped to the home lockup, opacity and transform only, fade-only under reduced motion', () => {
  const css = readFileSync(path.join(root, 'src/site.css'), 'utf8');
  const reduced = css.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/)[1];
  const outside = css.replace(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/, '');
  const selectors = [...css.matchAll(/^([^@{}\n]+)\{[^}]*animation:/gm)].map((m) => m[1].trim());
  assert.ok(selectors.length >= 4);
  for (const s of selectors) assert.match(s, /^\.lockup /, `${s} is not scoped to the lockup`);
  assert.doesNotMatch(css, /\.(site-header|mark-24)[^{]*\{[^}]*animation/);
  assert.match(outside, /translateX\(14px\)/);
  assert.match(outside, /translateX\(-14px\)/);
  assert.match(outside, /translateX\(-4px\)/);
  for (const k of css.matchAll(/@keyframes [\w-]+ \{ from \{([^}]*)\}/g)) {
    assert.doesNotMatch(k[1], /(?:^|;)\s*(?!opacity|transform)[a-z-]+\s*:/, 'keyframes may only change opacity and transform');
  }
  const ease = 'cubic-bezier\\(0, 0, 0, 1\\)';
  assert.match(outside, new RegExp(`\\.top \\{ animation: slip-top 700ms ${ease} 400ms backwards; \\}`));
  assert.match(outside, new RegExp(`\\.bot \\{ animation: slip-bot 700ms ${ease} 500ms backwards; \\}`));
  assert.match(outside, new RegExp(`\\.wordmark \\{ animation: slip-word 450ms ${ease} 900ms backwards; \\}`));
  assert.match(reduced, /animation: slip-fade 83ms linear backwards;/);
  assert.doesNotMatch(reduced, /translate|transform/);
  assert.match(css, /@keyframes slip-fade \{ from \{ opacity: 0; \} \}/);
  assert.doesNotMatch(css, /@keyframes[^}]*\{[^}]*infinite/);
  const home = readFileSync(path.join(root, 'dist/index.html'), 'utf8');
  assert.match(home, /<h1 class="lockup"><svg class="mark mark-lockup" aria-hidden="true"[\s\S]*?<span class="wordmark">Slipgates<\/span><\/h1>/);
  assert.equal((home.match(/class="top"/g) ?? []).length, 1);
  assert.doesNotMatch(readFileSync(path.join(root, 'dist/docs/index.html'), 'utf8'), /class="(top|bot)"|mark-lockup/);
});
