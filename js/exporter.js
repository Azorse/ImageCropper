// Renders confirmed crops at exact preset sizes and packages them in a ZIP.

import { $, esc, plural, extOf, stemOf, safeName, download } from './utils.js';
import { cfg } from './config.js';
import { state } from './state.js';
import { cropRect } from './crop-math.js';
import { decodeKey } from './batch.js';

function hasTransparency(c, w, h) {
  const d = c.getImageData(0, 0, w, h).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 255) return true;
  return false;
}

function pickType(srcExt, outCtx, w, h) {
  switch (cfg.current.output.format) {
    case 'png': return 'png';
    case 'jpg': return 'jpg';
    case 'original': return srcExt === 'png' ? 'png' : 'jpg';
    default: return srcExt === 'png' && hasTransparency(outCtx, w, h) ? 'png' : 'jpg';
  }
}

/** Draw the crop area into a canvas of exactly the preset size and encode it. */
export async function renderOutput(bmp, rect, preset, srcExt) {
  const tw = preset.width, th = preset.height;
  let src = bmp, sx = rect.x, sy = rect.y, sw = rect.w, sh = rect.h;

  // Shrink in halves for big reductions. Sharper than one big jump.
  while (sw > tw * 2 && sh > th * 2) {
    const w = Math.round(sw / 2), h = Math.round(sh / 2);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = true;
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
    if (src !== bmp) src.width = 0; // free the previous step
    src = c; sx = 0; sy = 0; sw = w; sh = h;
  }

  const out = document.createElement('canvas');
  out.width = tw; out.height = th;
  const oc = out.getContext('2d', { willReadFrequently: true });
  oc.imageSmoothingEnabled = true;
  oc.imageSmoothingQuality = 'high';
  oc.drawImage(src, sx, sy, sw, sh, 0, 0, tw, th);
  if (src !== bmp) src.width = 0;

  const type = pickType(srcExt, oc, tw, th);
  let fin = out;
  if (type === 'jpg') {
    // JPG has no transparency, so put a white background behind it.
    fin = document.createElement('canvas');
    fin.width = tw; fin.height = th;
    const fc = fin.getContext('2d');
    fc.fillStyle = '#fff';
    fc.fillRect(0, 0, tw, th);
    fc.drawImage(out, 0, 0);
  }
  if (fin.width !== tw || fin.height !== th) throw new Error('output size mismatch');

  const blob = await new Promise((resolve, reject) => fin.toBlob(
    b => b ? resolve(b) : reject(new Error('the browser could not save the image')),
    type === 'png' ? 'image/png' : 'image/jpeg',
    cfg.current.output.quality / 100));
  out.width = 0;
  fin.width = 0;
  return { blob, ext: type };
}

function buildReport(ok, skipped) {
  const lines = [
    'Batch Image Cropper export',
    `CSV: ${state.csvName}`,
    `Date: ${new Date().toLocaleString()}`,
    '',
    `Exported (${ok.length}):`,
    ...ok.map(([r, n]) => `  Row ${r.line}: ${r.filename} -> ${n} (${r.preset.name}, ${r.preset.width}x${r.preset.height})`),
    ''
  ];
  if (skipped.length) {
    lines.push(`Left out (${skipped.length}):`, ...skipped.map(([r, why]) => `  Row ${r.line}: ${r.filename || '(blank)'} - ${why}`));
  }
  return lines.join('\r\n');
}

async function doExport() {
  const btn = $('#btnExport'), status = $('#exStatus'), bar = $('#exBar'), wrap = $('#exBarWrap'), result = $('#exResult');
  btn.disabled = true;
  wrap.hidden = false;
  bar.style.width = '0';
  result.innerHTML = '';

  const zip = new window.JSZip();
  const used = new Set();
  const ok = [];
  const skipped = [];

  for (const r of state.rows) {
    if (r.kind === 'bad') skipped.push([r, r.issue]);
    else if (r.kind !== 'ready') skipped.push([r, 'Not checked yet.']);
    else if (!state.crops[r.index]) skipped.push([r, 'Crop not confirmed.']);
  }

  // One photo at a time so memory stays flat on big batches.
  const todo = state.rows.filter(r => r.kind === 'ready' && state.crops[r.index]);
  for (let i = 0; i < todo.length; i++) {
    const r = todo[i];
    status.textContent = `Saving ${i + 1} of ${todo.length}: ${r.filename}`;
    bar.style.width = (100 * i / todo.length) + '%';
    let bmp = null;
    try {
      bmp = await decodeKey(r.key);
      const p = r.preset;
      const rect = cropRect(state.crops[r.index], bmp.width, bmp.height, p.width, p.height);
      const { blob, ext } = await renderOutput(bmp, rect, p, extOf(r.filename));
      const stem = safeName(stemOf(r.outName));
      let name = `${stem}.${ext}`, k = 2;
      while (used.has(name.toLowerCase())) name = `${stem}_${k++}.${ext}`;
      used.add(name.toLowerCase());
      zip.file(name, blob);
      ok.push([r, name]);
    } catch (e) {
      skipped.push([r, `Couldn't be saved (${e && e.message ? e.message : e}).`]);
    } finally {
      if (bmp) bmp.close();
    }
  }
  bar.style.width = '100%';
  skipped.sort((a, b) => a[0].line - b[0].line);

  if (!ok.length) {
    status.textContent = '';
    result.innerHTML = '<div class="note err">Nothing could be exported. Confirm at least one crop and try again.</div>';
    btn.disabled = false;
    wrap.hidden = true;
    return;
  }

  zip.file('export_report.txt', buildReport(ok, skipped));
  status.textContent = 'Building ZIP...';
  try {
    // Photos are already compressed, so storing is faster with no size cost.
    const zblob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    download(zblob, `${safeName(stemOf(state.csvName)) || 'photos'}_cropped.zip`);
    status.textContent = '';
    result.innerHTML = `<div class="note ok">Downloaded ${plural(ok.length, 'photo')}.</div>` + (skipped.length
      ? `<div class="note warn">${skipped.length === 1 ? '1 photo was' : skipped.length + ' photos were'} left out:<ul>${
          skipped.map(([r, why]) => `<li>Row ${r.line}: ${esc(r.filename || '(blank)')}. ${esc(why)}</li>`).join('')}</ul></div>`
      : '');
  } catch (e) {
    status.textContent = '';
    result.innerHTML = "<div class=\"note err\">The ZIP couldn't be built. The batch may be too large for the browser's memory. Try exporting in smaller batches.</div>";
  }
  btn.disabled = false;
  wrap.hidden = true;
}

export function initExport() {
  $('#btnExport').onclick = doExport;
}
