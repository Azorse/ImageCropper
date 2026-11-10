// Entry point. Wires up each screen, then loads settings.

import { $ } from './utils.js';
import { loadTeamDefaults, loadConfig } from './config.js';
import { pruneOldProgress } from './progress.js';
import { initNav } from './nav.js';
import { initSetup, renderSetup } from './setup.js';
import { initWorkspace } from './workspace.js';
import { initReview } from './review.js';
import { initExport } from './exporter.js';
import { initSettings } from './settings.js';

async function init() {
  if (typeof window.Papa === 'undefined' || typeof window.JSZip === 'undefined') {
    const el = $('#bootError');
    el.textContent = "The app couldn't load its helper libraries from the vendor folder. Make sure the whole project folder was uploaded, then reload.";
    el.hidden = false;
    document.querySelectorAll('.btn').forEach(b => { b.disabled = true; });
    return;
  }
  initNav();
  initSetup();
  initWorkspace();
  initReview();
  initExport();
  initSettings();

  pruneOldProgress();
  await loadTeamDefaults();
  loadConfig();
  renderSetup();
}

init();
