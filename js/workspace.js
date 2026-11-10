// Crop workspace: one photo at a time, drag to position, zoom, confirm.

import { $, clamp } from './utils.js';
import { state, view } from './state.js';
import { baseCrop, maxZoom, cropRect, defaultCrop } from './crop-math.js';
import { decodeKey, cropList } from './batch.js';
import { saveProgress } from './progress.js';
import { showView, getView } from './nav.js';

let stageEl, canvas, ctx;

/* ---------- Photo cache ---------- */
// Keeps the current, previous and next photos decoded so moving between
// them is instant, and closes the rest to free memory.

const bmpCache = new Map();
const CACHE_SIZE = 4;

function getBitmap(key) {
  if (!bmpCache.has(key)) {
    const p = decodeKey(key);
    p.catch(() => bmpCache.delete(key));
    bmpCache.set(key, p);
  }
  const keep = new Set([key, view.list[view.pos]?.key, view.list[view.pos + 1]?.key, view.list[view.pos - 1]?.key]);
  for (const [k, p] of bmpCache) {
    if (bmpCache.size <= CACHE_SIZE) break;
    if (!keep.has(k)) { bmpCache.delete(k); p.then(b => b.close()).catch(() => {}); }
  }
  return bmpCache.get(key);
}

export function clearBitmapCache() {
  for (const p of bmpCache.values()) p.then(b => b.close()).catch(() => {});
  bmpCache.clear();
}

/* ---------- Navigation ---------- */

/** Open the workspace at a CSV row, or at the first unconfirmed photo when targetIndex is null. */
export function startCropping(targetIndex) {
  view.list = cropList();
  if (!view.list.length) return;
  state.started = true;
  let pos = targetIndex != null
    ? view.list.findIndex(r => r.index === targetIndex)
    : view.list.findIndex(r => !state.crops[r.index]);
  if (pos < 0) pos = 0;
  showView('crop');
  openPos(pos);
}

export async function openPos(pos) {
  view.pos = pos;
  const row = view.row = view.list[pos];
  const saved = state.crops[row.index];
  view.draft = saved ? { ...saved } : defaultCrop();
  view.bmp = null;
  const msg = $('#stageMsg');
  msg.textContent = 'Loading photo...';
  msg.hidden = false;
  renderChrome();
  draw();

  const token = ++view.token;
  try {
    const bmp = await getBitmap(row.key);
    if (token !== view.token) return;
    view.bmp = bmp;
    msg.hidden = true;
    normalizeDraft();
    draw();
    const next = view.list[pos + 1];
    if (next) getBitmap(next.key).catch(() => {});
  } catch (e) {
    if (token !== view.token) return;
    msg.textContent = "Couldn't open this photo. Skip it for now; it won't be exported.";
  }
}

function goPrev() { if (view.pos > 0) openPos(view.pos - 1); }
function goNext() { if (view.pos < view.list.length - 1) openPos(view.pos + 1); }

function confirmCrop() {
  if (!view.bmp) return;
  state.crops[view.row.index] = { ...view.draft };
  saveProgress();
  if (view.pos < view.list.length - 1) openPos(view.pos + 1);
  else showView('review');
}

/* ---------- Crop edits ---------- */

/** Pull the draft back inside the photo after any move or zoom. */
function normalizeDraft() {
  const b = view.bmp, p = view.row.preset;
  const r = cropRect(view.draft, b.width, b.height, p.width, p.height);
  view.draft = { cx: (r.x + r.w / 2) / b.width, cy: (r.y + r.h / 2) / b.height, zoom: r.zoom };
}

/** Zoom while keeping the point under (mx, my) in place. Defaults to the frame center. */
function zoomTo(newZoom, mx, my) {
  if (!view.bmp || !view.frame) return;
  const b = view.bmp, p = view.row.preset, f = view.frame, r = view.rect, s = view.scale;
  if (mx == null) { mx = f.x + f.w / 2; my = f.y + f.h / 2; }
  const px = r.x + (mx - f.x) / s;
  const py = r.y + (my - f.y) / s;
  const z = clamp(newZoom, 1, maxZoom(b.width, b.height, p.width, p.height));
  const base = baseCrop(b.width, b.height, p.width, p.height);
  const w = base.w / z, h = base.h / z, s2 = f.w / w;
  const nx = px - (mx - f.x) / s2;
  const ny = py - (my - f.y) / s2;
  view.draft = { cx: (nx + w / 2) / b.width, cy: (ny + h / 2) / b.height, zoom: z };
  normalizeDraft();
  view.rect = cropRect(view.draft, b.width, b.height, p.width, p.height);
  view.scale = f.w / view.rect.w;
  scheduleDraw();
}

