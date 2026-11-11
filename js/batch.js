// Loading the CSV and photos, and checking every row.

import { $, basename, stemOf, hash } from './utils.js';
import { cfg, resolvePreset } from './config.js';
import { state } from './state.js';
import { LS_PROGRESS, restoreProgress } from './progress.js';
import { isBigEnough } from './crop-math.js';
import { renderSetup } from './setup.js';
import { resetSession } from './nav.js';
import { clearBitmapCache } from './workspace.js';

/* ---------- CSV ---------- */

/*
 * Two kinds of CSV are accepted:
 *
 *   Preset list:     filename, preset, [output_filename]
 *   Course template: code, slides, your_photo, width, height, format, ...
 *                    (made from a published course; one row per image slot)
 *
 * Each row gets:
 *   index, line        position in the CSV (line counts the header as line 1)
 *   filename           the photo to crop
 *   key                lowercase filename used to find the photo
 *   preset             { name, width, height } to crop to
 *   outName            output filename before the extension is set
 *   kind               'ready' | 'bad' | 'pending' | 'skip' (template slot left blank)
 *   issue, warn        messages for the user
 * Template rows also get: code, slides, fmt, manual, storyline, hotspots.
 */
const TEMPLATE_FIELDS = ['code', 'slides', 'your_photo', 'width', 'height'];

/** Slide numbers like "1.10". Reading them as text means Excel can't turn 1.10 into 1.1. */
const parseSlides = s => (String(s || '').match(/\d+\.\d+/g) || []);

/** "x,y,w,h;r:x,y,w,h" as fractions of the image. Plain = oval, "r:" = rectangle. */
function parseHotspots(s) {
  return String(s || '').split(';').map(part => {
    part = part.trim();
    const rect = part.startsWith('r:');
    const v = (rect ? part.slice(2) : part).split(',').map(Number);
    return v.length === 4 && v.every(Number.isFinite) ? { shape: rect ? 'rect' : 'oval', x: v[0], y: v[1], w: v[2], h: v[3] } : null;
  }).filter(Boolean);
}

export function parseCsv(text) {
  state.csvErrors = [];
  state.csvWarnings = [];
  state.rows = [];
  const res = window.Papa.parse(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: h => h.trim().toLowerCase().replace(/\s+/g, '_')
  });
  const fields = res.meta.fields || [];
  state.mode = fields.includes('code') && fields.includes('width') ? 'template' : 'presets';
  const required = state.mode === 'template' ? TEMPLATE_FIELDS : ['filename', 'preset'];
  const missing = required.filter(f => !fields.includes(f));
  if (missing.length) {
    state.csvErrors.push(state.mode === 'template'
      ? `This looks like a course template, but it's missing the ${missing.join(', ')} column${missing.length > 1 ? 's' : ''}. Download a fresh copy of the template and fill that in.`
      : `The CSV needs a column named ${missing.map(m => `"${m}"`).join(' and a column named ')}. ` +
        `The first row should read: filename,preset. Columns found: ${fields.length ? fields.join(', ') : 'none'}.`);
    return;
  }
  res.errors.slice(0, 5).forEach(e => state.csvWarnings.push(`Line ${(e.row ?? 0) + 2}: ${e.message}`));
  res.data.forEach((r, i) => {
    const row = { index: i, line: i + 2 };
    if (state.mode === 'template') {
      Object.assign(row, {
        code: String(r.code ?? '').trim(),
        slides: parseSlides(r.slides),
        filename: basename(r.your_photo),
        width: Number(r.width),
        height: Number(r.height),
        fmt: String(r.format ?? '').trim().toLowerCase() === 'png' ? 'png' : 'jpg',
        manual: String(r.manual_in_storyline ?? '').trim(),
        storyline: String(r.storyline_name ?? '').trim(),
        hotspots: parseHotspots(r.hotspot_guide),
        presetRaw: '',
        outputRaw: ''
      });
    } else {
      Object.assign(row, {
        filename: basename(r.filename),
        presetRaw: String(r.preset ?? '').trim(),
        outputRaw: basename(r.output_filename ?? '')
      });
    }
    state.rows.push(row);
  });
  if (!state.rows.length) state.csvErrors.push('The CSV has a header row but nothing listed under it.');
}

export const isTemplate = () => state.mode === 'template';

