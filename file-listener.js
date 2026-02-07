// Runs in page context (world: MAIN) so we can read File.size. Dispatches to content script via custom event.
(function () {
  var EVENT = '__TOKEN_OCEAN_FILE_UPLOAD__';
  function sendFiles(files) {
    if (!files || !files.length) return;
    var list = Array.from(files).map(function (f) {
      return { name: f.name, size: f.size, type: f.type };
    });
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { files: list } }));
  }
  document.addEventListener('change', function (e) {
    if (e.target && e.target.type === 'file' && e.target.files) sendFiles(e.target.files);
  }, true);
  document.addEventListener('drop', function (e) {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) sendFiles(e.dataTransfer.files);
  }, true);
  document.addEventListener('paste', function (e) {
    if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length) sendFiles(e.clipboardData.files);
  }, true);
})();