/** Move the crop by a distance in photo pixels. */
function panBy(dx, dy) {
  const b = view.bmp;
  view.draft.cx += dx / b.width;
  view.draft.cy += dy / b.height;
  normalizeDraft();
  scheduleDraw();
}

function resetCrop() {
  if (!view.bmp) return;
  view.draft = defaultCrop();
  normalizeDraft();
  scheduleDraw();
}

/* ---------- Drawing ---------- */

function renderChrome() {
  const row = view.row, p = row.preset;
  $('#cFile').textContent = row.filename;
  $('#cOut').textContent = row.outputRaw ? `Saves as ${row.outputRaw}` : '';
  $('#cPreset').textContent = p.name;
  $('#cSize').textContent = `${p.width} × ${p.height} px`;
  const done = view.list.filter(r => state.crops[r.index]).length;
  $('#cPos').textContent = `Photo ${view.pos + 1} of ${view.list.length}`;
  $('#cProgress').textContent = `${done} of ${view.list.length} confirmed`;
  $('#cBar').style.width = (100 * done / view.list.length) + '%';
  $('#btnPrev').disabled = view.pos === 0;
  $('#btnSkip').disabled = view.pos >= view.list.length - 1;
  $('#btnConfirm').innerHTML = view.pos >= view.list.length - 1 ? 'Confirm &amp; review' : 'Confirm &amp; next';
  const w = $('#cWarn');
  w.hidden = !row.warn;
  w.textContent = row.warn || '';
  updateStatePill();
}

function updateStatePill() {
  const pill = $('#cState');
  const saved = state.crops[view.row.index];
  const d = view.draft;
  if (!saved) { pill.className = 'pill todo'; pill.textContent = 'Not confirmed'; return; }
  const changed = Math.abs(saved.cx - d.cx) > 1e-4 || Math.abs(saved.cy - d.cy) > 1e-4 || Math.abs(saved.zoom - d.zoom) > 1e-4;
  pill.className = changed ? 'pill warn' : 'pill done';
  pill.textContent = changed ? 'Changed, not confirmed yet' : 'Confirmed';
}

let drawQueued = false;
export function scheduleDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}

function draw() {
  const dpr = window.devicePixelRatio || 1;
  const W = stageEl.clientWidth, H = stageEl.clientHeight;
  if (!W || !H) return;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (!view.row || !view.bmp) return;

  // Fit the crop frame in the stage with some padding.
  const p = view.row.preset, b = view.bmp;
  const pad = 36, ar = p.width / p.height;
  let fw = Math.max(40, W - pad * 2), fh = fw / ar;
  if (fh > H - pad * 2) { fh = Math.max(40, H - pad * 2); fw = fh * ar; }
  const fx = (W - fw) / 2, fy = (H - fh) / 2;
  view.frame = { x: fx, y: fy, w: fw, h: fh };

  const r = view.rect = cropRect(view.draft, b.width, b.height, p.width, p.height);
  const s = view.scale = fw / r.w;

  // Whole photo, then darken everything outside the frame.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(b, fx - r.x * s, fy - r.y * s, b.width * s, b.height * s);
  ctx.fillStyle = 'rgba(18,22,26,0.74)';
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.rect(fx, fy, fw, fh);
  ctx.fill('evenodd');

  // Rule-of-thirds guides and frame border.
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < 3; i++) {
    ctx.moveTo(fx + fw * i / 3, fy); ctx.lineTo(fx + fw * i / 3, fy + fh);
    ctx.moveTo(fx, fy + fh * i / 3); ctx.lineTo(fx + fw, fy + fh * i / 3);
  }
  ctx.stroke();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.strokeRect(fx, fy, fw, fh);

  drawPreview();
  updateZoomUI();
  updateStatePill();
}

