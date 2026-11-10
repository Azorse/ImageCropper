// Switching between Setup, Crop and Review.

import { state, view } from './state.js';
import { renderReview } from './review.js';
import { scheduleDraw, startCropping } from './workspace.js';

let currentView = 'setup';
export const getView = () => currentView;

export function showView(v) {
  currentView = v;
  document.querySelectorAll('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + v));
  document.querySelectorAll('.tab[data-view]').forEach(t => {
    if (t.dataset.view === v) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
    if (t.dataset.view !== 'setup') t.disabled = !state.started;
  });
  if (v === 'review') renderReview();
  if (v === 'crop') scheduleDraw();
}

/** Called when the CSV or photos change. Confirmed crops are kept. */
export function resetSession() {
  state.started = false;
  view.list = [];
  view.row = null;
  view.bmp = null;
  showView('setup');
}

export function initNav() {
  document.querySelectorAll('.tab[data-view]').forEach(t => {
    t.onclick = () => {
      const v = t.dataset.view;
      if (v === 'crop') startCropping(view.row ? view.row.index : null);
      else showView(v);
    };
  });
  // Crops are saved, but the photos would have to be chosen again.
  window.addEventListener('beforeunload', e => {
    if (state.started) { e.preventDefault(); e.returnValue = ''; }
  });
}
