// Small shared helpers with no app state.

export const $ = s => document.querySelector(s);

export const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const clone = o => JSON.parse(JSON.stringify(o));
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Lowercase and strip everything but letters and digits. "Square 1" -> "square1". */
export const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export const basename = p => String(p || '').split(/[\\/]/).pop().trim();
export const stemOf = n => { const i = n.lastIndexOf('.'); return i > 0 ? n.slice(0, i) : n; };
export const extOf = n => { const i = n.lastIndexOf('.'); return i > 0 ? n.slice(i + 1).toLowerCase() : ''; };
export const safeName = s => String(s).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim() || 'image';
export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Short, stable hash of a string (FNV-1a). Used to key saved progress to a CSV. */
export function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

// localStorage can throw (private windows, blocked storage), so always wrap it.
export function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
export function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
export function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