/** Recheck every row against the presets, the photos and each other. Safe to call any time. */
export function computeStatuses() {
  const outSeen = new Map();
  const names = cfg.current.presets.map(p => p.name).join(', ');

  for (const r of state.rows) {
    r.kind = 'ready';
    r.issue = null;
    r.warn = null;
    r.key = r.filename.toLowerCase();
    const bad = msg => { r.kind = 'bad'; r.issue = msg; };

    if (isTemplate()) {
      r.preset = { id: r.code, name: r.code, width: r.width, height: r.height };
      r.outName = `${r.code}_${r.slides.join('-')}`;
      if (!r.code) { bad('This row has no code. The template may have been edited by mistake.'); continue; }
      if (![r.width, r.height].every(v => Number.isInteger(v) && v > 0)) {
        bad("This row's size is missing or not a whole number. The template may have been edited by mistake.");
        continue;
      }
      if (!r.filename) { r.kind = 'skip'; continue; } // keeping the course's current photo
    } else {
      r.preset = resolvePreset(r.presetRaw);
      r.outName = r.outputRaw || r.filename;
      if (!r.filename) bad('This row has no filename.');
      else if (!r.presetRaw) bad('This row has no preset.');
      else if (!r.preset) bad(`"${r.presetRaw}" isn't a preset. Use one of: ${names}.`);
    }

    // Two rows can use the same photo, but not produce the same output file.
    const outKey = (isTemplate() ? r.outName : stemOf(r.outName)).toLowerCase();
    if (r.filename) {
      const first = outSeen.get(outKey);
      if (first && !r.issue) {
        const sameEntry = first.key === r.key && first.preset === r.preset && !r.outputRaw && !first.outputRaw;
        bad(isTemplate()
          ? `Same code and slides as row ${first.line}. The template may have a duplicate line.`
          : sameEntry
            ? `Duplicate of row ${first.line}. This copy is skipped.`
            : `Would create the same output file as row ${first.line}. Give one of them a different output_filename.`);
      }
      if (!first) outSeen.set(outKey, r);
    }
    if (r.issue) continue;

    if (!state.files.size) { r.kind = 'pending'; continue; }
    if (!state.files.has(r.key)) { bad('Photo not found in the ZIP or folder you chose.'); continue; }
    if (state.dupFiles.has(r.key)) r.warn = 'More than one file with this name was found. Using the first one.';

    const d = state.dims.get(r.key);
    if (!d) { r.kind = 'pending'; continue; }
    if (d.error) {
      bad("Couldn't open this photo. It may be damaged or not a JPG or PNG.");
    } else if (!isBigEnough(d.w, d.h, r.preset)) {
      bad(`Too small. The photo is ${d.w} × ${d.h} px and ${r.preset.name} needs at least ${r.preset.width} × ${r.preset.height} px.`);
    }
  }
}

export const cropList = () => state.rows.filter(r => r.kind === 'ready');

/* ---------- Inputs ---------- */

export async function onCsvFile(file) {
  const text = (await file.text()).replace(/^﻿/, '');
  state.csvText = text;
  state.csvName = file.name;
  parseCsv(text);
  state.batchKey = LS_PROGRESS + hash(text);
  restoreProgress();
  resetSession();
  await refreshValidation();
}

function addFile(map, dups, name, getBlob) {
  const key = name.toLowerCase();
  if (map.has(key)) { dups.add(key); return; }
  map.set(key, { name, getBlob });
}

export async function onZipFile(file) {
  state.imgError = '';
  $('#imgStatus').textContent = 'Reading ZIP...';
  let zip;
  try {
    zip = await window.JSZip.loadAsync(file);
  } catch (e) {
    state.files = new Map();
    state.imgLabel = '';
    state.imgError = "Couldn't open that ZIP file. It may be damaged, or it may not be a ZIP.";
    resetSession();
    renderSetup();
    return;
  }
  const map = new Map();
  const dups = new Set();
  zip.forEach((path, entry) => {
    if (entry.dir || /(^|\/)__MACOSX\//.test(path)) return;
    const name = basename(path);
    if (!name || name.startsWith('.')) return;
    // Extracted only when needed, so large ZIPs don't fill memory.
    addFile(map, dups, name, () => entry.async('blob'));
  });
  await setFiles(map, dups, file.name);
}

export async function onFolder(fileList) {
  state.imgError = '';
  const list = Array.from(fileList);
  const map = new Map();
  const dups = new Set();
  list.forEach(f => { if (!f.name.startsWith('.')) addFile(map, dups, f.name, () => Promise.resolve(f)); });
  const folder = list[0] && list[0].webkitRelativePath ? list[0].webkitRelativePath.split('/')[0] : 'folder';
  await setFiles(map, dups, `Folder "${folder}"`);
}

async function setFiles(map, dups, label) {
  state.files = map;
  state.dupFiles = dups;
  state.imgLabel = label;
  state.dims = new Map();
  if (!map.size) state.imgError = 'No files were found in what you chose.';
  clearBitmapCache();
  resetSession();
  await refreshValidation();
}

/** Decode a photo, respecting the rotation stored by phones and cameras. Caller must close() it. */
export function decodeKey(key) {
  const f = state.files.get(key);
  if (!f) return Promise.reject(new Error('File not found.'));
  return f.getBlob().then(blob => createImageBitmap(blob, { imageOrientation: 'from-image' }));
}

/* ---------- Checking photos ---------- */

let checkToken = 0;

/** Open every listed photo once to read its size. Restarts cleanly if inputs change mid-check. */
export async function refreshValidation() {
  const token = ++checkToken;
  state.checking = null;
  computeStatuses();
  renderSetup();
  if (!state.rows.length || !state.files.size) return;

  const keys = [...new Set(state.rows.map(r => (r.filename || '').toLowerCase()))]
    .filter(k => k && state.files.has(k) && !state.dims.has(k));
  if (!keys.length) return;

  state.checking = { done: 0, total: keys.length };
  renderSetup();
  for (const k of keys) {
    if (token !== checkToken) return;
    try {
      const bmp = await decodeKey(k);
      state.dims.set(k, { w: bmp.width, h: bmp.height });
      bmp.close();
    } catch (e) {
      state.dims.set(k, { error: true });
    }
    state.checking.done++;
    const bar = $('#checkBar');
    const txt = $('#checkTxt');
    if (bar) bar.style.width = (100 * state.checking.done / state.checking.total) + '%';
    if (txt) txt.textContent = `Checking photos: ${state.checking.done} of ${state.checking.total}`;
  }
  if (token !== checkToken) return;
  state.checking = null;
  computeStatuses();
  renderSetup();
}
