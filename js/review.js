// Review screen: batch summary and per-photo status.

import { $, esc, plural } from './utils.js';
import { cfg } from './config.js';
import { state } from './state.js';
import { startCropping } from './workspace.js';
import { isTemplate } from './batch.js';

function statusPill(r) {
  if (r.kind === 'skip') return '<span class="pill todo">Keeping current photo</span>';
  if (r.kind === 'bad') return '<span class="pill bad">Problem</span>';
  if (r.kind !== 'ready') return '<span class="pill todo">Not checked</span>';
  return state.crops[r.index] ? '<span class="pill done">Confirmed</span>' : '<span class="pill todo">Not confirmed</span>';
}

function formatNote() {
  const { format, quality } = cfg.current.output;
  if (isTemplate()) {
    return `Each photo is saved in the same file type as the one it replaces. JPG quality ${quality}%. ` +
      'Photos Dan places by hand in Storyline go in a "Storyline" folder, and the rest in a "Production" folder.';
  }
  const text = {
    auto: 'Photos will be saved as JPG. PNGs with transparent areas stay PNG.',
    original: 'Photos keep their original file type.',
    jpg: 'All photos will be saved as JPG.',
    png: 'All photos will be saved as PNG.'
  }[format];
  return text + (format !== 'png' ? ` JPG quality ${quality}%.` : '') + ' Change this in Settings.';
}

export function renderReview() {
  const all = state.rows;
  const rows = all.filter(r => r.kind !== 'skip');
  const kept = all.length - rows.length;
  const ready = rows.filter(r => r.kind === 'ready');
  const done = ready.filter(r => state.crops[r.index]);
  const bad = rows.filter(r => r.kind === 'bad');
  const todo = ready.length - done.length;

  $('#rStats').innerHTML = [
    [rows.length, isTemplate() ? 'Photos to swap' : 'Photos listed'],
    [done.length, 'Confirmed'],
    [todo, 'Not confirmed yet'],
    [bad.length, 'With problems']
  ].map(([n, label]) => `<div class="stat"><b>${n}</b><span>${label}</span></div>`).join('');

  let notes = '';
  if (todo) {
    notes += `<div class="note warn">${plural(todo, 'photo')} ${todo === 1 ? "isn't" : "aren't"} confirmed yet and won't be in the ZIP. ` +
             `<button class="linkbtn" id="rGoTodo">Crop the next one</button></div>`;
  }
  if (bad.length) {
    notes += `<div class="note err">${plural(bad.length, 'photo')} with problems won't be in the ZIP. They're listed below and in the export report.</div>`;
  }
  if (!todo && !bad.length && done.length) notes += '<div class="note ok">Everything is confirmed and ready to export.</div>';
  if (isTemplate() && kept) notes += `<div class="note ok">${plural(kept, 'other photo slot')} ${kept === 1 ? 'keeps its' : 'keep their'} current photo.</div>`;
  $('#rNotes').innerHTML = notes;
  const goTodo = $('#rGoTodo');
  if (goTodo) goTodo.onclick = () => startCropping(null);

  const onlyIssues = $('#rOnlyIssues').checked;
  const shown = onlyIssues ? rows.filter(r => r.kind !== 'ready' || !state.crops[r.index] || r.warn) : all;
  $('#rHeadRow').textContent = isTemplate() ? 'Code' : 'Row';
  $('#rBody').innerHTML = shown.map(r => {
    const out = r.outputRaw ? `<div class="meta">saves as ${esc(r.outputRaw)}</div>` : '';
    const size = isTemplate()
      ? `${r.width} × ${r.height} ${r.fmt.toUpperCase()}<div class="meta">Slide${r.slides.length > 1 ? 's' : ''} ${esc(r.slides.join(', '))}${r.manual ? ' · manual' : ''}</div>`
      : r.preset
        ? `${esc(r.preset.name)}<div class="meta">${r.preset.width} × ${r.preset.height}</div>`
        : esc(r.presetRaw || '(blank)');
    const msg = r.issue || r.warn ? `<div class="meta">${esc(r.issue || r.warn)}</div>` : '';
    const action = r.kind === 'ready'
      ? `<button class="btn" data-open="${r.index}">${state.crops[r.index] ? 'Adjust' : 'Crop'}</button>` : '';
    return `<tr><td>${isTemplate() ? `<b>${esc(r.code)}</b>` : r.line}</td><td>${esc(r.filename || (isTemplate() ? '' : '(blank)'))}${out}</td><td>${size}</td><td>${statusPill(r)}${msg}</td><td>${action}</td></tr>`;
  }).join('') || '<tr><td colspan="5" class="meta">Nothing needs attention.</td></tr>';

  $('#rFormat').textContent = formatNote();
  $('#btnExport').disabled = !done.length;
}

export function initReview() {
  $('#rBody').addEventListener('click', e => {
    const b = e.target.closest('[data-open]');
    if (b) startCropping(Number(b.dataset.open));
  });
  $('#rOnlyIssues').onchange = renderReview;
}
