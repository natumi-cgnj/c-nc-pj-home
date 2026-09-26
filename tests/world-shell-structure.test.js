const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const index = fs.readFileSync('index.html', 'utf8');
const cbi = fs.readFileSync('cbi.html', 'utf8');
const cloud = fs.readFileSync('cloud-sync.js', 'utf8');
const backup = fs.readFileSync('backup.html', 'utf8');
const meals = fs.readFileSync('meals.html', 'utf8');
const recipe = fs.readFileSync('recipe.html', 'utf8');
const schedule = fs.readFileSync('schedule.html', 'utf8');
const daily = fs.readFileSync('daily.html', 'utf8');
const shop = fs.readFileSync('shop.html', 'utf8');
const wallet = fs.readFileSync('wallet.html', 'utf8');
const worldContext = fs.readFileSync('world-context.js', 'utf8');

function count(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

test('one homepage hosts both apartment and CBI scenes', () => {
  assert.match(index, /id="aptWrap"/);
  assert.match(index, /id="cbiOfficeWrap"/);
  assert.match(index, /id="roomCbiOffice"/);
  assert.equal(count(index, /id="char-jane"/g), 1, 'Jane should be re-used instead of duplicated');
  assert.match(index, /WorldContext\.setActiveWorldId\(worldId\)/);
  assert.match(index, /openCbiLocationSheet\(event\)/);
  assert.match(index, /WorldContext\.setActiveLocationId\('cbi',locationId\)/);
  assert.match(index, /JANE_CBI_OFFICE_LINES/);
  assert.match(index, /JANE_CBI_HOME_LINES/);
  assert.doesNotMatch(index, /openRoomPkgSheet/);
  for (const charId of ['cho', 'rigsby', 'lisbon', 'vanpelt']) {
    assert.match(index, new RegExp(`id="char-${charId}"`));
    assert.match(index, new RegExp(`id="bubble-${charId}"`));
    assert.match(index, new RegExp(`id="status-${charId}"`));
    assert.match(index, new RegExp(`id="msg-${charId}"`));
  }
  assert.match(index, /const CBI_STAFF_OFFICE_LINES =/);
  assert.match(index, /function onCbiStaffTap\(charId,event\)[\s\S]*?positionBubbleAtCharacter\(bubble,charEl,wrap\)/);
  for (const charId of ['jane', 'cho', 'rigsby', 'lisbon', 'vanpelt']) {
    assert.match(index, new RegExp(`data-cbi-desk="${charId}"`));
  }
  assert.match(index, /CharacterRuntime\.getCbiPresenceRoster\(now\)/);
  assert.match(index, /function onCbiDeskTap\(charId,event\)/);
  assert.match(index, /status\.location==='home'/);
  assert.doesNotMatch(index, /getCbiDutyRoster\(CharacterRuntime\.calendarDateStr\(new Date\(\)\)/);
});

test('Boss status is reachable from both the CBI office and home desk', () => {
  assert.match(index, /class="cbi-desk cbi-desk-boss cbi-status-target" href="contact\.html" aria-label="设置 Boss 状态"/);
  assert.match(index, /class="cbi-home-status-target" href="contact\.html" aria-label="设置 Boss 状态"/);
  assert.match(index, /body\[data-world-id="cbi"\]\[data-world-location="home"\] \.cbi-home-status-target\{display:block\}/);
});

test('Jane uses first-case lines at the office and awake home lines in the bedroom and living room', () => {
  const staffStart = index.indexOf('const CBI_STAFF_OFFICE_LINES');
  const officeStart = index.indexOf('const JANE_CBI_OFFICE_LINES');
  const homeStart = index.indexOf('const JANE_CBI_HOME_LINES');
  const roomPackagesStart = index.indexOf('const ROOM_PACKAGES', homeStart);
  const staffLines = index.slice(staffStart, officeStart);
  const officeLines = index.slice(officeStart, homeStart);
  const homeLines = index.slice(homeStart, roomPackagesStart);
  assert.match(officeLines, /观察 Cho/);
  assert.match(officeLines, /观察 Rigsby/);
  assert.match(officeLines, /观察 Van Pelt/);
  assert.match(officeLines, /观察 Lisbon/);
  assert.equal(count(officeLines, /Lisbon/g), 1, 'Lisbon may be observed, but must not dominate Jane office lines');
  assert.doesNotMatch(officeLines, /忍住不纠正 Boss|确认 Boss 到底知不知道/);
  assert.ok(count(staffLines, /Boss/g) <= 4, 'staff chatter should imply authority naturally instead of repeating Boss');
  assert.doesNotMatch(staffLines, /交给 Boss 决定|由他决定|Boss 让我|马上向 Boss 汇报/);
  assert.doesNotMatch(officeLines, /卧室|客厅/);
  assert.match(homeLines, /卧室/);
  assert.match(homeLines, /客厅/);
  assert.doesNotMatch(homeLines, /客房/);
  assert.doesNotMatch(homeLines, /Lisbon/);
  assert.match(index, /JANE_BY_ZONE=JANE_CBI_HOME_LINES/);
  assert.match(index, /JANE_BY_ZONE=JANE_CBI_OFFICE_LINES/);
  assert.match(index, /label: 'Bedroom'/);
  assert.match(index, />Living Room⌄<\/button>/);
  assert.match(index, /cbi-bedroom-bed/);
  assert.match(index, /\.room-natumi \.natumi-bed\{display:none\}/);
  assert.match(worldContext, /home: \{ id: 'home', label: 'Living Room', description: "Boss's Home · Bedroom & Sofa Bed" \}/);
  assert.match(index, /function showCbiJaneSleepBubble\(status\)/);
  assert.match(index, /sleep\.status/);
  assert.match(index, /sleep\.detail/);
  assert.match(index, /#char-jane\.cbi-jane-sleeping\{pointer-events:none\}/);
  assert.match(index, /#char-jane\.cbi-jane-sleeping img\{visibility:hidden\}/);
  for (const placeId of ['bedroom_bed', 'bedroom_sofa', 'living_sofa_bed']) {
    assert.match(index, new RegExp(`data-cbi-sleep-place="${placeId}"`));
    assert.match(index, new RegExp(`onCbiSleepPlaceTap\\('${placeId}',event\\)`));
  }
  assert.match(index, /function syncCbiJaneSleepTargets\(status\)[\s\S]*?target\.hidden=!active/);
  assert.match(index, /function onCbiSleepPlaceTap\(placeId,event\)[\s\S]*?showCbiJaneSleepBubble\(status\)/);
  assert.match(index, /function renderCbiHomePresence\(\)[\s\S]*?syncCbiJaneSleepTargets\(status\)/);
  assert.match(index, /id="cgBanner" onclick="onCgBannerTap\(event\)"/);
  assert.match(index, /function onCgBannerTap\(event\)[\s\S]*?showCbiJaneSleepBubble\(presence\)/);
});

test('only Jane current sleep furniture opens the sleep status', () => {
  const start = index.indexOf('function syncCbiJaneSleepTargets');
  const end = index.indexOf('function positionCbiOfficeJane', start);
  assert.ok(start >= 0 && end > start, 'sleep target handlers should be extractable');

  function makeTarget(placeId) {
    const classes = new Set();
    return {
      dataset: { cbiSleepPlace: placeId },
      hidden: true,
      attributes: {},
      classList: {
        toggle(name, active) {
          if (active) classes.add(name);
          else classes.delete(name);
        },
        contains(name) { return classes.has(name); }
      },
      setAttribute(name, value) { this.attributes[name] = value; }
    };
  }

  const targets = ['bedroom_bed', 'bedroom_sofa', 'living_sofa_bed'].map(makeTarget);
  const status = {
    sleeping: true,
    sleep: { placeId: 'bedroom_sofa', placeLabel: '卧室的沙发' }
  };
  let shownStatus = null;
  const context = {
    document: { querySelectorAll: () => targets },
    window: { CharacterRuntime: {} },
    CharacterRuntime: { getCbiCharacterPresence: () => status },
    getActiveWorldId: () => 'cbi',
    getActiveLocationId: () => 'home',
    showCbiJaneSleepBubble(value) { shownStatus = value; return true; },
    Date
  };
  vm.runInNewContext(index.slice(start, end), context);

  context.syncCbiJaneSleepTargets(status);
  assert.equal(targets[0].hidden, true);
  assert.equal(targets[1].hidden, false);
  assert.equal(targets[1].classList.contains('is-active'), true);
  assert.equal(targets[2].hidden, true);
  assert.match(targets[1].attributes['aria-label'], /卧室的沙发/);

  assert.equal(context.onCbiSleepPlaceTap('bedroom_bed', { stopPropagation() {} }), false);
  assert.equal(shownStatus, null);
  assert.equal(context.onCbiSleepPlaceTap('bedroom_sofa', { stopPropagation() {} }), true);
  assert.equal(shownStatus, status);
});

test('CBI office lines keep Lisbon inside the team instead of assigning the whole group', () => {
  assert.doesNotMatch(index, /Rigsby 跑现场，Van Pelt 查资料，Cho 跟我过证词/);
  assert.doesNotMatch(index, /\{s:'分配工作'/);
  assert.doesNotMatch(index, /现场人员名单给我一份|\{s:'核对流程'/);
  assert.match(index, /她现在不需要把紧张藏起来了/);
  assert.match(index, /第二轮口供对完了/);
});

test('CBI locations have separate day and night banner scenes', () => {
  assert.match(index, /const CBI_CG_SLOT_META=/);
  for (const file of ['home-day.webp', 'home-night.webp', 'office-day.webp', 'office-night.webp']) {
    assert.match(index, new RegExp(`assets/cg/cbi/${file.replace('.', '\\.')}`));
    assert.ok(fs.existsSync(`assets/cg/cbi/${file}`), `${file} should exist`);
  }
  assert.match(index, /return getActiveWorldId\(\)==='cbi'\?'cbi:'\+getActiveLocationId\(\):'liminal'/);
  assert.match(index, /readCGContextJson\(CG_LIBRARY_KEY,target\)/);
  assert.match(index, /localStorage\.setItem\(baseKey,JSON\.stringify\(\{version:2,contexts\}\)\)/);
  assert.match(index, /function applyWorldView\(\)[\s\S]*?initCG\(\)/);
  assert.match(fs.readFileSync('world-context.js', 'utf8'), /banner: 'location'/);
});

test('world-sensitive entries use stable identities instead of mutable hrefs', () => {
  for (const id of ['daily-habits', 'daily-todo', 'daily-drop', 'wallet', 'kitchen', 'story', 'dungeon', 'shop', 'gacha']) {
    assert.match(index, new RegExp(`data-entry-id="${id}"`));
  }
  assert.match(index, /function entryOrderKey\(card\)/);
  assert.match(index, /c\.dataset\.baseHref\|\|c\.getAttribute\('href'\)/);
});

test('CBI files keep case fields and expose the editable merged timeline', () => {
  for (const id of ['caseEpisode', 'caseDate', 'caseTitle', 'caseStatus', 'caseSummary', 'caseCharacters', 'caseMainline', 'caseBody', 'caseChanges']) {
    assert.match(cbi, new RegExp(`id="${id}"`));
  }
  for (const id of ['timelineWhen', 'timelineSortDate', 'timelineType', 'timelineEpisode', 'timelineTitle', 'timelineSummary', 'timelineCharacters', 'timelineContinuity']) {
    assert.match(cbi, new RegExp(`id="${id}"`));
  }
  assert.match(cbi, /CBIData\.timelineEntries\(db\)/);
  assert.match(cbi, /onclick="openCaseEditor\(\)">＋ 案件/);
  assert.doesNotMatch(cbi, /relationship graph|score|评分|API/i);
});

test('world and CBI data participate in cloud sync and full backup', () => {
  for (const key of ['omniverse_world_context', 'cbi_db', 'meal_log_db', 'meal_companion_db', 'recipe_salad_db', 'schedule_packs', 'schedule_user_events']) {
    assert.match(cloud, new RegExp(`'${key}'`));
    assert.match(backup, new RegExp(`key:'${key}'`));
  }
  assert.match(cloud, /'cbi\.html': \['cbi_db', 'wallet_db',[^\]]*'omniverse_world_context'\]/);
  assert.match(cloud, /'home_custom_shortcuts'/);
  assert.match(cloud, /'index\.html': \[[^\]]*'home_custom_shortcuts'/);
  assert.match(backup, /key:'home_custom_shortcuts'/);
});

test('food archive stays global while meals and recipes switch world layers', () => {
  assert.match(index, /href="meals\.html" data-world-module="kitchen" data-entry-id="kitchen"/);
  assert.match(index, /href="kitchen\.html" data-entry-id="food-archive"/);
  assert.match(index, /hasSavedModule\?s\.moduleId:/,
    'desktop shortcuts must preserve an explicitly empty module id for global entries such as Food');
  assert.doesNotMatch(index, /var moduleId=s\.moduleId\|\|/,
    'Food must not be inferred back into the world-sensitive kitchen module');
  assert.match(meals, /const LOG_KEY='meal_log_db'/);
  assert.match(meals, /const COMPANION_KEY='meal_companion_db'/);
  assert.match(meals, /cbi:\{label:'CBI · Sacramento',characters:\{\}/);
  for (const className of ['mini-cal-row', 'dining-invite', 'shelf-header', 'project-row']) {
    assert.match(meals, new RegExp(`class="[^"]*${className}`));
  }
  assert.match(meals, /id="diningDatePick"/);
  assert.doesNotMatch(meals, /prompt\(/);
  assert.match(recipe, /getScopedStorageKey\('recipe_salad_db',WORLD_ID\)/);
  assert.match(recipe, /const RECIPES=WORLD_ID==='liminal'\?LIMINAL_RECIPES:\[\]/);
});

test('CBI locations reuse the apartment room-label typography and pastel palette', () => {
  assert.match(index, /\.cbi-location-trigger\{[^}]*font-family:inherit;font-size:8px;font-weight:500;[^}]*letter-spacing:1\.2px/);
  assert.match(index, /\.cbi-office \.room-inner\{overflow:hidden;border-radius:inherit;background:#fff\}/);
  assert.match(index, /roomLabelColor: '#E8B96A'/);
  const officeCss = index.slice(index.indexOf('/* ── World shell / CBI office ── */'), index.indexOf('/* ── World selector ── */'));
  assert.doesNotMatch(officeCss, /background-size:18px|#9b896d|#566b72|#8b7355|#96adb8|#8b7b6b/);
  assert.match(officeCss, /background:rgba\(232,185,106,/);
  assert.match(officeCss, /background:rgba\(91,166,107,/);
});

test('room portraits stay behind the fullscreen CG', () => {
  assert.match(index, /\.cg-fullscreen\.show~\.apt-wrap \.char-sprite/);
  assert.match(index, /\.cg-fullscreen\.show~\.cbi-office-wrap \.char-sprite/);
});

test('CBI mobile heading stays light and shortcuts span the room width', () => {
  assert.match(index, /body\[data-world-id="cbi"\] \.header h1\{font-weight:400;color:#aaa;/);
  assert.match(index, /body\[data-world-id="cbi"\] \.header p\{font-size:10px;color:#d2d2d2;/);
  assert.match(index, /body\[data-world-id="cbi"\] \.cbi-weather-strip\{color:#bdbdbd;font-size:9px;font-weight:300\}/);
  assert.match(index, /\.mobile-shortcuts-wrap\{[^}]*display:grid;grid-template-columns:repeat\(5,44px\);justify-content:space-between;/);
});

test('opening a module from a Home shortcut returns to the main Home page', () => {
  const helperStart = index.indexOf("var HOME_SHORTCUT_RETURN_KEY=");
  const helperEnd = index.indexOf("['mobileShortcutsWrap'", helperStart);
  const storage = new Map();
  const sessionStorage = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); }
  };
  const helpers = new Function('sessionStorage', index.slice(helperStart, helperEnd) + '; return { markHomeShortcutReturn, consumeHomeShortcutReturn };')(sessionStorage);
  helpers.markHomeShortcutReturn({ target: { closest: () => ({ getAttribute: () => 'wallet.html' }) } });
  assert.equal(helpers.consumeHomeShortcutReturn(), true);
  assert.equal(helpers.consumeHomeShortcutReturn(), false, 'the return marker should be consumed only once');
  assert.match(index, /var defaultPage=returnToMain\?1:\(urlP!==null\?\+urlP:1\)/);
  assert.match(index, /cleanUrl\.searchParams\.delete\('p'\)/);
});

test('schedule page is world-aware and never auto-imports sample events', () => {
  assert.match(schedule, /WorldContext\.getActiveWorldId\(\)/);
  assert.match(schedule, /getScheduleEventsForDate\(ds, WORLD_ID\)/);
  assert.match(schedule, /data-assignment="field"/);
  assert.match(schedule, /data-assignment="office"/);
  assert.match(schedule, /getCbiDutyRoster\(ds, 'day'\)/);
  assert.doesNotMatch(schedule, /loadSamplePack|will_concert_osaka|Dutchman/);
});

test('CBI schedule puts the calendar and duty preview before the simplified deployment form', () => {
  assert.ok(schedule.indexOf('id="weekGrid"') < schedule.indexOf('id="dayDetail"'));
  assert.ok(schedule.indexOf('id="dayDetail"') < schedule.indexOf('id="cbiDeploymentPanel"'));
  assert.match(schedule, /\.day-events:empty\{display:none\}/);
  assert.match(schedule, /\.cbi-agent-grid\{[^}]*repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(schedule, /restoreDefaultCbiDeployment\(\)/);
  assert.doesNotMatch(schedule, /id="cbiMealLead"|id="cbiApprovedBudget"/);
  assert.doesNotMatch(schedule, /<strong>Boss<\/strong>/);
  assert.doesNotMatch(schedule, /<strong>工作餐<\/strong>|<strong>经费<\/strong>/);
});

test('CBI reality loop reuses the mature pages without crossing its currencies', () => {
  assert.match(worldContext, /daily: 'daily\.html'/);
  assert.match(worldContext, /wallet: 'wallet\.html'/);
  assert.match(worldContext, /shop: 'shop\.html'/);
  assert.match(daily, /cbi-work\.js/);
  assert.match(daily, /CBIWork\.mount/);
  assert.match(shop, /cbi-shop\.js/);
  assert.match(shop, /CBIShop\.mount/);
  assert.match(wallet, /cbi-wallet\.js/);
  assert.match(wallet, /CBIWallet\.mount/);
  assert.match(wallet, /legacyDebtWaiverApplied/);
  assert.match(wallet, /return Math\.max\(0,walletRawSharedFund\(db\)\)/);
  assert.match(index, /'wallet':'记账'/);
  assert.doesNotMatch(index, /worldId==='cbi'\?'案件基金':'记账'/);
  assert.match(index, /openWardrobe\('boss',event\)/);
  assert.match(index, /change\.worldId&&change\.worldId!==getActiveWorldId\(\)/);
  assert.match(schedule, /id="cbiDeploymentPanel"/);
  assert.match(schedule, /function returnCbiDeployment\(\)/);
  assert.match(cloud, /'daily\.html': \[[^\]]*'cbi_db'/);
  assert.match(cloud, /'shop\.html': \[[^\]]*'home_skin_custom'/);
});

test('CBI check-ins use one repeatable grouped list while commissions and actions keep their own systems', () => {
  const cbiWork = fs.readFileSync('cbi-work.js', 'utf8');
  assert.match(cbiWork, /cbi-commission-card/);
  assert.match(cbiWork, /cbi-case-file/);
  assert.doesNotMatch(cbiWork, /cbi-habit-sheet|function renderHabits\(\)/);
  assert.match(cbiWork, /if \(tab === 'habits'\) \{\s*global\.location\.href = 'daily\.html\?tab=habits'/);
  assert.match(daily, /const IS_CBI_HABITS = IS_CBI_DAILY && DAILY_URL_TAB === 'habits'/);
  assert.match(daily, /habits:cbiDailyDb\.work\.habits\.map/);
  assert.match(daily, /Object\.assign\(\{\},h,\{type:'count',interval:1\}\)/);
  assert.match(daily, /if\(IS_CBI_HABITS\)\{\s*html\+=renderHabitGroup\('all'\)/);
  assert.match(daily, /if\(typeFields\)typeFields\.style\.display='none'/);
  assert.match(daily, /type:'count',\s*interval:1/);
  assert.match(daily, /if\(IS_CBI_HABITS\)\{if\(h\.salary\)rewardParts\.push\('点数 \+'/);
  assert.match(daily, /cbiDailyDb\.work\.salary=\(cbiDailyDb\.work\.salary\|\|0\)\+salary/);
  assert.match(daily, /if\(utility\)utility\.remove\(\)/);
  assert.doesNotMatch(cbiWork, /utility\.textContent = '卷宗'|backup\.html/);
  assert.match(cbiWork, /id="cbiActionDifficulty"/);
  assert.match(cbiWork, /快速 · 15 点/);
  assert.match(cbiWork, /普通 · 30 点/);
  assert.match(cbiWork, /棘手 · 60 点/);
  assert.match(cbiWork, /progress \/ caseItem\.threshold \* 100/);
  assert.match(cbiWork, /options\.lockedTab/);
  assert.match(cbiWork, /tabs\.style\.display = 'none'/);
  assert.match(daily, /lockedTab:\['drop','todo','habits'\]\.indexOf\(urlTab\)>=0\?urlTab:''/);
  assert.match(index, /hrefParts\.slice\(1\)\.join\('\?'\)/);
  assert.match(index, /legacyDailyTab=\{'委托':'drop','行动':'todo','日程':'todo','日课':'habits','打卡':'habits'\}/);
  assert.match(index, /data-entry-id="daily-habits"[^>]*><div class="entry-icon">🗒️<\/div><div class="entry-label">打卡<\/div>/);
  assert.match(index, /href="habit\.html"><div class="entry-icon">📅<\/div><div class="entry-label">目标<\/div>/);
  assert.match(index, /data-entry-id="daily-todo"[^>]*><div class="entry-icon">📋<\/div>/);
  assert.match(daily, /data-tab="habits"[^>]*>打卡<\/div>/);
  assert.match(cbiWork, /data-tab="habits">打卡<\/div>/);
});

test('CBI wallet owns funding, investigation, progress and logs but no deployment editor', () => {
  const cbiWallet = fs.readFileSync('cbi-wallet.js', 'utf8');
  for (const label of ['记账', '经费', '调查', '进度', '日志']) {
    assert.match(cbiWallet, new RegExp(`>${label}<`));
  }
  assert.match(cbiWallet, /allocateCaseFund/);
  assert.match(cbiWallet, /createInvestigationRequest/);
  assert.match(cbiWallet, /approveInvestigation/);
  assert.match(cbiWallet, /setCaseFocus/);
  assert.doesNotMatch(cbiWallet, /今日调度|值班|bossMode|fieldAgents|cbiDeployment/);
  assert.doesNotMatch(cbiWallet, /schedule\.html/);
  assert.doesNotMatch(cbi, /function fundMajorCase|批准 ¥'\+cost/);
  assert.match(cbi, /wallet\.html#investigation/);
  assert.doesNotMatch(cbi, /item\.id!==id&&item\.status==='active'/);
});

test('recent liminal outing costs live in the outing tab rather than treasury', () => {
  const outingsStart = wallet.indexOf('function renderOutings()');
  const outingsEnd = wallet.indexOf('function processCurrentPeriod()', outingsStart);
  const treasuryStart = wallet.indexOf('function renderTreasury()');
  const treasuryEnd = wallet.indexOf('function openTransferModal()', treasuryStart);
  assert.match(wallet.slice(outingsStart, outingsEnd), /近期外出花费/);
  assert.doesNotMatch(wallet.slice(treasuryStart, treasuryEnd), /近期外出花费/);
});

test('desktop CBI splits the archive row between world files and suitcase', () => {
  assert.match(index, /id="worldFilesBlock"/);
  assert.match(index, /class="db-label">WORLD FILES</);
  assert.match(index, /WorldContext\.getRoute\('story','story\.html'\)/);
  assert.match(index, /\.db-world-files\{grid-column:1\/-1/);
  assert.match(index, /id="suitcaseBlock" onclick="openSuitcase\(\)"/);
  assert.match(index, /body\[data-world-id="cbi"\] \.db-world-files\{grid-column:auto\}/);
  assert.match(index, /body\[data-world-id="cbi"\] \.db-suitcase\{display:flex\}/);
});

test('mobile CBI splits the file row between world files and suitcase', () => {
  assert.ok(index.indexOf('id="cbiOfficeWrap"') < index.indexOf('id="mobileWorldFilesBlock"'));
  assert.match(index, /class="mobile-world-files" id="mobileWorldFilesBlock"/);
  assert.match(index, /class="mobile-world-files mobile-suitcase" id="mobileSuitcaseBlock"/);
  assert.match(index, /\.mobile-file-row\{width:100%;max-width:360px/);
  assert.match(index, /body\[data-world-id="cbi"\] \.mobile-file-row\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/);
  assert.match(index, /@media\(min-width:700px\)\{[\s\S]*?\.mobile-file-row,\.mobile-shortcuts-wrap\{display:none\}/);
  assert.match(index, /querySelectorAll\('\[data-world-files-subtitle\]'\)/);
  assert.match(index, /function openSuitcase\(\)\{[\s\S]*?suitcase\.html/);
});

test('CBI room reads a continuous live roster instead of rerolling with CG time slots', () => {
  assert.match(index, /CharacterRuntime\.getCbiPresenceRoster\(now\)/);
  assert.match(index, /function renderCbiLocationPresence\(\)/);
  assert.doesNotMatch(index, /getCbi(?:Duty|Presence)Roster\([^\n]*getCGSlot/);
});

test('CBI room follows Jane shift boundaries once per phase and keeps manual overrides', () => {
  const start = index.indexOf("const CBI_AUTO_LOCATION_PHASE_KEY = 'cbi_auto_location_phase_v1';");
  const end = index.indexOf('const CBI_META_LINE_CHANCE', start);
  assert.ok(start >= 0 && end > start, 'automatic CBI location helpers should be extractable');

  let status = { date: '2026-09-23', mode: 'not_arrived' };
  let activeLocation = 'office';
  let resets = 0;
  const values = new Map();
  const context = {
    window: {},
    CharacterRuntime: { getCbiCharacterPresence: () => status },
    WorldContext: {
      getActiveLocationId: () => activeLocation,
      setActiveLocationId(worldId, locationId) {
        assert.equal(worldId, 'cbi');
        activeLocation = locationId;
        return true;
      }
    },
    localStorage: {
      getItem: key => values.has(key) ? values.get(key) : null,
      setItem: (key, value) => values.set(key, value)
    },
    document: {
      querySelectorAll: () => [],
      addEventListener() {},
      visibilityState: 'visible'
    },
    charPlacementState: {},
    CHAR_PLACEMENT_VERSION: 1,
    bubbleTimers: {},
    clearTimeout() {},
    setInterval() { return 1; },
    Date
  };
  context.window.CharacterRuntime = context.CharacterRuntime;
  context.window.WorldContext = context.WorldContext;
  vm.runInNewContext(index.slice(start, end), context);
  const originalReset = context.resetCbiLocationViewState;
  context.resetCbiLocationViewState = function () { resets++; originalReset(); };

  assert.equal(context.syncCbiLocationToJaneShift(new Date(2026, 8, 23, 7, 0)), true);
  assert.equal(activeLocation, 'home', 'before work should open at home');
  assert.equal(values.get('cbi_auto_location_phase_v1'), '2026-09-23:before');

  activeLocation = 'office';
  assert.equal(context.syncCbiLocationToJaneShift(new Date(2026, 8, 23, 7, 10)), false);
  assert.equal(activeLocation, 'office', 'manual choice should survive within the same phase');

  activeLocation = 'home';
  status = { date: '2026-09-23', mode: 'office' };
  assert.equal(context.syncCbiLocationToJaneShift(new Date(2026, 8, 23, 10, 0)), true);
  assert.equal(activeLocation, 'office', 'the work phase should return to the office');

  status = { date: '2026-09-23', mode: 'off_duty' };
  assert.equal(context.syncCbiLocationToJaneShift(new Date(2026, 8, 23, 21, 0)), true);
  assert.equal(activeLocation, 'home', 'after work should return home');
  assert.equal(resets, 3);
  assert.match(index, /setInterval\(function\(\)\{syncCbiLocationToJaneShift\(new Date\(\)\);\}, 30000\)/);
  assert.match(index, /CloudSync\.whenReady\(\)\.then\(function\(\)\{startCbiAutoLocation\(\);applyWorldView\(\);\}\)/);
});

test('desktop Notes cannot resize or recenter the room column', () => {
  assert.match(index, /html\{scrollbar-gutter:stable\}/);
  assert.match(index, /#pageMemo\{[^}]*width:260px;[^}]*min-width:0/);
  assert.match(index, /#pageMemo \.memo-input\{width:0;min-width:0\}/);
});

test('desktop shortcut deletion requires a long press and wrapped add stays separated', () => {
  assert.match(index, /\.ds-item\.ds-delete-visible \.ds-item-del\{display:block\}/);
  assert.doesNotMatch(index, /\.ds-item:hover \.ds-item-del/);
  assert.match(index, /\.ds-add\{[^}]*margin-top:8px/);
  assert.match(index, /function armLongPress\(\)[\s\S]*?revealDeleteButton\(press\.item\)/);
});

test('desktop shortcut long-press drag survives early mouse movement and pointer exit', () => {
  const match = index.match(/\(function initDSShortcutReorder\(\)\{[\s\S]*?\n\}\)\(\);/);
  assert.ok(match);
  const reorder = match[0];
  assert.match(reorder, /item\.setPointerCapture\(e\.pointerId\)/);
  assert.match(reorder, /if\(distance>DRAG_START_PX\)press\.moved=true/);
  assert.match(reorder, /if\(press\.moved\)\{beginDrag\(\);updateDrag\(press\.x,press\.y\);\}/);
  assert.match(reorder, /function releasePointerCapture\(\)/);
  assert.doesNotMatch(reorder, /MOVE_CANCEL_PX/);
});