function drawPreview() {
  const pc = $('#preview'), p = view.row.preset, r = view.rect;
  let w = 228, h = Math.round(228 * p.height / p.width);
  if (h > 240) { h = 240; w = Math.round(240 * p.width / p.height); }
  if (pc.width !== w || pc.height !== h) { pc.width = w; pc.height = h; }
  const c = pc.getContext('2d');
  c.imageSmoothingQuality = 'high';
  c.drawImage(view.bmp, r.x, r.y, r.w, r.h, 0, 0, w, h);
  $('#cUsing').textContent = `Uses ${Math.round(r.w)} × ${Math.round(r.h)} px of the ${view.bmp.width} × ${view.bmp.height} px original.`;
}

function updateZoomUI() {
  const b = view.bmp, p = view.row.preset;
  const mz = maxZoom(b.width, b.height, p.width, p.height);
  const z = view.draft.zoom;
  const canZoom = mz > 1.0001;
  const sl = $('#zSlider');
  sl.disabled = !canZoom;
  sl.value = canZoom ? Math.round(1000 * Math.log(z) / Math.log(mz)) : 0; // log scale feels even
  $('#zIn').disabled = z >= mz - 1e-6;
  $('#zOut').disabled = z <= 1 + 1e-6;
  $('#zInfo').textContent = !canZoom
    ? 'This photo is just big enough for this size, so it can be moved but not zoomed.'
    : z >= mz - 1e-6 ? 'Zoomed in as far as possible without losing quality.' : `Zoom ${z.toFixed(2)}×`;
}

/* ---------- Wiring ---------- */

export function initWorkspace() {
  stageEl = $('#stage');
  canvas = $('#stageCanvas');
  ctx = canvas.getContext('2d');

  let drag = null;
  stageEl.addEventListener('pointerdown', e => {
    if (!view.bmp || e.button !== 0) return;
    stageEl.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY };
    stageEl.classList.add('dragging');
  });
  stageEl.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    // Dragging the photo right moves the crop left, so the signs flip.
    panBy(-dx / view.scale, -dy / view.scale);
  });
  const endDrag = () => { drag = null; stageEl.classList.remove('dragging'); };
  stageEl.addEventListener('pointerup', endDrag);
  stageEl.addEventListener('pointercancel', endDrag);

  stageEl.addEventListener('wheel', e => {
    if (!view.bmp) return;
    e.preventDefault();
    const rc = stageEl.getBoundingClientRect();
    zoomTo(view.draft.zoom * Math.exp(-e.deltaY * 0.0015), e.clientX - rc.left, e.clientY - rc.top);
  }, { passive: false });

  new ResizeObserver(() => { if (getView() === 'crop') scheduleDraw(); }).observe(stageEl);

  $('#zSlider').addEventListener('input', e => {
    if (!view.bmp) return;
    const b = view.bmp, p = view.row.preset;
    zoomTo(Math.pow(maxZoom(b.width, b.height, p.width, p.height), e.target.value / 1000));
  });
  $('#zIn').onclick = () => zoomTo(view.draft.zoom * 1.2);
  $('#zOut').onclick = () => zoomTo(view.draft.zoom / 1.2);
  $('#btnReset').onclick = resetCrop;
  $('#btnConfirm').onclick = confirmCrop;
  $('#btnPrev').onclick = goPrev;
  $('#btnSkip').onclick = goNext;

  document.addEventListener('keydown', e => {
    if (getView() !== 'crop' || $('#settings').open || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t.tagName === 'INPUT' && t.type !== 'range'))) return;
    if (t && t.type === 'range' && e.key.startsWith('Arrow')) return; // let the slider use arrows
    const keys = {
      Enter: confirmCrop,
      ArrowLeft: goPrev,
      ArrowRight: goNext,
      '+': () => view.draft && zoomTo(view.draft.zoom * 1.15),
      '=': () => view.draft && zoomTo(view.draft.zoom * 1.15),
      '-': () => view.draft && zoomTo(view.draft.zoom / 1.15),
      '_': () => view.draft && zoomTo(view.draft.zoom / 1.15),
      r: resetCrop,
      R: resetCrop
    };
    const fn = keys[e.key];
    if (fn) { e.preventDefault(); fn(); }
  });
}
