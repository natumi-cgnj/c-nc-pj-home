(function (global) {
  'use strict';

  var BUILT_INS = [
    {
      id: 'cbi_ninja_turtle_hoodie',
      name: '忍者神龟卫衣',
      description: '绿色连帽卫衣，正面印着四只忍者神龟。',
      series: '办公室衣柜',
      category: 'clothing',
      wearers: ['boss', 'jane'],
      price: 120,
      color: '#4F8A55',
      reaction: 'Cho：很显眼。\nRigsby：我觉得挺酷。\nVan Pelt：……Jane先生为什么也有一件？\nJane：团队制服。只是有人偏心，多给了我一件。'
    },
    {
      id: 'cbi_black_hoodie',
      name: '黑色工作卫衣',
      description: '没有图案，适合加班、临时外勤和占领办公室沙发。',
      series: '办公室衣柜',
      category: 'clothing',
      wearers: ['boss', 'jane'],
      price: 90,
      color: '#34363B',
      reaction: 'Rigsby：这件很适合Boss。\nJane：至少这件不用配领带。'
    },
    {
      id: 'cbi_silver_studs',
      name: '银色耳钉',
      description: '很小的一对银色耳钉。',
      series: 'Boss 私人物品',
      category: 'accessory',
      wearers: ['boss'],
      price: 70,
      color: '#AEB5BE',
      reaction: 'Van Pelt认真看了两秒：Boss，很好看。\nJane抬眼盯了更久：……还行。'
    },
    {
      id: 'cbi_jane_tea_tin',
      name: '便携茶叶罐',
      description: '可以塞进外套口袋的小茶叶罐。',
      series: '办公室补给',
      category: 'gift',
      wearers: ['jane'],
      price: 55,
      color: '#B78A52',
      reaction: 'Jane掂了掂茶叶罐：不错。现在唯一的问题是，谁负责烧水？'
    }
  ];

  var NAMES = { boss: 'Boss', jane: 'Jane', cho: 'Cho', rigsby: 'Rigsby', lisbon: 'Lisbon', vanpelt: 'Van Pelt' };
  var db = null;
  var tab = 'preset';
  var selectedItem = null;
  var toastTimer = null;

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function save() {
    db = global.CBIData.save(db) || db;
  }

  function allItems() {
    return BUILT_INS.concat(db.work.shop.customItems || []);
  }

  function byId(id) {
    return allItems().find(function (item) { return item.id === id; }) || null;
  }

  function owned(item) {
    return db.work.shop.owned.indexOf(item.id) >= 0;
  }

  function injectStyles() {
    if (document.getElementById('cbiShopStyles')) return;
    var style = document.createElement('style');
    style.id = 'cbiShopStyles';
    style.textContent = [
      'body[data-cbi-shop="1"]{background:#f6f5f2}',
      'body[data-cbi-shop="1"] .top-bar h1{color:#8a6b31;letter-spacing:1.6px}',
      'body[data-cbi-shop="1"] .wallet{color:#8a6b31;font-weight:600}',
      '.cbi-shop-head{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px;gap:12px}',
      '.cbi-shop-kicker{font-size:10px;color:#aaa;letter-spacing:.7px;text-transform:uppercase;margin-bottom:4px}',
      '.cbi-shop-title{font-size:18px;font-weight:650;color:#2d2d2d}',
      '.cbi-shop-note{font-size:11px;line-height:1.55;color:#999;margin-top:4px}',
      '.cbi-shop-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}',
      '.cbi-shop-item{position:relative;background:#fff;border:1px solid #e7e3dc;border-radius:12px;padding:13px;min-height:142px;cursor:pointer;box-shadow:0 2px 10px rgba(50,45,35,.025)}',
      '.cbi-shop-item:active{transform:scale(.985)}',
      '.cbi-shop-item.owned{border-color:#dfc48e;background:#fffdf8}',
      '.cbi-shop-swatch{width:34px;height:34px;border-radius:9px;margin-bottom:10px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.05)}',
      '.cbi-shop-name{font-size:13px;font-weight:600;color:#3e3e3e;line-height:1.35}',
      '.cbi-shop-desc{font-size:10px;color:#999;line-height:1.55;margin-top:5px}',
      '.cbi-shop-meta{display:flex;gap:5px;flex-wrap:wrap;margin-top:9px}',
      '.cbi-shop-tag{font-size:9px;color:#8f846e;background:#f5f1e9;border-radius:5px;padding:3px 6px}',
      '.cbi-shop-owned{position:absolute;right:9px;top:9px;color:#a77d2d;font-size:10px}',
      '.cbi-shop-empty{padding:42px 20px;text-align:center;color:#aaa;font-size:12px;line-height:1.8;background:#fff;border:1px dashed #dedad2;border-radius:12px}',
      '.cbi-shop-log{background:#fff;border:1px solid #e7e3dc;border-radius:10px;padding:12px 13px;margin-bottom:8px}',
      '.cbi-shop-log-title{font-size:12px;color:#444;font-weight:550}',
      '.cbi-shop-log-meta{font-size:10px;color:#aaa;margin-top:4px}',
      '.cbi-shop-wardrobe{background:#fff;border:1px solid #e7e3dc;border-radius:11px;padding:13px;margin-bottom:9px;display:flex;align-items:center;gap:12px}',
      '.cbi-shop-wardrobe .cbi-shop-swatch{margin:0;flex:0 0 auto}',
      '.cbi-shop-modal-copy{font-size:12px;color:#777;line-height:1.7;white-space:pre-wrap;margin-top:9px}',
      '.cbi-shop-reaction{font-size:12px;color:#666;line-height:1.8;white-space:pre-wrap;background:#f8f6f1;border-radius:10px;padding:12px;margin-top:13px;text-align:left}',
      '.cbi-shop-toast{position:fixed;left:50%;bottom:88px;transform:translateX(-50%) translateY(12px);z-index:500;background:rgba(30,30,30,.92);color:#fff;padding:10px 14px;border-radius:9px;font-size:11px;max-width:86vw;text-align:center;opacity:0;pointer-events:none;transition:.2s}',
      '.cbi-shop-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}',
      '.cbi-shop-checks{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:8px}',
      '.cbi-shop-checks label{display:flex;align-items:center;gap:6px;margin:0;font-size:12px;color:#666}',
      '.cbi-shop-checks input{width:auto}',
      '@media(min-width:700px){body[data-cbi-shop="1"] .content{max-width:760px;margin:0 auto}.cbi-shop-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}'
    ].join('');
    document.head.appendChild(style);
  }

  function showToast(message) {
    var node = document.getElementById('cbiShopToast');
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { node.classList.remove('show'); }, 2800);
  }

  function updateWallet() {
    document.querySelector('.wallet').innerHTML = 'CBI 工资 &nbsp; <span>$' + db.work.salary + '</span>';
  }

  function setTab(next) {
    tab = next;
    document.querySelectorAll('.tabs .tab').forEach(function (node) { node.classList.toggle('active', node.dataset.tab === tab); });
    document.getElementById('addBtn').style.display = tab === 'custom' ? 'flex' : 'none';
    render();
  }

  function itemCard(item) {
    var wearers = item.wearers.map(function (id) { return NAMES[id] || id; }).join(' / ');
    var icon = item.category === 'gift' ? '✦' : (item.category === 'accessory' ? '◇' : '⌁');
    return '<div class="cbi-shop-item' + (owned(item) ? ' owned' : '') + '" data-cbi-shop-action="open-item" data-id="' + item.id + '">' +
      (owned(item) ? '<div class="cbi-shop-owned">已购入 ✓</div>' : '') +
      '<div class="cbi-shop-swatch" style="background:' + esc(item.color) + '">' + icon + '</div>' +
      '<div class="cbi-shop-name">' + esc(item.name) + '</div>' +
      '<div class="cbi-shop-desc">' + esc(item.description) + '</div>' +
      '<div class="cbi-shop-meta"><span class="cbi-shop-tag">$' + item.price + '</span><span class="cbi-shop-tag">' + esc(wearers) + '</span></div></div>';
  }

  function renderCatalog(items, title, note) {
    var content = document.getElementById('content');
    var html = '<div class="cbi-shop-head"><div><div class="cbi-shop-kicker">CBI payroll store</div><div class="cbi-shop-title">' + esc(title) + '</div><div class="cbi-shop-note">' + esc(note) + '</div></div></div>';
    if (!items.length) html += '<div class="cbi-shop-empty">这里暂时没有商品。<br>点右下角 + 加入想买的东西。</div>';
    else html += '<div class="cbi-shop-grid">' + items.map(itemCard).join('') + '</div>';
    content.innerHTML = html;
  }

  function renderWardrobe() {
    var items = allItems().filter(function (item) { return owned(item) && item.category !== 'gift'; });
    var html = '<div class="cbi-shop-head"><div><div class="cbi-shop-kicker">Role wardrobe</div><div class="cbi-shop-title">已入库衣柜</div><div class="cbi-shop-note">服装会同步进 CBI 世界的角色衣柜；带世界标记，不会混进夹缝空间。</div></div></div>';
    if (!items.length) html += '<div class="cbi-shop-empty">还没有购入服装或配饰。</div>';
    items.forEach(function (item) {
      html += '<div class="cbi-shop-wardrobe" data-cbi-shop-action="open-item" data-id="' + item.id + '"><div class="cbi-shop-swatch" style="background:' + esc(item.color) + '">⌁</div><div><div class="cbi-shop-name">' + esc(item.name) + '</div><div class="cbi-shop-desc">' + esc(item.wearers.map(function (id) { return NAMES[id]; }).join(' / ')) + ' · CBI 工资商城</div></div></div>';
    });
    document.getElementById('content').innerHTML = html;
  }

  function renderLog() {
    var logs = db.work.shop.purchaseLog.slice().reverse();
    var html = '<div class="cbi-shop-head"><div><div class="cbi-shop-kicker">Purchase records</div><div class="cbi-shop-title">采购记录</div><div class="cbi-shop-note">工资只在确认采购时扣除。</div></div></div>';
    if (!logs.length) html += '<div class="cbi-shop-empty">还没有采购记录。</div>';
    logs.forEach(function (entry) {
      var item = byId(entry.itemId);
      html += '<div class="cbi-shop-log"><div class="cbi-shop-log-title">' + esc(item ? item.name : entry.itemId) + '</div><div class="cbi-shop-log-meta">-$' + entry.price + ' · ' + esc((entry.purchasedAt || '').replace('T', ' ').slice(0, 16)) + '</div></div>';
    });
    document.getElementById('content').innerHTML = html;
  }

  function render() {
    updateWallet();
    if (tab === 'preset') renderCatalog(BUILT_INS, '精选', '先放入几件可以直接使用的商品，价格之后随时能调。');
    else if (tab === 'custom') renderCatalog(db.work.shop.customItems, '自选', '把现实里想买给自己或角色的东西放进来。');
    else if (tab === 'wardrobe') renderWardrobe();
    else renderLog();
  }

  function modal() { return document.getElementById('cbiShopModal'); }

  function openModal(title, body, primaryText, primaryHandler) {
    document.getElementById('cbiShopModalTitle').textContent = title;
    document.getElementById('cbiShopModalBody').innerHTML = body;
    var button = document.getElementById('cbiShopModalPrimary');
    button.textContent = primaryText || '确认';
    button.style.display = primaryHandler ? '' : 'none';
    button.onclick = primaryHandler || null;
    modal().classList.add('show');
  }

  function closeModal() { modal().classList.remove('show'); }

  function openItem(id) {
    selectedItem = byId(id);
    if (!selectedItem) return;
    var body = '<div style="text-align:center"><div class="cbi-shop-swatch" style="margin:0 auto 10px;background:' + esc(selectedItem.color) + '">✦</div><div class="cbi-shop-title">' + esc(selectedItem.name) + '</div><div class="cbi-shop-modal-copy">' + esc(selectedItem.description) + '</div><div class="cbi-shop-meta" style="justify-content:center"><span class="cbi-shop-tag">$' + selectedItem.price + '</span><span class="cbi-shop-tag">' + esc(selectedItem.wearers.map(function (id) { return NAMES[id]; }).join(' / ')) + '</span></div></div>';
    if (owned(selectedItem)) {
      if (selectedItem.reaction) body += '<div class="cbi-shop-reaction">' + esc(selectedItem.reaction) + '</div>';
      openModal('采购详情', body, '', null);
    } else {
      openModal('确认采购', body, '花 $' + selectedItem.price + ' 购入', buySelected);
    }
  }

  function addWardrobeSkin(item) {
    if (item.category === 'gift') return;
    var custom = {};
    try { custom = JSON.parse(global.localStorage.getItem('home_skin_custom')) || {}; } catch (error) {}
    item.wearers.forEach(function (wearer) {
      if (['boss', 'jane'].indexOf(wearer) < 0) return;
      if (!Array.isArray(custom[wearer])) custom[wearer] = [];
      var skinId = 'cbi_shop_' + item.id;
      var change = {
        id: skinId,
        name: item.name,
        desc: item.description,
        status: 'obtained',
        color: item.color,
        source: 'CBI 工资商城',
        series: 'CBI 工资',
        worldId: 'cbi'
      };
      var index = custom[wearer].findIndex(function (skin) { return skin && skin.id === skinId; });
      if (index >= 0) custom[wearer][index] = Object.assign(custom[wearer][index], change);
      else custom[wearer].push(change);
    });
    try { global.localStorage.setItem('home_skin_custom', JSON.stringify(custom)); } catch (error) {}
  }

  function buySelected() {
    var item = selectedItem;
    if (!item || owned(item)) return;
    if (db.work.salary < item.price) {
      closeModal();
      showToast('工资还差 $' + (item.price - db.work.salary));
      return;
    }
    db.work.salary -= item.price;
    db.work.shop.owned.push(item.id);
    db.work.shop.purchaseLog.push({ itemId: item.id, price: item.price, purchasedAt: new Date().toISOString() });
    if (db.work.shop.reactionsSeen.indexOf(item.id) < 0) db.work.shop.reactionsSeen.push(item.id);
    addWardrobeSkin(item);
    save();
    var reaction = item.reaction ? '<div class="cbi-shop-reaction">' + esc(item.reaction) + '</div>' : '';
    openModal('采购完成', '<div style="text-align:center"><div class="cbi-shop-title">' + esc(item.name) + ' 已入库</div><div class="cbi-shop-note" style="margin-top:6px">CBI 工资 -$' + item.price + '</div></div>' + reaction, '', null);
    render();
  }

  function customItemModal() {
    var wearerOptions = ['boss', 'jane', 'cho', 'rigsby', 'lisbon', 'vanpelt'].map(function (id) {
      return '<label><input type="checkbox" name="cbiShopWearer" value="' + id + '"' + (id === 'boss' ? ' checked' : '') + '> ' + NAMES[id] + '</label>';
    }).join('');
    var body = '<label>商品名称</label><input id="cbiShopName" type="text" placeholder="如：新的灰色卫衣">';
    body += '<label>说明（可选）</label><input id="cbiShopDesc" type="text" placeholder="颜色、款式或用途">';
    body += '<div class="aff-row"><div><label>类型</label><select id="cbiShopCategory"><option value="clothing">服装</option><option value="accessory">配饰</option><option value="gift">礼物</option></select></div><div><label>价格</label><input id="cbiShopPrice" type="number" min="1" value="100"></div></div>';
    body += '<div class="aff-row"><div><label>系列</label><input id="cbiShopSeries" type="text" value="自选"></div><div><label>代表色</label><input id="cbiShopColor" type="color" value="#E8B96A"></div></div>';
    body += '<label>给谁 / 谁可以穿</label><div class="cbi-shop-checks">' + wearerOptions + '</div>';
    body += '<div class="cbi-shop-note">当前可穿衣柜为 Boss / Jane；给其他人的商品请设为“礼物”。</div>';
    body += '<label>购入后评价（可选）</label><input id="cbiShopReaction" type="text" placeholder="角色台词或小段反应">';
    openModal('添加自选商品', body, '加入商城', function () {
      var name = document.getElementById('cbiShopName').value.trim();
      var wearers = Array.from(document.querySelectorAll('input[name="cbiShopWearer"]:checked')).map(function (node) { return node.value; });
      if (!name || !wearers.length) return;
      var category = document.getElementById('cbiShopCategory').value;
      if (category !== 'gift' && wearers.some(function (id) { return ['boss', 'jane'].indexOf(id) < 0; })) {
        showToast('服装与配饰目前只能放进 Boss / Jane 的衣柜');
        return;
      }
      db.work.shop.customItems.push(global.CBIData.normalizeShopItem({
        id: global.CBIData.createId('shop_item'),
        name: name,
        description: document.getElementById('cbiShopDesc').value.trim(),
        series: document.getElementById('cbiShopSeries').value.trim() || '自选',
        category: category,
        wearers: wearers,
        price: Number(document.getElementById('cbiShopPrice').value),
        color: document.getElementById('cbiShopColor').value,
        reaction: document.getElementById('cbiShopReaction').value.trim()
      }));
      save(); closeModal(); render(); showToast('已加入自选商城');
    });
  }

  function handleClick(event) {
    var target = event.target.closest('[data-cbi-shop-action]');
    if (!target) return;
    if (target.dataset.cbiShopAction === 'open-item') openItem(target.dataset.id);
  }

  function mount() {
    if (!global.CBIData) return false;
    document.body.dataset.cbiShop = '1';
    injectStyles();
    db = global.CBIData.load();
    document.title = 'CBI · Shop';
    document.querySelector('.top-bar h1').textContent = 'CBI · SHOP';
    document.querySelector('.tabs').innerHTML = '<div class="tab active" data-tab="preset">精选</div><div class="tab" data-tab="custom">自选</div><div class="tab" data-tab="wardrobe">衣柜</div><div class="tab" data-tab="log">记录</div>';
    document.querySelectorAll('.tabs .tab').forEach(function (node) { node.addEventListener('click', function () { setTab(node.dataset.tab); }); });
    var add = document.getElementById('addBtn');
    add.removeAttribute('onclick');
    add.addEventListener('click', customItemModal);
    document.body.insertAdjacentHTML('beforeend', '<div class="modal-bg" id="cbiShopModal"><div class="modal"><h2 id="cbiShopModalTitle"></h2><div id="cbiShopModalBody"></div><div class="btn-row"><button class="btn btn-cancel" id="cbiShopModalCancel">关闭</button><button class="btn btn-primary" id="cbiShopModalPrimary">确认</button></div></div></div><div class="cbi-shop-toast" id="cbiShopToast"></div>');
    document.getElementById('cbiShopModalCancel').addEventListener('click', closeModal);
    modal().addEventListener('click', function (event) { if (event.target === modal()) closeModal(); });
    document.getElementById('content').addEventListener('click', handleClick);
    render();
    return true;
  }

  global.CBIShop = Object.freeze({ mount: mount, BUILT_INS: BUILT_INS.slice() });
})(window);
