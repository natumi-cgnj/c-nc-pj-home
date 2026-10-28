(function (global) {
  'use strict';

  var context = global.WorldContext;
  var host = global.document.querySelector('[data-world-files-switcher]');
  if (!context || !host) return;
  var archiveWorldId = global.document.body.dataset.filesWorld;
  if (!context.worlds[archiveWorldId]) return;

  function node(tag, className, text) {
    var element = global.document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  var picker = node('details', 'files-world-picker');
  var summary = node('summary', 'files-world-summary');
  var current = node('span', 'files-world-current');
  current.appendChild(node('span', 'files-world-eyebrow', 'WORLD'));
  current.appendChild(node('span', 'files-world-name', context.getWorld(archiveWorldId).title));
  summary.appendChild(current);
  summary.appendChild(node('span', 'files-world-toggle', '切换世界 ⌄'));
  picker.appendChild(summary);

  var options = node('div', 'files-world-options');
  options.setAttribute('role', 'group');
  options.setAttribute('aria-label', '选择世界');
  var error = node('p', 'files-world-error');
  error.setAttribute('role', 'status');
  error.hidden = true;

  Object.keys(context.worlds).forEach(function (id) {
    var world = context.getWorld(id);
    var selected = id === archiveWorldId;
    var button = node('button', 'files-world-option' + (selected ? ' is-current' : ''));
    button.type = 'button';
    button.setAttribute('aria-pressed', String(selected));
    var copy = node('span', 'files-world-copy');
    copy.appendChild(node('span', 'files-world-label', world.label));
    copy.appendChild(node('span', 'files-world-description', world.description));
    button.appendChild(copy);
    button.appendChild(node('span', 'files-world-mark', selected ? '当前' : '→'));
    button.addEventListener('click', function () {
      if (!context.setActiveWorldId(id)) {
        error.textContent = '世界切换未保存，请再试一次。';
        error.hidden = false;
        return;
      }
      error.hidden = true;
      picker.open = false;
      if (id !== archiveWorldId) {
        global.location.assign(context.getRoute('story', 'story.html', id));
      }
    });
    options.appendChild(button);
  });

  picker.appendChild(options);
  picker.appendChild(error);
  host.replaceChildren(picker);
  picker.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && picker.open) {
      picker.open = false;
      summary.focus();
      event.stopPropagation();
    }
  });
})(window);
