// Saves confirmed crops in the browser so a refresh doesn't lose work.
// Only the crop numbers are stored, never the photos. Progress is keyed to
// the exact CSV contents, so loading the same CSV again restores it.

import { lsGet, lsSet, lsDel } from './utils.js';
import { state } from './state.js';

export const LS_PROGRESS = 'gbc.progress.';
const MAX_AGE_DAYS = 60;

export function saveProgress() {
  if (!state.batchKey) return;
  lsSet(state.batchKey, JSON.stringify({ csvName: state.csvName, savedAt: Date.now(), crops: state.crops }));
}

export function restoreProgress() {
  state.crops = {};
  state.restored = null;
  const saved = lsGet(state.batchKey);
  if (!saved) return;
  try {
    const d = JSON.parse(saved);
    for (const [i, c] of Object.entries(d.crops || {})) {
      if (c && [c.cx, c.cy, c.zoom].every(Number.isFinite)) state.crops[i] = { cx: c.cx, cy: c.cy, zoom: c.zoom };
    }
    const count = Object.keys(state.crops).length;
    if (count) state.restored = { count, savedAt: d.savedAt };
  } catch (e) {}
}

export function clearProgress() {
  lsDel(state.batchKey);
  state.crops = {};
  state.restored = null;
}

export function pruneOldProgress() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(LS_PROGRESS)) continue;
      let old = true;
      try {
        const d = JSON.parse(localStorage.getItem(k));
        old = !d.savedAt || Date.now() - d.savedAt > MAX_AGE_DAYS * 864e5;
      } catch (e) {}
      if (old) localStorage.removeItem(k);
    }
  } catch (e) {}
}
