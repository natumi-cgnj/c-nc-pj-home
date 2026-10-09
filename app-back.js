(function (global) {
  'use strict';

  if (!global || !global.document || !global.history || global.LiminalMobileBack) return;

  var STATE_KEY = '__liminalMobileBackV1';
  var HOME_RETURN_KEY = 'liminal_module_home_return_v1';
  var HOME_SHORTCUT_KEY = 'home_shortcut_return_main_v1';
  var instanceId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  var initialized = false;
  var handlingPop = false;
  var baseline = null;
  var guardUrl = '';
  var homeUrl = '';
  var nativeReplaceState = global.history.replaceState.bind(global.history);
  var nativePushState = global.history.pushState.bind(global.history);

  var HIERARCHICAL_PAGES = {
    'bjd.html': true,
    'cbi.html': true,
    'cinema.html': true,
    'event.html': true,
    'kitchen.html': true,
    'merch.html': true,
    'music.html': true,
    'reading.html': true,
    'recipe.html': true,
    'techo.html': true
  };

  var LAYER_SELECTOR = [
    '.modal-bg[id]',
    '.modal-overlay[id]',
    '.sheet-overlay[id]',
    '.action-sheet-bg[id]',
    '.confirm-bg[id]',
    '.cg-fullscreen[id]',
    '.cg-library-overlay[id]',
    '.wardrobe-overlay[id]',
    '.skin-editor[id]',
    '.cat-popup-overlay[id]',
    '.shortcut-picker-overlay[id]',
    '.room-pkg-sheet[id]',
    '.cbi-storage-overlay[id]',
    '.world-switch-overlay[id]',
    '.checkin-popup[id]',
    '.signin-popup[id]',
    '.section-banner-full[id]',
    '.completion-popup[id]',
    '.dialogue-screen[id]',
    '.reward-popup[id]',
    '.reveal-bg[id]',
    '.reveal-overlay[id]',
    '.day-detail[id]',
    '.overlay[id]',
    '[data-app-back-layer][id]'
  ].join(',');

  var TAB_CONTAINER_SELECTOR = '.tab-bar,.bottom-tabs,.tabs,.task-bottom-tabs,.view-tabs,.pool-tabs,[role="tablist"]';
  var TAB_CONTROL_SELECTOR = 'button,a,.tab,.view-tab,.pool-tab,[role="tab"]';
  var DATASET_TABS = [
    { key: 'checkinView', attr: 'data-checkin-view' },
    { key: 'actionView', attr: 'data-action-view' },
    { key: 'goalView', attr: 'data-goal-view' }
  ];

  function pageName() {
    var part = String(global.location.pathname || '').split('/').pop();
    return (part || 'index.html').toLowerCase();
  }

  function copyStateWithMarker(state, marker) {
    var next;
    if (state && typeof state === 'object' && !Array.isArray(state)) next = Object.assign({}, state);
    else {
      next = {};
      if (state !== null && state !== undefined) next.__liminalHostState = state;
    }
    next[STATE_KEY] = marker;
    return next;
  }

  function currentMarker() {
    var state = global.history.state;
    return state && typeof state === 'object' ? state[STATE_KEY] : null;
  }

  function homeDestination(value) {
    if (!value) return null;
    try {
      var url = new URL(value, global.location.href);
      var home = new URL('index.html', global.location.href);
      var directory = new URL('.', home);
      return url.origin === home.origin && (url.pathname === home.pathname || url.pathname === directory.pathname) ? url : null;
    } catch (error) { return null; }
  }

  function captureHomeDestination() {
    if (pageName() === 'index.html') return '';
    var destination = null;
    try {
      var record = JSON.parse(global.sessionStorage.getItem(HOME_RETURN_KEY));
      if (record && record.module === global.location.pathname) destination = homeDestination(record.home);
    } catch (error) {}
    var marker = currentMarker();
    if (!destination && marker) destination = homeDestination(marker.homeUrl);
    if (!destination) {
      var links = global.document.querySelectorAll('a[href]');
      for (var i = 0; i < links.length && !destination; i += 1) {
        destination = homeDestination(links[i].getAttribute('href'));
      }
    }
    if (!destination) destination = homeDestination(global.document.referrer);
    if (!destination) return '';
    try {
      if (global.sessionStorage.getItem(HOME_SHORTCUT_KEY) === '1') destination.searchParams.delete('p');
    } catch (error) {}
    return destination.href;
  }

  function rememberHomeDestination() {
    if (!homeUrl) return;
    try {
      // Home can recover this even when Android skips a synthetic history entry.
      global.sessionStorage.setItem(HOME_RETURN_KEY, JSON.stringify({ module: global.location.pathname, home: homeUrl }));
    } catch (error) {}
  }

  function leaveModule() {
    if (!homeUrl) { global.history.back(); return; }
    rememberHomeDestination();
    global.location.replace(homeUrl);
  }

  global.history.replaceState = function (state, title, url) {
    var marker = initialized ? currentMarker() : null;
    var result = nativeReplaceState(marker ? copyStateWithMarker(state, marker) : state, title, url);
    if (marker && marker.instance === instanceId && marker.role === 'guard') guardUrl = global.location.href;
    return result;
  };

  function activeViewIds() {
    return Array.prototype.map.call(
      global.document.querySelectorAll('.view.active[id]'),
      function (view) { return view.id; }
    );
  }

  function activeTab(container) {
    return container.querySelector('.active, [aria-current="page"], .pool-tab[class*="active-"]');
  }

  function tabToken(container, node) {
    if (!node) return null;
    var controls = Array.prototype.filter.call(
      container.querySelectorAll(TAB_CONTROL_SELECTOR),
      function (item) { return item.parentNode === container || container.contains(item); }
    );
    var data = {};
    Object.keys(node.dataset || {}).forEach(function (key) { data[key] = node.dataset[key]; });
    return { node: node, id: node.id || '', data: data, text: String(node.textContent || '').trim(), index: controls.indexOf(node) };
  }

  function captureBaseline() {
    var tabs = [];
    global.document.querySelectorAll(TAB_CONTAINER_SELECTOR).forEach(function (container) {
      var token = tabToken(container, activeTab(container));
      if (token) tabs.push({ container: container, token: token });
    });
    var datasets = {};
    DATASET_TABS.forEach(function (item) { datasets[item.key] = global.document.body.dataset[item.key] || ''; });
    return { views: activeViewIds(), tabs: tabs, datasets: datasets };
  }

  function isLayerOpen(layer) {
    if (!layer) return false;
    if (layer.classList.contains('show') || layer.hasAttribute('open')) return true;
    var display = layer.style && layer.style.display;
    return !!(display && display !== 'none');
  }

  function openLayers() {
    return Array.prototype.filter.call(global.document.querySelectorAll(LAYER_SELECTOR), isLayerOpen);
  }

  function layerZIndex(layer) {
    var value = 0;
    try { value = parseInt(global.getComputedStyle(layer).zIndex, 10) || 0; } catch (error) {}
    return value;
  }

  function topLayer() {
    var layers = openLayers();
    var top = null;
    var topZ = -Infinity;
    layers.forEach(function (layer) {
      var z = layerZIndex(layer);
      if (!top || top.contains(layer) || (!layer.contains(top) && z >= topZ)) {
        top = layer;
        topZ = z;
      }
    });
    return top;
  }

  function clickElement(node) {
    if (!node || typeof node.click !== 'function') return false;
    node.click();
    return true;
  }

  function knownLayerClose(layer) {
    var id = layer.id;
    if (id === 'diaScreen' && typeof global.closeDia === 'function') { global.closeDia(); return true; }
    if (id === 'rewardPopup' && typeof global.closeReward === 'function') { global.closeReward(); return true; }
    if ((id === 'revealBg' || id === 'revealOverlay') && typeof global.closeReveal === 'function') { global.closeReveal(); return true; }
    if (id === 'skinEditor' && typeof global.closeEditor === 'function') { global.closeEditor(); return true; }
    return false;
  }

  function closeTopLayer() {
    var layer = topLayer();
    if (!layer) return false;
    if (knownLayerClose(layer) && !isLayerOpen(layer)) return true;

    var closeSelectors = [
      '.sheet-close',
      '.signin-close',
      '.cancel-as',
      '[data-close]',
      '[onclick*="closeModal"]',
      '[onclick*="closeSheet"]',
      '[onclick*="closeConfirm"]',
      '[onclick*="closeSignin"]',
      '[onclick*="closeReward"]',
      '.modal-cancel',
      '.btn-cancel'
    ].join(',');
    var controls = Array.prototype.slice.call(layer.querySelectorAll(closeSelectors));
    var closeWords = /^(取消|关闭|返回|确认|cancel|close|back|ok)$/i;
    var control = controls.find(function (node) {
      return !node.disabled && closeWords.test(String(node.textContent || '').trim());
    }) || controls.find(function (node) {
      return !node.disabled && (node.classList.contains('sheet-close') || node.classList.contains('cancel-as') || node.hasAttribute('data-close'));
    });
    if (control) {
      clickElement(control);
      if (!isLayerOpen(layer)) return true;
    }

    if (layer.id !== 'diaScreen' && layer.id !== 'rewardPopup') {
      clickElement(layer);
      if (!isLayerOpen(layer)) return true;
    }

    layer.classList.remove('show');
    layer.removeAttribute('open');
    if (layer.style && layer.style.display) layer.style.display = 'none';
    return true;
  }

  function activeHierarchicalView() {
    if (!HIERARCHICAL_PAGES[pageName()]) return null;
    var views = activeViewIds();
    return views.length ? global.document.getElementById(views[0]) : null;
  }

  function isBaselineView(view) {
    return !!(view && baseline && baseline.views.indexOf(view.id) >= 0);
  }

  function backControlIn(view) {
    if (!view) return null;
    var controls = Array.prototype.slice.call(view.querySelectorAll('.back-btn,.back,[data-app-back]'));
    return controls.find(function (node) {
      var href = node.getAttribute && node.getAttribute('href');
      return !href || href.charAt(0) === '#' || /javascript:/i.test(href);
    }) || null;
  }

  function fallbackToBaselineView() {
    var viewId = baseline && baseline.views[0];
    if (!viewId) return false;
    if (typeof global.showView === 'function') {
      global.showView(viewId, { replace: true, force: true, preserveScroll: true });
      return true;
    }
    if (typeof global.switchView === 'function') {
      global.switchView(viewId);
      return true;
    }
    var target = global.document.getElementById(viewId);
    if (!target) return false;
    global.document.querySelectorAll('.view.active').forEach(function (view) { view.classList.remove('active'); });
    target.classList.add('active');
    return true;
  }

  function backWithinHierarchicalView() {
    var view = activeHierarchicalView();
    if (!view || isBaselineView(view)) return false;
    if (pageName() === 'cbi.html' && typeof global.handleBack === 'function') {
      global.handleBack();
      return true;
    }
    var control = backControlIn(view);
    if (control && clickElement(control)) return true;
    return fallbackToBaselineView();
  }

  function findByDataAttribute(attribute, value) {
    var nodes = global.document.querySelectorAll('[' + attribute + ']');
    return Array.prototype.find.call(nodes, function (node) { return node.getAttribute(attribute) === value; }) || null;
  }

  function backWithinDatasetTab() {
    if (!baseline) return false;
    for (var i = 0; i < DATASET_TABS.length; i += 1) {
      var item = DATASET_TABS[i];
      var initial = baseline.datasets[item.key] || '';
      var current = global.document.body.dataset[item.key] || '';
      if (initial && current && initial !== current) {
        var target = findByDataAttribute(item.attr, initial);
        if (target && clickElement(target)) return true;
      }
    }
    return false;
  }

  function tokenMatches(node, token) {
    if (!node || !token) return false;
    if (node === token.node) return true;
    if (token.id && node.id === token.id) return true;
    var keys = Object.keys(token.data || {});
    if (keys.length > 0 && keys.every(function (key) { return node.dataset && node.dataset[key] === token.data[key]; })) return true;
    return !!(token.text && String(node.textContent || '').trim() === token.text);
  }

  function resolveTabTarget(entry) {
    var token = entry.token;
    if (token.node && token.node.isConnected) return token.node;
    var controls = entry.container.querySelectorAll(TAB_CONTROL_SELECTOR);
    var byToken = Array.prototype.find.call(controls, function (node) { return tokenMatches(node, token); });
    return byToken || (token.index >= 0 ? controls[token.index] : null);
  }

  function backWithinTab() {
    if (!baseline) return false;
    for (var i = 0; i < baseline.tabs.length; i += 1) {
      var entry = baseline.tabs[i];
      if (!entry.container.isConnected) continue;
      var current = activeTab(entry.container);
      if (!tokenMatches(current, entry.token)) {
        var target = resolveTabTarget(entry);
        if (target && clickElement(target)) return true;
      }
    }
    return false;
  }

  function consumeInternalBack() {
    if (closeTopLayer()) return 'layer';
    if (backWithinHierarchicalView()) return 'view';
    if (backWithinDatasetTab()) return 'dataset-tab';
    if (backWithinTab()) return 'tab';
    return false;
  }

  function armGuard() {
    if (!initialized) return;
    var marker = currentMarker();
    if (marker && marker.instance === instanceId && marker.role === 'guard') return;
    guardUrl = global.location.href;
    nativePushState(
      copyStateWithMarker(global.history.state, { instance: instanceId, role: 'guard', homeUrl: homeUrl }),
      '',
      global.location.href
    );
  }

  function handlePopState(event) {
    var marker = event.state && typeof event.state === 'object' ? event.state[STATE_KEY] : null;
    if (!marker || marker.instance !== instanceId || marker.role !== 'base' || handlingPop) return;
    var current = currentMarker();
    // pageshow may have re-armed before the traversal's popstate is delivered.
    if (!current || current.instance !== instanceId || current.role !== 'base') return;
    handlingPop = true;
    var consumed = consumeInternalBack();
    if (consumed) {
      if (consumed === 'layer' && guardUrl && guardUrl !== global.location.href) {
        nativeReplaceState(global.history.state, '', guardUrl);
      }
      armGuard();
      handlingPop = false;
      return;
    }
    handlingPop = false;
    leaveModule();
  }

  function initialize() {
    if (initialized) return;
    homeUrl = captureHomeDestination();
    rememberHomeDestination();
    baseline = captureBaseline();
    initialized = true;
    global.addEventListener('popstate', handlePopState);
    nativeReplaceState(
      copyStateWithMarker(global.history.state, { instance: instanceId, role: 'base', homeUrl: homeUrl }),
      '',
      global.location.href
    );
    armGuard();
  }

  global.addEventListener('pageshow', function () {
    if (!initialized) return;
    var marker = currentMarker();
    if (marker && marker.instance === instanceId && marker.role === 'base') armGuard();
  });

  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', function () { global.setTimeout(initialize, 40); }, { once: true });
  } else {
    global.setTimeout(initialize, 40);
  }

  global.LiminalMobileBack = Object.freeze({
    arm: armGuard,
    consume: consumeInternalBack,
    initialize: initialize,
    isArmed: function () {
      var marker = currentMarker();
      return !!(marker && marker.instance === instanceId && marker.role === 'guard');
    }
  });
})(window);
