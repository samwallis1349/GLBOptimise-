import { ApiError, MAX_UPLOAD_BYTES, reduceGlb, requestFreeKey } from './api.js';

const $ = (id) => document.getElementById(id);
const KEY = 'apiKey';
const SETTINGS = 'settings';

let apiKey = '';
let chosen = null;

const fmtBytes = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(2)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const fmtInt = (n) => n.toLocaleString('en-GB');

function status(text, kind = '') {
  $('status').textContent = text;
  $('status').className = kind;
}

function showKeyScreen(hasKey) {
  $('keySection').hidden = hasKey;
  $('main').hidden = !hasKey;
  $('forgetKey').hidden = !hasKey;
}

async function saveKey(key) {
  apiKey = key.trim();
  await chrome.storage.local.set({ [KEY]: apiKey });
  showKeyScreen(Boolean(apiKey));
}

function choose(file) {
  $('result').hidden = true;
  if (!file) return;
  if (!/\.glb$/i.test(file.name)) {
    chosen = null;
    $('run').disabled = true;
    return status('Choose a .glb file (binary glTF).', 'bad');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    chosen = null;
    $('run').disabled = true;
    return status(`That file is ${fmtBytes(file.size)}; the limit is 25 MB.`, 'bad');
  }
  chosen = file;
  $('fileName').textContent = file.name;
  $('fileHint').textContent = fmtBytes(file.size);
  $('run').disabled = false;
  status('');
}

function showResult(report) {
  const removed = Math.round(report.reduction.triangles * 100);
  const result = $('result');
  result.replaceChildren();
  const dl = document.createElement('dl');
  for (const [label, value] of [
    ['Triangles', `${fmtInt(report.before.triangles)} → ${fmtInt(report.after.triangles)}`],
    ['Removed', `${removed}%`],
    ['File size', `${fmtBytes(report.before.fileBytes)} → ${fmtBytes(report.after.fileBytes)}`],
  ]) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    dl.append(dt, dd);
  }
  result.append(dl);
  if (report.warnings.length) {
    const ul = document.createElement('ul');
    for (const w of report.warnings) {
      const li = document.createElement('li');
      li.textContent = w;
      ul.append(li);
    }
    result.append(ul);
  }
  result.hidden = false;
}

async function run() {
  if (!chosen) return;
  const keep = Number($('keep').value) / 100;
  const acrossSeams = $('acrossSeams').checked;
  $('run').disabled = true;
  status('Reducing…');
  try {
    const { bytes, name, report } = await reduceGlb({ file: chosen, name: chosen.name, key: apiKey, keep, acrossSeams });
    const url = URL.createObjectURL(new Blob([bytes], { type: 'model/gltf-binary' }));
    await chrome.downloads.download({ url, filename: name, saveAs: false });
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    showResult(report);
    status(`Saved ${name} to your downloads.`, 'ok');
  } catch (err) {
    if (err instanceof ApiError && ['invalid_api_key', 'key_replaced', 'key_revoked'].includes(err.code)) {
      await saveKey('');
      return status('That key is no longer valid. Add a new one.', 'bad');
    }
    status(err.message || 'Something went wrong.', 'bad');
  } finally {
    $('run').disabled = !chosen;
  }
}

$('getKey').addEventListener('click', async () => {
  $('getKey').disabled = true;
  status('Requesting a free key…');
  try {
    const { key, replaced } = await requestFreeKey();
    await saveKey(key);
    status(replaced ? 'New key saved. Your network’s previous free key has been switched off.' : 'Key saved. Drop a model to start.', 'ok');
  } catch (err) {
    status(err.message, 'bad');
  } finally {
    $('getKey').disabled = false;
  }
});

$('saveKey').addEventListener('click', async () => {
  const value = $('keyInput').value.trim();
  if (!/^abk_/.test(value)) return status('Keys start with abk_.', 'bad');
  await saveKey(value);
  $('keyInput').value = '';
  status('Key saved.', 'ok');
});

$('forgetKey').addEventListener('click', async () => {
  await saveKey('');
  status('');
});

const drop = $('drop');
drop.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    $('file').click();
  }
});
$('file').addEventListener('change', (e) => choose(e.target.files[0]));
drop.addEventListener('dragover', (e) => {
  e.preventDefault();
  drop.classList.add('is-over');
});
drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('is-over');
  choose(e.dataTransfer.files[0]);
});

const remember = () => chrome.storage.local.set({ [SETTINGS]: { keep: $('keep').value, acrossSeams: $('acrossSeams').checked } });
$('keep').addEventListener('input', () => {
  $('keepLabel').textContent = `${$('keep').value}%`;
  remember();
});
$('acrossSeams').addEventListener('change', remember);
$('run').addEventListener('click', run);

const stored = await chrome.storage.local.get([KEY, SETTINGS]);
apiKey = stored[KEY] || '';
if (stored[SETTINGS]) {
  $('keep').value = stored[SETTINGS].keep;
  $('keepLabel').textContent = `${stored[SETTINGS].keep}%`;
  $('acrossSeams').checked = Boolean(stored[SETTINGS].acrossSeams);
}
showKeyScreen(Boolean(apiKey));
