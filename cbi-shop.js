(function (global) {
  'use strict';

  var NAMES = {
    boss: 'Boss',
    jane: 'Jane',
    cho: 'Cho',
    rigsby: 'Rigsby',
    lisbon: 'Lisbon',
    vanpelt: 'Van Pelt'
  };
  var TARGETS = ['boss', 'jane', 'cho', 'rigsby', 'lisbon', 'vanpelt'];
  var LEGACY_ITEMS = [
    {
      id: 'cbi_ninja_turtle_hoodie',
      name: '忍者神龟卫衣',
      description: '绿色连帽卫衣，正面印着四只忍者神龟。',
      price: 120,
      targetIds: ['boss', 'jane'],
      reaction: 'Cho：很显眼。\nRigsby：我觉得挺酷。\nVan Pelt：……Jane先生为什么也有一件？\nJane：团队制服。只是有人偏心，多给了我一件。'
    },
    {
      id: 'cbi_black_hoodie',
      name: '黑色工作卫衣',
      description: '没有图案，适合加班、临时外勤和占领办公室沙发。',
      price: 90,
      targetIds: ['boss', 'jane'],
      reaction: 'Rigsby：这件很适合Boss。\nJane：至少这件不用配领带。'
    },
    {
      id: 'cbi_silver_studs',
      name: '银色耳钉',
      description: '很小的一对银色耳钉。',
      price: 70,
      targetIds: ['boss'],
      reaction: 'Van Pelt认真看了两秒：Boss，很好看。\nJane抬眼盯了更久：……还行。'
    },
    {
      id: 'cbi_jane_tea_tin',
      name: '便携茶叶罐',
      description: '可以塞进外套口袋的小茶叶罐。',
      price: 55,
      targetIds: ['jane'],
      reaction: 'Jane掂了掂茶叶罐：不错。现在唯一的问题是，谁负责烧水？'
    }
  ];

  var db = null;
  var currentProjectId = '';
  var collapsed = {};
  var toastTimer = null;

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function loadCollapsed() {
    try {
      var parsed = JSON.parse(global.localStorage.getItem('cbi_shop_collapsed_v1'));
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function saveCollapsed() {
    try { global.localStorage.setItem('cbi_shop_collapsed_v1', JSON.stringify(collapsed)); } catch (error) {}
  }

  function save() {
    db = global.CBIData.save(db) || db;
  }

  function projects() {
    return db.work.shop.projects || [];
  }

  function projectById(id) {
    return projects().find(function (project) { return project.id === id; }) || null;
  }

  function itemRef(projectId, itemId) {
    var project = projectById(projectId);
    if (!project) return null;
    var item = project.items.find(function (entry) { return entry.id === itemId; });
    return item ? { project: project, item: item } : null;
  }

  function isOwned(itemId) {
    return db.work.shop.owned.indexOf(itemId) >= 0;
  }

  function sortedProjects() {
    return projects().slice().sort(function (a, b) {
      return (a.order - b.order) || a.name.localeCompare(b.name, 'zh');
    });
  }

  function targetText(item) {
    if (!item.targetIds || !item.targetIds.length) return '未指定';
    return item.targetIds.map(function (id) { return NAMES[id] || id; }).join(' / ');
  }

  function isImage(value) {
    value = String(value || '').trim();
    return /^(https?:|data:image\/|blob:|\/|\.\/|\.\.\/)/i.test(value) || /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(value);
  }

  function coverMarkup(project, className) {
    var cover = String(project.cover || '').trim();
    if (cover && isImage(cover)) {
      return '<div class="' + className + '" style="background:' + esc(project.color) + '12"><img src="' + esc(cover) + '" alt=""></div>';
    }
    var mark = cover || project.name.slice(0, 1) || '·';
    return '<div class="' + className + '" style="background:' + esc(project.color) + '16;color:' + esc(project.color) + '">' + esc(mark) + '</div>';
  }

  function itemImageMarkup(item, color) {
    if (item.image && isImage(item.image)) {
      return '<div class="shop-item-image"><img src="' + esc(item.image) + '" alt=""></div>';
    }
    return '<div class="shop-item-image shop-item-placeholder" style="color:' + esc(color) + ';background:' + esc(color) + '12">◇</div>';
  }

  function injectStyles() {
    if (document.getElementById('cbiShopV2Styles')) return;
    var style = document.createElement('style');
    style.id = 'cbiShopV2Styles';
    style.textContent = [
      '*{box-sizing:border-box}',
      'body[data-cbi-shop="2"]{margin:0;background:#fafafa;color:#242424;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",sans-serif;min-height:100vh;min-height:100dvh;padding:0 0 62px;-webkit-tap-highlight-color:transparent}',
      'body[data-cbi-shop="2"] button,body[data-cbi-shop="2"] input,body[data-cbi-shop="2"] textarea{font:inherit}',
      '.shop-top{position:sticky;top:0;z-index:50;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;padding:15px 20px;padding-top:calc(15px + env(safe-area-inset-top,0px));background:rgba(255,255,255,.96);border-bottom:1px solid #eeeeec}',
      '.shop-top h1{margin:0;color:#8d8579;font-size:12px;font-weight:500;letter-spacing:3.2px;white-space:nowrap}',
      '.shop-top button,.shop-top a{border:0;background:none;padding:4px 0;color:#aaa;font-size:11px;text-decoration:none;cursor:pointer}',
      '.shop-top .shop-back{justify-self:start;text-align:left}',
      '.shop-top .shop-action{justify-self:end;text-align:right}',
      '.shop-summary{padding:23px 20px 18px;background:#fff;border-bottom:1px solid #eeeeec}',
      '.shop-kicker{color:#b1aaa0;font-size:9px;letter-spacing:1.3px;text-transform:uppercase}',
      '.shop-summary-line{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-top:7px}',
      '.shop-summary h2{margin:0;font-size:20px;font-weight:450;letter-spacing:.1px}',
      '.shop-summary-count{color:#aaa;font-size:10px;font-variant-numeric:tabular-nums}',
      '.shop-summary p{margin:7px 0 0;color:#aaa;font-size:10px;line-height:1.65}',
      '.shop-category-head{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:13px;padding:14px 20px;background:#fafafa;color:#9c968d;font-size:10px;cursor:pointer}',
      '.shop-category-head:before,.shop-category-head:after{content:"";height:1px;background:#dededb}',
      '.shop-category-label{display:flex;align-items:center;gap:7px;white-space:nowrap}',
      '.shop-category-arrow{color:#bbb;font-size:8px;transition:transform .18s}',
      '.shop-category-head.collapsed .shop-category-arrow{transform:rotate(-90deg)}',
      '.shop-projects{background:#fff}',
      '.shop-project-row{position:relative;display:flex;align-items:center;gap:14px;min-height:106px;padding:15px 20px 14px 30px;border-bottom:1px solid #f0f0ee;cursor:pointer}',
      '.shop-project-row:before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--project-color)}',
      '.shop-project-cover{width:64px;height:64px;flex:0 0 64px;border-radius:10px;display:flex;align-items:center;justify-content:center;overflow:hidden;font-size:21px;font-weight:500}',
      '.shop-project-cover img,.shop-detail-cover img,.shop-item-image img{width:100%;height:100%;object-fit:cover;display:block}',
      '.shop-project-copy{min-width:0;flex:1}',
      '.shop-project-name{font-size:14px;font-weight:550;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.shop-project-note{height:16px;margin-top:4px;color:#aaa;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.shop-project-progress{display:flex;align-items:center;gap:9px;margin-top:9px;color:#bbb;font-size:9px;font-variant-numeric:tabular-nums}',
      '.shop-progress-track{width:150px;max-width:45vw;height:3px;background:#eeeeec;overflow:hidden;border-radius:2px}',
      '.shop-progress-fill{height:100%;background:var(--project-color);border-radius:2px}',
      '.shop-add-row{width:100%;padding:18px 20px;border:0;border-bottom:1px solid #eeeeec;background:#fff;color:#bbb;font-size:11px;letter-spacing:.3px;cursor:pointer}',
      '.shop-empty{padding:76px 28px;text-align:center;background:#fff}',
      '.shop-empty-mark{color:#c7c2ba;font-size:26px;font-weight:200}',
      '.shop-empty-title{margin-top:14px;font-size:14px;font-weight:500;color:#555}',
      '.shop-empty-copy{max-width:320px;margin:8px auto 20px;color:#aaa;font-size:10px;line-height:1.8}',
      '.shop-empty button{border:0;border-bottom:1px solid #aaa;background:none;padding:7px 1px;color:#777;font-size:10px;cursor:pointer}',
      '.shop-detail-head{display:flex;gap:16px;align-items:center;padding:20px;background:#fff;border-bottom:1px solid #eeeeec}',
      '.shop-detail-cover{width:78px;height:78px;flex:0 0 78px;border-radius:11px;display:flex;align-items:center;justify-content:center;overflow:hidden;font-size:24px}',
      '.shop-detail-copy{min-width:0;flex:1}',
      '.shop-detail-category{font-size:9px;letter-spacing:1px;color:#aaa;text-transform:uppercase}',
      '.shop-detail-name{margin-top:5px;font-size:18px;font-weight:500;line-height:1.3}',
      '.shop-detail-note{margin-top:5px;color:#999;font-size:10px;line-height:1.55}',
      '.shop-detail-progress{margin-top:8px;color:#aaa;font-size:9px;font-variant-numeric:tabular-nums}',
      '.shop-items{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:16px 20px 20px;background:#fff;border-bottom:1px solid #eeeeec}',
      '.shop-item{position:relative;min-width:0;padding:7px 7px 9px;border:1px solid #ececea;border-radius:8px;background:#fff;cursor:pointer}',
      '.shop-item:not(.owned){opacity:.48}',
      '.shop-item.owned{border-color:var(--project-color)}',
      '.shop-item-image{width:100%;aspect-ratio:1/1;border-radius:5px;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#f4f4f2}',
      '.shop-item-placeholder{font-size:18px}',
      '.shop-item-name{margin-top:7px;color:#555;font-size:9px;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.shop-item-meta{margin-top:3px;color:#bbb;font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.shop-owned-mark{position:absolute;right:4px;top:4px;display:flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:var(--project-color);color:#fff;font-size:8px}',
      '.shop-items-empty{grid-column:1/-1;padding:46px 10px;color:#bbb;font-size:10px;text-align:center;line-height:1.8}',
      '.shop-bottom-nav{position:fixed;z-index:60;left:0;right:0;bottom:0;display:flex;padding:0 12px env(safe-area-inset-bottom,0);background:rgba(255,255,255,.94);border-top:1px solid rgba(0,0,0,.06);backdrop-filter:blur(16px)}',
      '.shop-bottom-nav a{position:relative;flex:1;padding:15px 0 13px;color:#bbb;font-size:10px;letter-spacing:.25px;text-align:center;text-decoration:none}',
      '.shop-bottom-nav a.active{color:#4e4a44}',
      '.shop-bottom-nav a.active:before{content:"";position:absolute;left:36%;right:36%;top:0;height:1px;background:#9c907c}',
      'body[data-cbi-shop="2"] #liminalCloudBadgeHost.liminal-cloud-floating-host{bottom:calc(66px + env(safe-area-inset-bottom,0px))}',
      '.shop-modal-bg{position:fixed;inset:0;z-index:200;display:none;align-items:flex-end;justify-content:center;background:rgba(25,25,25,.22);backdrop-filter:blur(5px)}',
      '.shop-modal-bg.show{display:flex}',
      '.shop-modal{width:100%;max-width:560px;max-height:88vh;overflow:auto;padding:22px 20px calc(20px + env(safe-area-inset-bottom,0));border-radius:16px 16px 0 0;background:#fff;box-shadow:0 -12px 50px rgba(0,0,0,.08)}',
      '.shop-modal h2{margin:0 0 17px;color:#444;font-size:14px;font-weight:550;text-align:left}',
      '.shop-field{display:block;margin-top:13px}',
      '.shop-field>span,.shop-target-title{display:block;margin-bottom:5px;color:#aaa;font-size:10px}',
      '.shop-field input,.shop-field textarea{width:100%;padding:11px 12px;border:1px solid #e7e7e4;border-radius:7px;background:#fbfbfa;color:#333;font-size:12px;outline:none}',
      '.shop-field textarea{min-height:72px;resize:vertical;line-height:1.55}',
      '.shop-field input:focus,.shop-field textarea:focus{border-color:#c6c1b9;background:#fff}',
      '.shop-project-form-row{display:flex;align-items:flex-end;gap:9px}',
      '.shop-project-form-row .shop-field{flex:1;min-width:0}',
      '.shop-project-form-row .shop-color-field{flex:0 0 46px}',
      '.shop-color-field input{height:39px;padding:3px;width:46px;background:#fff;cursor:pointer}',
      '.shop-targets{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:6px}',
      '.shop-targets label{display:flex;align-items:center;gap:5px;color:#777;font-size:10px}',
      '.shop-targets input{accent-color:#777}',
      '.shop-modal-note{margin-top:10px;color:#aaa;font-size:9px;line-height:1.65}',
      '.shop-modal-actions{display:flex;gap:8px;margin-top:20px}',
      '.shop-modal-actions button{flex:1;padding:11px 8px;border:0;border-radius:5px;background:#efefed;color:#777;font-size:11px;cursor:pointer}',
      '.shop-modal-actions button.primary{background:#262626;color:#fff}',
      '.shop-modal-actions button.danger{background:#fff;color:#b66a5e;border:1px solid #ead7d3}',
      '.shop-item-detail{text-align:center}',
      '.shop-item-detail .shop-item-image{width:94px;margin:0 auto}',
      '.shop-item-detail h3{margin:14px 0 0;font-size:16px;font-weight:550}',
      '.shop-item-detail .meta{margin-top:7px;color:#aaa;font-size:9px}',
      '.shop-item-detail .copy{margin-top:13px;padding-top:12px;border-top:1px solid #eee;color:#777;font-size:11px;line-height:1.75;text-align:left;white-space:pre-wrap}',
      '.shop-toast{position:fixed;z-index:500;left:50%;bottom:76px;max-width:86vw;padding:9px 14px;border-radius:7px;background:rgba(30,30,30,.9);color:#fff;font-size:10px;text-align:center;opacity:0;pointer-events:none;transform:translateX(-50%) translateY(9px);transition:.2s}',
      '.shop-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}',
      '@media(min-width:760px){.shop-items{grid-template-columns:repeat(5,minmax(0,1fr));padding-left:32px;padding-right:32px}.shop-project-row{padding-left:34px;padding-right:34px}.shop-summary,.shop-detail-head{padding-left:34px;padding-right:34px}}'
    ].join('');
    document.head.appendChild(style);
  }

  function shell() {
    document.body.innerHTML =
      '<header class="shop-top">' +
        '<button class="shop-back" id="shopBack" type="button">← Home</button>' +
        '<h1>SHOP</h1>' +
        '<button class="shop-action" id="shopTopAction" type="button">＋ 系列</button>' +
      '</header>' +
      '<main id="shopRoot"></main>' +
      '<nav class="shop-bottom-nav" aria-label="Reality Wallet">' +
        '<a href="wallet.html">记账</a>' +
        '<a href="wallet.html#allowance">额度</a>' +
        '<a href="wallet.html#wishes">申请</a>' +
        '<a class="active" href="shop.html" aria-current="page">商城</a>' +
      '</nav>' +
      '<div class="shop-modal-bg" id="shopModal">' +
        '<div class="shop-modal">' +
          '<h2 id="shopModalTitle"></h2>' +
          '<div id="shopModalBody"></div>' +
          '<div class="shop-modal-actions" id="shopModalActions"></div>' +
        '</div>' +
      '</div>' +
      '<div class="shop-toast" id="shopToast"></div>';
  }

  function showToast(message) {
    var node = document.getElementById('shopToast');
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { node.classList.remove('show'); }, 2400);
  }

  function closeModal() {
    document.getElementById('shopModal').classList.remove('show');
  }

  function showModal(title, body, actions) {
    document.getElementById('shopModalTitle').textContent = title;
    document.getElementById('shopModalBody').innerHTML = body;
    var actionRoot = document.getElementById('shopModalActions');
    actionRoot.innerHTML = '';
    (actions || []).forEach(function (action) {
      var button = document.createElement('button');
      button.type = 'button';
      button.textContent = action.label;
      button.className = action.kind || '';
      button.addEventListener('click', action.onClick);
      actionRoot.appendChild(button);
    });
    document.getElementById('shopModal').classList.add('show');
  }

  function configureTop() {
    var back = document.getElementById('shopBack');
    var action = document.getElementById('shopTopAction');
    if (currentProjectId) {
      back.textContent = '← Shop';
      back.onclick = function () {
        currentProjectId = '';
        render();
        global.scrollTo(0, 0);
      };
      action.textContent = '编辑';
      action.onclick = function () { openProjectForm(currentProjectId); };
    } else {
      back.textContent = '← Home';
      back.onclick = function () { global.location.href = 'index.html?p=5'; };
      action.textContent = '＋ 系列';
      action.onclick = function () { openProjectForm(''); };
    }
  }

  function overallCounts() {
    var total = 0;
    var acquired = 0;
    projects().forEach(function (project) {
      total += project.items.length;
      project.items.forEach(function (item) { if (isOwned(item.id)) acquired += 1; });
    });
    return { total: total, acquired: acquired };
  }

  function renderHome() {
    var root = document.getElementById('shopRoot');
    var counts = overallCounts();
    var list = sortedProjects();
    var html =
      '<section class="shop-summary">' +
        '<div class="shop-kicker">Crossworld window</div>' +
        '<div class="shop-summary-line"><h2>跨世界橱窗</h2><div class="shop-summary-count">' + list.length + ' 系列 · ' + counts.acquired + '/' + counts.total + ' 已获得</div></div>' +
        '<p>先整理想买的系列与品目；当前点亮只登记获得，不扣除日课货币或记账额度。</p>' +
      '</section>';
    if (!list.length) {
      html +=
        '<section class="shop-empty">' +
          '<div class="shop-empty-mark">◇</div>' +
          '<div class="shop-empty-title">橱窗还是空的</div>' +
          '<div class="shop-empty-copy">可以先建立“本子类 / Rollbahn”这样的分类与系列，再进入系列添加具体品目。</div>' +
          '<button type="button" data-shop-action="add-project">建立第一个系列</button>' +
        '</section>';
      root.innerHTML = html;
      return;
    }
    var categories = [];
    list.forEach(function (project) {
      if (categories.indexOf(project.category) < 0) categories.push(project.category);
    });
    categories.forEach(function (category) {
      var isCollapsed = collapsed[category] === true;
      html +=
        '<div class="shop-category-head' + (isCollapsed ? ' collapsed' : '') + '" data-shop-action="toggle-category" data-category="' + esc(category) + '">' +
          '<span class="shop-category-label">' + esc(category) + '<span class="shop-category-arrow">▼</span></span>' +
        '</div>';
      if (!isCollapsed) {
        html += '<div class="shop-projects">';
        list.filter(function (project) { return project.category === category; }).forEach(function (project) {
          var ownedCount = project.items.filter(function (item) { return isOwned(item.id); }).length;
          var total = project.items.length;
          var percent = total ? Math.round(ownedCount / total * 100) : 0;
          html +=
            '<article class="shop-project-row" style="--project-color:' + esc(project.color) + '" data-shop-action="open-project" data-project-id="' + esc(project.id) + '">' +
              coverMarkup(project, 'shop-project-cover') +
              '<div class="shop-project-copy">' +
                '<div class="shop-project-name">' + esc(project.name) + '</div>' +
                '<div class="shop-project-note">' + esc(project.note || ' ') + '</div>' +
                '<div class="shop-project-progress"><span>' + ownedCount + ' / ' + total + '</span><span class="shop-progress-track"><span class="shop-progress-fill" style="width:' + percent + '%"></span></span><span>' + percent + '%</span></div>' +
              '</div>' +
            '</article>';
        });
        html += '</div>';
      }
    });
    html += '<button class="shop-add-row" type="button" data-shop-action="add-project">＋ 添加系列</button>';
    root.innerHTML = html;
  }

  function renderProject() {
    var project = projectById(currentProjectId);
    if (!project) {
      currentProjectId = '';
      renderHome();
      return;
    }
    var ownedCount = project.items.filter(function (item) { return isOwned(item.id); }).length;
    var html =
      '<section class="shop-detail-head">' +
        coverMarkup(project, 'shop-detail-cover') +
        '<div class="shop-detail-copy">' +
          '<div class="shop-detail-category">' + esc(project.category) + '</div>' +
          '<div class="shop-detail-name">' + esc(project.name) + '</div>' +
          (project.note ? '<div class="shop-detail-note">' + esc(project.note) + '</div>' : '') +
          '<div class="shop-detail-progress">' + ownedCount + ' / ' + project.items.length + ' 品目已点亮</div>' +
        '</div>' +
      '</section>' +
      '<section class="shop-items" style="--project-color:' + esc(project.color) + '">';
    if (!project.items.length) {
      html += '<div class="shop-items-empty">这个系列还没有品目。<br>从下面添加第一件。</div>';
    } else {
      project.items.slice().sort(function (a, b) {
        return (a.order - b.order) || a.name.localeCompare(b.name, 'zh');
      }).forEach(function (item) {
        var acquired = isOwned(item.id);
        html +=
          '<article class="shop-item' + (acquired ? ' owned' : '') + '" data-shop-action="open-item" data-project-id="' + esc(project.id) + '" data-item-id="' + esc(item.id) + '">' +
            (acquired ? '<span class="shop-owned-mark">✓</span>' : '') +
            itemImageMarkup(item, project.color) +
            '<div class="shop-item-name">' + esc(item.name) + '</div>' +
            '<div class="shop-item-meta">' + esc(targetText(item)) + '</div>' +
          '</article>';
      });
    }
    html += '</section><button class="shop-add-row" type="button" data-shop-action="add-item" data-project-id="' + esc(project.id) + '">＋ 添加品目</button>';
    document.getElementById('shopRoot').innerHTML = html;
  }

  function render() {
    configureTop();
    if (currentProjectId) renderProject();
    else renderHome();
  }

  function categoryOptions() {
    var names = [];
    sortedProjects().forEach(function (project) {
      if (names.indexOf(project.category) < 0) names.push(project.category);
    });
    return names.map(function (name) { return '<option value="' + esc(name) + '"></option>'; }).join('');
  }

  function openProjectForm(projectId) {
    var existing = projectById(projectId);
    var project = existing || {
      name: '',
      category: '',
      color: '#A9A39A',
      cover: '',
      note: ''
    };
    var body =
      '<label class="shop-field"><span>系列名称</span><input id="shopProjectName" type="text" maxlength="80" value="' + esc(project.name) + '" placeholder="如：Rollbahn"></label>' +
      '<div class="shop-project-form-row">' +
        '<label class="shop-field"><span>分类</span><input id="shopProjectCategory" type="text" list="shopCategoryList" maxlength="40" value="' + esc(project.category) + '" placeholder="如：本子类"><datalist id="shopCategoryList">' + categoryOptions() + '</datalist></label>' +
        '<label class="shop-field shop-color-field"><span>代表色</span><input id="shopProjectColor" type="color" value="' + esc(project.color) + '"></label>' +
      '</div>' +
      '<label class="shop-field"><span>封面图网址或一个符号（选填）</span><input id="shopProjectCover" type="text" value="' + esc(project.cover) + '" placeholder="https://… 或 ✎"></label>' +
      '<label class="shop-field"><span>系列备注（选填）</span><textarea id="shopProjectNote" maxlength="240" placeholder="品牌、款式或收集范围">' + esc(project.note) + '</textarea></label>';
    var actions = [{ label: '取消', onClick: closeModal }];
    if (existing) {
      actions.push({ label: '删除', kind: 'danger', onClick: function () { deleteProject(existing.id); } });
    }
    actions.push({ label: '保存', kind: 'primary', onClick: function () { saveProject(existing ? existing.id : ''); } });
    showModal(existing ? '编辑系列' : '建立系列', body, actions);
    setTimeout(function () {
      var input = document.getElementById('shopProjectName');
      if (input) input.focus();
    }, 30);
  }

  function saveProject(projectId) {
    var name = document.getElementById('shopProjectName').value.trim();
    var category = document.getElementById('shopProjectCategory').value.trim();
    if (!name) { showToast('请填写系列名称'); return; }
    if (!category) { showToast('请填写分类'); return; }
    var existing = projectById(projectId);
    var raw = {
      id: existing ? existing.id : global.CBIData.createId('shop_project'),
      name: name,
      category: category,
      color: document.getElementById('shopProjectColor').value,
      cover: document.getElementById('shopProjectCover').value.trim(),
      note: document.getElementById('shopProjectNote').value.trim(),
      order: existing ? existing.order : projects().length,
      items: existing ? existing.items : []
    };
    var normalized = global.CBIData.normalizeShopProject(raw, raw.order);
    if (existing) {
      db.work.shop.projects = projects().map(function (project) { return project.id === existing.id ? normalized : project; });
    } else {
      db.work.shop.projects.push(normalized);
      currentProjectId = normalized.id;
    }
    save();
    closeModal();
    render();
    showToast(existing ? '系列已更新' : '系列已建立');
  }

  function deleteProject(projectId) {
    var project = projectById(projectId);
    if (!project) return;
    var message = project.items.length
      ? '删除“' + project.name + '”以及其中 ' + project.items.length + ' 个品目？'
      : '删除“' + project.name + '”？';
    if (!global.confirm(message)) return;
    var itemIds = project.items.map(function (item) { return item.id; });
    db.work.shop.projects = projects().filter(function (entry) { return entry.id !== projectId; });
    db.work.shop.owned = db.work.shop.owned.filter(function (id) { return itemIds.indexOf(id) < 0; });
    db.work.shop.reactionsSeen = db.work.shop.reactionsSeen.filter(function (id) { return itemIds.indexOf(id) < 0; });
    db.work.shop.purchaseLog = db.work.shop.purchaseLog.filter(function (entry) { return itemIds.indexOf(entry.itemId) < 0; });
    currentProjectId = '';
    save();
    closeModal();
    render();
    showToast('系列已删除');
  }

  function targetChecks(selected) {
    selected = selected || [];
    return TARGETS.map(function (id) {
      return '<label><input type="checkbox" name="shopItemTarget" value="' + id + '"' + (selected.indexOf(id) >= 0 ? ' checked' : '') + '> ' + esc(NAMES[id]) + '</label>';
    }).join('');
  }

  function openItemForm(projectId, itemId) {
    var project = projectById(projectId);
    if (!project) return;
    var ref = itemId ? itemRef(projectId, itemId) : null;
    var item = ref ? ref.item : {
      name: '',
      image: '',
      price: 0,
      targetIds: [],
      description: '',
      reaction: ''
    };
    var body =
      '<label class="shop-field"><span>品目名称</span><input id="shopItemName" type="text" maxlength="100" value="' + esc(item.name) + '" placeholder="如：甜点封面 Rollbahn"></label>' +
      '<label class="shop-field"><span>图片网址（选填）</span><input id="shopItemImage" type="text" value="' + esc(item.image) + '" placeholder="https://…"></label>' +
      '<label class="shop-field"><span>参考金额（选填，当前不会扣款）</span><input id="shopItemPrice" type="number" min="0" step="1" value="' + (item.price || 0) + '"></label>' +
      '<div class="shop-field"><span class="shop-target-title">适合谁（可多选）</span><div class="shop-targets">' + targetChecks(item.targetIds) + '</div></div>' +
      '<label class="shop-field"><span>品目说明（选填）</span><textarea id="shopItemDescription" maxlength="400" placeholder="颜色、尺寸或想买它的理由">' + esc(item.description) + '</textarea></label>' +
      '<label class="shop-field"><span>角色反应草稿（选填，暂不自动播放）</span><textarea id="shopItemReaction" maxlength="800" placeholder="以后可供动态模块使用">' + esc(item.reaction) + '</textarea></label>' +
      '<div class="shop-modal-note">现在的“点亮”只是品目打卡。娱乐账户与动态刷新接入后，再决定实际扣款和剧情消耗。</div>';
    var actions = [{ label: '取消', onClick: closeModal }];
    if (ref) actions.push({ label: '删除', kind: 'danger', onClick: function () { deleteItem(projectId, itemId); } });
    actions.push({ label: '保存', kind: 'primary', onClick: function () { saveItem(projectId, itemId || ''); } });
    showModal(ref ? '编辑品目' : '添加品目', body, actions);
  }

  function saveItem(projectId, itemId) {
    var project = projectById(projectId);
    if (!project) return;
    var existing = itemId ? itemRef(projectId, itemId) : null;
    var name = document.getElementById('shopItemName').value.trim();
    if (!name) { showToast('请填写品目名称'); return; }
    var targetIds = Array.prototype.slice.call(document.querySelectorAll('input[name="shopItemTarget"]:checked')).map(function (node) {
      return node.value;
    });
    var raw = {
      id: existing ? existing.item.id : global.CBIData.createId('shop_item'),
      name: name,
      image: document.getElementById('shopItemImage').value.trim(),
      price: document.getElementById('shopItemPrice').value,
      targetIds: targetIds,
      description: document.getElementById('shopItemDescription').value.trim(),
      reaction: document.getElementById('shopItemReaction').value.trim(),
      acquiredAt: existing ? existing.item.acquiredAt : '',
      order: existing ? existing.item.order : project.items.length
    };
    var normalized = global.CBIData.normalizeShopProjectItem(raw);
    if (existing) {
      project.items = project.items.map(function (item) { return item.id === itemId ? normalized : item; });
    } else {
      project.items.push(normalized);
    }
    save();
    closeModal();
    render();
    showToast(existing ? '品目已更新' : '品目已添加');
  }

  function deleteItem(projectId, itemId) {
    var ref = itemRef(projectId, itemId);
    if (!ref || !global.confirm('删除品目“' + ref.item.name + '”？')) return;
    ref.project.items = ref.project.items.filter(function (item) { return item.id !== itemId; });
    db.work.shop.owned = db.work.shop.owned.filter(function (id) { return id !== itemId; });
    db.work.shop.reactionsSeen = db.work.shop.reactionsSeen.filter(function (id) { return id !== itemId; });
    db.work.shop.purchaseLog = db.work.shop.purchaseLog.filter(function (entry) { return entry.itemId !== itemId; });
    save();
    closeModal();
    render();
    showToast('品目已删除');
  }

  function openItemDetail(projectId, itemId) {
    var ref = itemRef(projectId, itemId);
    if (!ref) return;
    var item = ref.item;
    var acquired = isOwned(item.id);
    var body =
      '<div class="shop-item-detail">' +
        itemImageMarkup(item, ref.project.color) +
        '<h3>' + esc(item.name) + '</h3>' +
        '<div class="meta">' + esc(targetText(item)) + (item.price ? ' · 参考 ¥' + item.price : '') + '</div>' +
        (item.description ? '<div class="copy">' + esc(item.description) + '</div>' : '') +
        (item.reaction ? '<div class="copy">动态草稿\n' + esc(item.reaction) + '</div>' : '') +
      '</div>';
    var actions = [
      { label: '关闭', onClick: closeModal },
      { label: '编辑', onClick: function () { closeModal(); openItemForm(projectId, itemId); } }
    ];
    if (acquired) {
      actions.push({ label: '取消点亮', kind: 'danger', onClick: function () { setAcquired(projectId, itemId, false); } });
    } else {
      actions.push({ label: '登记获得', kind: 'primary', onClick: function () { setAcquired(projectId, itemId, true); } });
    }
    showModal(acquired ? '已获得品目' : '品目打卡', body, actions);
  }

  function setAcquired(projectId, itemId, acquired) {
    var ref = itemRef(projectId, itemId);
    if (!ref) return;
    if (acquired && !isOwned(itemId)) {
      var acquiredAt = new Date().toISOString();
      db.work.shop.owned.push(itemId);
      ref.item.acquiredAt = acquiredAt;
      db.work.shop.purchaseLog.push({
        itemId: itemId,
        price: 0,
        purchasedAt: acquiredAt,
        source: 'checkin'
      });
    } else if (!acquired && isOwned(itemId)) {
      db.work.shop.owned = db.work.shop.owned.filter(function (id) { return id !== itemId; });
      ref.item.acquiredAt = '';
      db.work.shop.purchaseLog = db.work.shop.purchaseLog.filter(function (entry) {
        return !(entry.itemId === itemId && entry.source === 'checkin');
      });
    }
    save();
    closeModal();
    render();
    showToast(acquired ? '品目已点亮 · 未扣除额度' : '已取消点亮');
  }

  function migrateLegacyOwnedItems() {
    var archived = [];
    LEGACY_ITEMS.forEach(function (legacy) {
      if (!isOwned(legacy.id)) return;
      var exists = projects().some(function (project) {
        return project.items.some(function (item) { return item.id === legacy.id; });
      });
      if (!exists) archived.push(legacy);
    });
    if (!archived.length) return;
    db.work.shop.projects.push(global.CBIData.normalizeShopProject({
      id: 'legacy_owned_archive',
      name: '旧商城已购',
      category: '旧商城归档',
      color: '#9B948A',
      cover: '◇',
      note: '保留改版前已经购入的商品',
      order: projects().length,
      items: archived.map(function (item, index) {
        var log = db.work.shop.purchaseLog.find(function (entry) { return entry.itemId === item.id; });
        return Object.assign({}, item, {
          acquiredAt: log ? log.purchasedAt : '',
          order: index
        });
      })
    }, projects().length));
    save();
  }

  function handleRootClick(event) {
    var target = event.target.closest('[data-shop-action]');
    if (!target) return;
    var action = target.dataset.shopAction;
    if (action === 'add-project') openProjectForm('');
    else if (action === 'toggle-category') {
      var category = target.dataset.category;
      collapsed[category] = collapsed[category] !== true;
      saveCollapsed();
      renderHome();
    } else if (action === 'open-project') {
      currentProjectId = target.dataset.projectId;
      render();
      global.scrollTo(0, 0);
    } else if (action === 'add-item') {
      openItemForm(target.dataset.projectId, '');
    } else if (action === 'open-item') {
      openItemDetail(target.dataset.projectId, target.dataset.itemId);
    }
  }

  function mount() {
    if (!global.CBIData) return false;
    document.body.dataset.cbiShop = '2';
    injectStyles();
    shell();
    db = global.CBIData.load();
    collapsed = loadCollapsed();
    migrateLegacyOwnedItems();
    document.title = 'Shop · Crossworld Window';
    document.getElementById('shopRoot').addEventListener('click', handleRootClick);
    document.getElementById('shopModal').addEventListener('click', function (event) {
      if (event.target.id === 'shopModal') closeModal();
    });
    render();
    return true;
  }

  global.CBIShop = Object.freeze({
    mount: mount
  });
})(window);
