// Settings dialog: presets, output format, import and export.

import { $, esc, download } from './utils.js';
import { cfg, normalizeConfig, saveConfig } from './config.js';
import { state, view } from './state.js';
import { computeStatuses, cropList } from './batch.js';
import { renderSetup } from './setup.js';
import { renderReview } from './review.js';
import { openPos } from './workspace.js';
import { showView, getView } from './nav.js';

function fillForm(c) {
  $('#setBody').innerHTML = c.presets.map(p => `<tr data-id="${p.id}">
    <td><code>${p.id}</code></td>
    <td><input type="text" data-f="name" value="${esc(p.name)}"></td>
    <td><input type="number" data-f="width" min="1" max="10000" step="1" value="${p.width}"></td>
    <td><input type="number" data-f="height" min="1" max="10000" step="1" value="${p.height}"></td></tr>`).join('');
  $('#setFormat').value = c.output.format;
  $('#setQuality').value = c.output.quality;
  $('#setRestore').textContent = cfg.team ? 'Restore team defaults' : 'Restore defaults';
}

function readForm() {
  return {
    presets: [...$('#setBody').querySelectorAll('tr')].map(tr => ({
      id: tr.dataset.id,
      name: tr.querySelector('[data-f=name]').value,
      width: Number(tr.querySelector('[data-f=width]').value),
      height: Number(tr.querySelector('[data-f=height]').value)
    })),
    output: { format: $('#setFormat').value, quality: Number($('#setQuality').value) }
  };
}

function setMsg(kind, html) {
  $('#setMsg').innerHTML = html ? `<div class="note ${kind}">${html}</div>` : '';
}
const showErrors = errors => setMsg('err', errors.map(esc).join('<br>'));

/** Re-check the batch after presets change, and keep the user where they were. */
function onConfigChanged() {
  if (!state.rows.length) return;
  computeStatuses();
  renderSetup();
  if (getView() === 'crop' && view.row) {
    const idx = view.row.index;
    view.list = cropList();
    if (!view.list.length) { showView('review'); return; }
    const pos = view.list.findIndex(r => r.index === idx);
    openPos(pos >= 0 ? pos : 0);
  } else if (getView() === 'review') {
    renderReview();
  }
}

export function initSettings() {
  const dlg = $('#settings');
  $('#btnSettings').onclick = () => { fillForm(cfg.current); setMsg(); dlg.showModal(); };
  $('#setClose').onclick = () => dlg.close();

  $('#setSave').onclick = () => {
    const r = normalizeConfig(readForm());
    if (r.errors.length) return showErrors(r.errors);
    const stored = saveConfig(r.config);
    fillForm(cfg.current);
    setMsg(stored ? 'ok' : 'warn', stored ? 'Saved.' : "Changes apply now, but this browser wouldn't let them be saved for next time.");
    onConfigChanged();
  };

  $('#setRestore').onclick = () => {
    fillForm(cfg.defaults);
    setMsg('warn', 'Defaults are filled in. Click Save changes to keep them.');
  };

  $('#setExport').onclick = () => {
    const r = normalizeConfig(readForm());
    if (r.errors.length) return showErrors(r.errors);
    download(new Blob([JSON.stringify(r.config, null, 2)], { type: 'application/json' }), 'presets.json');
  };

  $('#setImport').onclick = () => $('#inSettings').click();
  $('#inSettings').onchange = async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    let r;
    try { r = normalizeConfig(JSON.parse(await f.text())); }
    catch (err) { r = { errors: ["That file isn't valid JSON."] }; }
    if (r.errors.length) return showErrors(r.errors);
    fillForm(r.config);
    setMsg('warn', 'Imported into the form. Click Save changes to keep it.');
  };
}
