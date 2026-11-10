// Classic script (not a module) so it still runs when the page is opened
// straight from disk, where browsers refuse to load module scripts.
(function () {
  if (location.protocol !== 'file:') return;
  document.addEventListener('DOMContentLoaded', function () {
    var el = document.getElementById('bootError');
    el.textContent = "This app has to be opened through a web server, not by double-clicking index.html. " +
      "See README.md for a one-line way to run it on your computer.";
    el.hidden = false;
  });
})();
