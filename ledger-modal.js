(function (global) {
  'use strict';

  var position = null;
  var stopRestoring = null;
  var selector = '.modal-bg.show,.confirm-bg.show';

  function cancelRestore() {
    if (stopRestoring) stopRestoring();
  }

  function restorePosition(saved) {
    // Keyboard dismissal can resize the viewport after the modal has closed.
    // Stop as soon as the user starts another interaction.
    var frame;
    var timer;
    var viewport = global.visualViewport;
    var gestures = ['pointerdown', 'touchstart', 'wheel', 'keydown'];
    function restore() { global.scrollTo(saved.x, saved.y); }
    function stop() {
      global.cancelAnimationFrame(frame);
      global.clearTimeout(timer);
      global.removeEventListener('resize', restore);
      if (viewport) viewport.removeEventListener('resize', restore);
      gestures.forEach(function (type) { global.removeEventListener(type, stop); });
      stopRestoring = null;
    }
    stopRestoring = stop;
    global.addEventListener('resize', restore);
    if (viewport) viewport.addEventListener('resize', restore);
    gestures.forEach(function (type) { global.addEventListener(type, stop, { passive: true }); });
    restore();
    frame = global.requestAnimationFrame(restore);
    timer = global.setTimeout(stop, 700);
  }

  function openModal(id) {
    var modal = document.getElementById(id);
    if (!modal) return;
    cancelRestore();
    if (!position) {
      position = { x: global.scrollX, y: global.scrollY };
      document.documentElement.style.setProperty('--ledger-scroll-top', -position.y + 'px');
      document.documentElement.classList.add('ledger-modal-open');
    }
    modal.classList.add('show');
  }

  function closeModal(id) {
    var modal = document.getElementById(id);
    if (!modal) return;
    var active = document.activeElement;
    if (active && modal.contains(active) && typeof active.blur === 'function') active.blur();
    modal.classList.remove('show');
    if (!position || document.querySelector(selector)) return;
    var saved = position;
    position = null;
    document.documentElement.classList.remove('ledger-modal-open');
    document.documentElement.style.removeProperty('--ledger-scroll-top');
    restorePosition(saved);
  }

  global.openModal = openModal;
  global.closeModal = closeModal;
})(window);
