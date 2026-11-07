// Chooses which installer the primary button gets. Only userAgentData is trusted (never the
// user-agent string). An x64 browser on Windows on Arm reports x86, so the x64 state keeps the
// Arm64 link visible.
export function chooseState(info) {
  if (!info || !info.platform) return 'unknown';
  if (info.platform !== 'Windows') return 'not-windows';
  if (info.architecture === 'arm' && String(info.bitness) === '64') return 'arm64';
  if (info.architecture === 'x86' && String(info.bitness) === '64') return 'x64';
  return 'unknown';
}

async function readHints() {
  const uad = globalThis.navigator?.userAgentData;
  if (!uad) return null;
  try {
    const h = await uad.getHighEntropyValues(['architecture', 'bitness', 'platform']);
    return { platform: h.platform || uad.platform, architecture: h.architecture, bitness: h.bitness };
  } catch {
    return { platform: uad.platform };
  }
}

export function apply(doc, state) {
  const box = doc.getElementById('download');
  if (!box) return;
  const notWindows = doc.getElementById('notwindows');
  if (state === 'not-windows' && notWindows) notWindows.hidden = false;
  if (box.dataset.state !== 'ready' || state !== 'arm64') return;
  doc.getElementById('get').href = box.dataset.arm64;
  const alt = doc.getElementById('alt-link');
  alt.href = box.dataset.x64;
  alt.textContent = 'Need x64 instead?';
}

if (typeof document !== 'undefined') {
  readHints().then((info) => apply(document, chooseState(info)));
}
