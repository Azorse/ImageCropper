// Setup screen: choosing the CSV and photos, and showing what's ready.

import { $, esc, plural, download } from './utils.js';
import { cfg } from './config.js';
import { state } from './state.js';
import { clearProgress } from './progress.js';
import { onCsvFile, onZipFile, onFolder, isTemplate } from './batch.js';
import { startCropping } from './workspace.js';

export function renderSetup() {
  $('#csvStatus').textContent = state.csvName
    ? `${state.csvName} · ${isTemplate() ? `course template, ${plural(state.rows.length, 'photo slot')}` : plural(state.rows.length, 'row')}`
    : 'No file chosen';
  let csvHtml = '';
  if (state.csvErrors.length) csvHtml += `<div class="note err">${state.csvErrors.map(esc).join('<br>')}</div>`;
  if (state.csvWarnings.length) {
    csvHtml += `<div class="note warn">Some lines in the CSV look off:<ul>${state.csvWarnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>`;
  }
  $('#csvMsgs').innerHTML = csvHtml;

  $('#imgStatus').textContent = state.imgLabel ? `${state.imgLabel} · ${plural(state.files.size, 'file')}` : 'No photos chosen';
  $('#imgMsgs').innerHTML = state.imgError ? `<div class="note err">${esc(state.imgError)}</div>` : '';

  const box = $('#validation');
  const btn = $('#btnStart');
  btn.disabled = true;
  btn.textContent = 'Start cropping';

  if (!state.csvName || state.csvErrors.length || !state.files.size) {
    box.innerHTML = state.csvErrors.length
      ? 'Fix the CSV problem above, then choose the file again.'
      : "Load the CSV and the photos to see what's ready.";
    return;
  }

  const rows = state.rows;
  const ready = rows.filter(r => r.kind === 'ready');
  const bad = rows.filter(r => r.kind === 'bad');
  const pending = rows.filter(r => r.kind === 'pending');
  let html = '';

  if (state.checking) {
    const pct = 100 * state.checking.done / state.checking.total;
    html += `<div id="checkTxt">Checking photos: ${state.checking.done} of ${state.checking.total}</div>` +
            `<div class="progressbar"><div id="checkBar" style="width:${pct}%"></div></div>`;
  } else {
    const kept = rows.filter(r => r.kind === 'skip').length;
    html += isTemplate()
      ? `<div><b>${rows.length - kept}</b> of ${rows.length} photo slots have a new photo. <b>${ready.length}</b> ready to crop` +
        `${bad.length ? `, <b>${bad.length}</b> with problems` : ''}. The other ${kept} keep the course's current photo.</div>`
      : `<div><b>${rows.length}</b> photos listed. <b>${ready.length}</b> ready to crop` +
        `${bad.length ? `, <b>${bad.length}</b> with problems` : ''}.</div>`;
  }

  if (state.restored) {
    const when = state.restored.savedAt ? new Date(state.restored.savedAt).toLocaleString() : 'earlier';
    html += `<div class="note ok">Picked up where you left off: ${plural(state.restored.count, 'saved crop')} from ${esc(when)}. ` +
            `<button class="linkbtn" id="btnFresh">Start fresh instead</button></div>`;
  }

  const flagged = rows.filter(r => r.kind === 'bad' || r.warn);
  if (flagged.length && !state.checking) {
    html += `<div class="note ${bad.length ? 'err' : 'warn'}">${bad.length
      ? 'Photos with problems will be skipped and listed in the export report. You can fix the CSV or the photos and load them again, or carry on without them.'
      : 'Heads up on a few photos:'}</div>`;
    html += `<div class="tablewrap"><table><thead><tr><th>${isTemplate() ? 'Code' : 'Row'}</th><th>Photo</th><th>Problem</th></tr></thead><tbody>${
      flagged.map(r => `<tr><td>${isTemplate() ? esc(r.code) : r.line}</td><td>${esc(r.filename || '(blank)')}</td><td>${esc(r.issue || r.warn)}</td></tr>`).join('')
    }</tbody></table></div>`;
  }
  box.innerHTML = html;

  const fresh = $('#btnFresh');
  if (fresh) fresh.onclick = () => { clearProgress(); renderSetup(); };

  if (isTemplate() && !ready.length && !bad.length && !state.checking) {
    box.innerHTML += '<div class="note warn">None of the photo slots have a photo filled in. Put each new photo\'s filename in the your_photo column of the template, then load it again.</div>';
  }

  if (!state.checking && !pending.length && ready.length) {
    btn.disabled = false;
    const done = ready.filter(r => state.crops[r.index]).length;
    btn.textContent = done
      ? `Continue cropping (${done} of ${ready.length} done)`
      : `Start cropping (${plural(ready.length, 'photo')})`;
  }
}

function downloadSampleCsv() {
  const p = cfg.current.presets;
  const csv = [
    'filename,preset,output_filename',
    `Photo_001.jpg,${p[0].name},`,
    `Photo_002.jpg,${p[5].name},`,
    `Photo_003.png,${p[2].name},`,
    `Photo_003.png,${p[4].name},Photo_003_wide.jpg`
  ].join('\r\n');
  download(new Blob([csv], { type: 'text/csv' }), 'sample_photo_list.csv');
}

/** Course templates live in templates/, listed in templates/index.json. */
async function loadTemplateList() {
  const box = $('#templateList');
  try {
    const res = await fetch('templates/index.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error();
    const list = await res.json();
    if (!Array.isArray(list) || !list.length) throw new Error();
    box.innerHTML = list.map(t => `<div class="tpl"><b>${esc(t.name)}</b>` +
      `<a class="btn" href="${esc(t.csv)}" download>Photo list (CSV)</a>` +
      `<a class="btn" href="${esc(t.guide)}" target="_blank" rel="noopener">Photo guide</a></div>`).join('');
    $('#templatesCard').hidden = false;
  } catch (e) {
    $('#templatesCard').hidden = true;
  }
}

export function initSetup() {
  loadTemplateList();
  $('#btnCsv').onclick = () => $('#inCsv').click();
  $('#btnZip').onclick = () => $('#inZip').click();
  $('#btnFolder').onclick = () => $('#inFolder').click();
  // Inputs are cleared after reading so choosing the same file again still fires.
  $('#inCsv').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) onCsvFile(f); };
  $('#inZip').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) onZipFile(f); };
  $('#inFolder').onchange = e => { const fl = e.target.files; if (fl && fl.length) onFolder(fl); e.target.value = ''; };
  $('#btnStart').onclick = () => startCropping(null);
  $('#btnSample').onclick = downloadSampleCsv;
}
