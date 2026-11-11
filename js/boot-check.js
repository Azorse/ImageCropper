// Classic script (not a module) loaded in <head>, so it runs before the page draws.

// Theme: apply the saved choice (or the computer's setting) right away, so the
// page never flashes light before switching to dark.
(function () {
  var saved = null;
  try { saved = localStorage.getItem('gbc.theme'); } catch (e) {}
  var dark = saved ? saved === 'dark' : !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
})();

// Opened straight from disk, browsers refuse to load module scripts, so explain why nothing works.
(function () {
  if (location.protocol !== 'file:') return;
  document.addEventListener('DOMContentLoaded', function () {
    var el = document.getElementById('bootError');
    el.textContent = "This app can't run from a file on your computer. " +
      "Open it at https://azorse.github.io/ImageCropper/ instead.";
    el.hidden = false;
  });
})();
