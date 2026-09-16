(function (global) {
  'use strict';

  var PEOPLE = [
    { id: 'boss', name: 'Boss', color: '#B08A5A' },
    { id: 'jane', name: 'Jane', color: '#87977F' },
    { id: 'cho', name: 'Cho', color: '#68747A' },
    { id: 'rigsby', name: 'Rigsby', color: '#7E9AB0' },
    { id: 'lisbon', name: 'Lisbon', color: '#A06F62' },
    { id: 'vanpelt', name: 'Van Pelt', color: '#B48A9B' }
  ];
  var CABINET_KEY = 'cbi_checkin_reward_cabinets_v1';
  var db = null;
  var options = {};
  var activeView = 'check';
  var selectedItemId = '';
  var cabinetState = {};

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function personById(id) {
    return PEOPLE.find(function (person) { return person.id === id; }) || PEOPLE[0];
  }

  function readCabinets() {
    try {
      var value = JSON.parse(global.localStorage.getItem(CABINET_KEY));
      return value && typeof value === 'object' ? value : {};
    } catch (error) { return {}; }
  }

  function saveCabinets() {
    try { global.localStorage.setItem(CABINET_KEY, JSON.stringify(cabinetState)); } catch (error) {}
  }

  function syncDb(next) {
    db = next || global.CBIData.load();
    if (typeof options.onDbChange === 'function') options.onDbChange(db);
  }

  function navMarkup() {
    return '<nav class="task-bottom-tabs" id="checkinBottomTabs" aria-label="Check-in pages">'
      + '<button type="button" data-checkin-view="reward">REWARD</button>'
      + '<button type="button" data-checkin-view="check">CHECK</button>'
      + '</nav>';
  }

  function modalMarkup() {
    return '<div class="modal-bg" id="checkinRewardModal"><div class="modal checkin-reward-modal">'
      + '<h2 id="checkinRewardModalTitle"></h2>'
      + '<div id="checkinRewardModalBody"></div>'
      + '<div class="checkin-reward-error" id="checkinRewardError"></div>'
      + '<div class="btn-row"><button class="btn btn-cancel" type="button" id="checkinRewardCancel">取消</button>'
      + '<button class="btn btn-primary" type="button" id="checkinRewardPrimary"></button></div>'
      + '</div></div>';
  }

  function updateUrl() {
    var url = new URL(global.location.href);
    url.searchParams.set('tab', 'habits');
    if (activeView === 'reward') url.searchParams.set('view', 'reward');
    else url.searchParams.delete('view');
    global.history.replaceState(null, '', url.pathname + url.search + url.hash);
  }

  function updateNav() {
    document.querySelectorAll('#checkinBottomTabs [data-checkin-view]').forEach(function (button) {
      var isActive = button.dataset.checkinView === activeView;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-current', isActive ? 'page' : 'false');
    });
  }

  function setView(view, skipUrl) {
    activeView = view === 'reward' ? 'reward' : 'check';
    document.body.dataset.checkinView = activeView;
    updateNav();
    if (!skipUrl) updateUrl();
    if (activeView === 'reward') renderReward();
    else if (typeof options.renderCheck === 'function') options.renderCheck();
    if (typeof global.scrollTo === 'function') global.scrollTo(0, 0);
  }

  function rewardStatus() {
    var log = db.work.checkinRewardLog || [];
    document.getElementById('statusBar').innerHTML = '<div class="status-item"><div class="status-label">打卡点</div><div class="status-value">' + db.work.salary + '</div></div>'
      + '<div class="status-item"><div class="status-label">已刷动态</div><div class="status-value">' + log.length + '</div></div>';
  }

  function latestMarkup() {
    var entries = db.work.checkinRewardLog || [];
    if (!entries.length) return '';
    var entry = entries[entries.length - 1];
    var person = personById(entry.characterId);
    var date = new Date(entry.createdAt);
    var stamp = isNaN(date.getTime()) ? '' : String(date.getMonth() + 1).padStart(2, '0') + '.' + String(date.getDate()).padStart(2, '0');
    return '<section class="checkin-latest" style="--person-color:' + person.color + '">'
      + '<div class="checkin-latest-meta">' + esc(person.name) + (stamp ? ' · ' + stamp : '') + '</div>'
      + '<div class="checkin-latest-item">' + esc(entry.itemName) + '</div>'
      + '<div class="checkin-latest-line">' + esc(entry.line) + '</div>'
      + '</section>';
  }

  function itemMarkup(item, counts) {
    var image = item.image
      ? '<img src="' + esc(item.image) + '" alt="">'
      : '<span>' + esc((item.itemName || '物')[0]) + '</span>';
    var count = counts[item.itemId] || 0;
    return '<button class="checkin-reward-item" type="button" data-checkin-reward-action="open-item" data-item-id="' + esc(item.itemId) + '">'
      + '<span class="checkin-reward-thumb">' + image + '</span>'
      + '<span class="checkin-reward-copy"><span class="checkin-reward-name">' + esc(item.itemName) + '</span>'
      + '<span class="checkin-reward-project">' + esc(item.projectName) + (count ? ' · ' + count + '条' : '') + '</span></span>'
      + '<span class="checkin-reward-cost">' + global.CBIData.CHECKIN_REWARD_COST + '</span>'
      + '</button>';
  }

  function cabinetMarkup(person, items, counts) {
    var isOpen = cabinetState[person.id] === true;
    var body = items.length
      ? '<div class="checkin-cabinet-items">' + items.map(function (item) { return itemMarkup(item, counts); }).join('') + '</div>'
      : '<div class="checkin-cabinet-empty">空柜</div>';
    return '<details class="checkin-cabinet" data-character-id="' + person.id + '"' + (isOpen ? ' open' : '') + '>'
      + '<summary><span class="checkin-cabinet-dot" style="background:' + person.color + '"></span>'
      + '<span class="checkin-cabinet-name">' + esc(person.name) + '</span>'
      + '<span class="checkin-cabinet-count">' + items.length + '</span></summary>' + body + '</details>';
  }

  function renderReward() {
    syncDb(global.CBIData.load());
    rewardStatus();
    var items = global.CBIData.dailyRewardItems(db);
    var counts = {};
    (db.work.checkinRewardLog || []).forEach(function (entry) { counts[entry.itemId] = (counts[entry.itemId] || 0) + 1; });
    var cabinets = PEOPLE.map(function (person) {
      return cabinetMarkup(person, items.filter(function (item) { return item.characterId === person.id; }), counts);
    }).join('');
    var content = document.getElementById('content');
    content.innerHTML = latestMarkup()
      + '<div class="checkin-reward-head"><span>日常购入</span><span>' + items.length + ' 件</span></div>'
      + '<div class="checkin-cabinets">' + cabinets + '</div>'
      + (!items.length ? '<a class="checkin-reward-shop-link" href="shop.html">前往商城</a>' : '');
    content.querySelectorAll('.checkin-cabinet').forEach(function (cabinet) {
      cabinet.addEventListener('toggle', function () {
        cabinetState[cabinet.dataset.characterId] = cabinet.open;
        saveCabinets();
      });
    });
  }

  function closeModal() {
    document.getElementById('checkinRewardModal').classList.remove('show');
    selectedItemId = '';
  }

  function openItem(itemId) {
    syncDb(global.CBIData.load());
    var item = global.CBIData.dailyRewardItems(db).find(function (entry) { return entry.itemId === itemId; });
    if (!item) return;
    selectedItemId = item.itemId;
    var person = personById(item.characterId);
    var image = item.image ? '<div class="checkin-reward-preview"><img src="' + esc(item.image) + '" alt=""></div>' : '';
    document.getElementById('checkinRewardModalTitle').textContent = item.itemName;
    document.getElementById('checkinRewardModalBody').innerHTML = image
      + '<div class="checkin-reward-modal-meta" style="color:' + person.color + '">' + esc(person.name) + ' · ' + esc(item.projectName) + '</div>'
      + '<div class="checkin-reward-balance">当前 ' + db.work.salary + ' 点</div>';
    document.getElementById('checkinRewardError').textContent = '';
    document.getElementById('checkinRewardCancel').style.display = '';
    var primary = document.getElementById('checkinRewardPrimary');
    primary.textContent = '消耗 ' + global.CBIData.CHECKIN_REWARD_COST + ' 点';
    primary.dataset.mode = 'spend';
    primary.disabled = db.work.salary < global.CBIData.CHECKIN_REWARD_COST;
    if (primary.disabled) document.getElementById('checkinRewardError').textContent = '点数不足';
    document.getElementById('checkinRewardModal').classList.add('show');
  }

  function spendSelected() {
    if (!selectedItemId) return;
    var result = global.CBIData.spendCheckinReward(global.CBIData.load(), selectedItemId, new Date());
    if (!result.ok) {
      document.getElementById('checkinRewardError').textContent = result.reason === 'insufficient_points' ? '点数不足' : '这个物品暂时不能刷新';
      return;
    }
    syncDb(result.db);
    renderReward();
    var person = personById(result.entry.characterId);
    document.getElementById('checkinRewardModalTitle').textContent = result.entry.itemName;
    document.getElementById('checkinRewardModalBody').innerHTML = '<div class="checkin-reward-result-person" style="color:' + person.color + '">' + esc(person.name) + '</div>'
      + '<div class="checkin-reward-result-line">' + esc(result.entry.line) + '</div>';
    document.getElementById('checkinRewardError').textContent = '';
    document.getElementById('checkinRewardCancel').style.display = 'none';
    var primary = document.getElementById('checkinRewardPrimary');
    primary.disabled = false;
    primary.textContent = '收下';
    primary.dataset.mode = 'close';
  }

  function handleContentClick(event) {
    var target = event.target.closest('[data-checkin-reward-action]');
    if (!target || activeView !== 'reward') return;
    if (target.dataset.checkinRewardAction === 'open-item') openItem(target.dataset.itemId);
  }

  function mount(userOptions) {
    if (!global.CBIData) return false;
    options = userOptions || {};
    cabinetState = readCabinets();
    syncDb(global.CBIData.load());
    document.body.insertAdjacentHTML('beforeend', navMarkup() + modalMarkup());
    document.querySelectorAll('#checkinBottomTabs [data-checkin-view]').forEach(function (button) {
      button.addEventListener('click', function () { setView(button.dataset.checkinView); });
    });
    document.getElementById('content').addEventListener('click', handleContentClick);
    document.getElementById('checkinRewardCancel').addEventListener('click', closeModal);
    document.getElementById('checkinRewardPrimary').addEventListener('click', function () {
      if (this.dataset.mode === 'close') closeModal();
      else spendSelected();
    });
    document.getElementById('checkinRewardModal').addEventListener('click', function (event) {
      if (event.target === this) closeModal();
    });
    var requested = new URLSearchParams(global.location.search).get('view');
    setView(requested === 'reward' ? 'reward' : 'check', true);
    return true;
  }

  global.CBICheckinRewards = Object.freeze({ mount: mount });
})(window);
