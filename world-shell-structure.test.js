const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

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
  assert.match(index, /JANE_CBI_BOSS_LINES/);
  assert.doesNotMatch(index, /openRoomPkgSheet/);
  for (const id of ['char-cho', 'char-rigsby', 'char-lisbon', 'char-vanpelt']) {
    assert.match(index, new RegExp(`id="${id}"`));
  }
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

test('CBI case shell exposes only the confirmed first-version fields', () => {
  for (const id of ['caseEpisode', 'caseDate', 'caseTitle', 'caseStatus', 'caseSummary', 'caseCharacters', 'caseMainline', 'caseBody', 'caseChanges']) {
    assert.match(cbi, new RegExp(`id="${id}"`));
  }
  assert.match(cbi, /CBIData\.mainlineEntries\(db\.cases\)/);
  assert.doesNotMatch(cbi, /relationship graph|score|评分|API/i);
});

test('world and CBI data participate in cloud sync and full backup', () => {
  for (const key of ['omniverse_world_context', 'cbi_db', 'meal_log_db', 'meal_companion_db', 'recipe_salad_db', 'schedule_packs', 'schedule_user_events']) {
    assert.match(cloud, new RegExp(`'${key}'`));
    assert.match(backup, new RegExp(`key:'${key}'`));
  }
  assert.match(cloud, /'cbi\.html': \['cbi_db', 'wallet_db',[^\]]*'omniverse_world_context'\]/);
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

test('schedule page is world-aware and never auto-imports sample events', () => {
  assert.match(schedule, /WorldContext\.getActiveWorldId\(\)/);
  assert.match(schedule, /getScheduleEventsForDate\(ds, WORLD_ID\)/);
  assert.match(schedule, /data-assignment="field"/);
  assert.match(schedule, /data-assignment="office"/);
  assert.match(schedule, /getCbiDutyRoster\(ds, 'day'\)/);
  assert.doesNotMatch(schedule, /loadSamplePack|will_concert_osaka|Dutchman/);
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
  assert.match(index, /openWardrobe\('boss',event\)/);
  assert.match(index, /change\.worldId&&change\.worldId!==getActiveWorldId\(\)/);
  assert.match(schedule, /id="cbiDeploymentPanel"/);
  assert.match(schedule, /function returnCbiDeployment\(\)/);
  assert.match(cloud, /'daily\.html': \[[^\]]*'cbi_db'/);
  assert.match(cloud, /'shop\.html': \[[^\]]*'home_skin_custom'/);
});

test('desktop world files opens the active world archive beneath the existing four blocks', () => {
  assert.match(index, /id="worldFilesBlock"/);
  assert.match(index, /class="db-label">WORLD FILES</);
  assert.match(index, /WorldContext\.getRoute\('story','story\.html'\)/);
  assert.match(index, /\.db-world-files\{grid-column:1\/-1/);
});

test('desktop Notes cannot resize or recenter the room column', () => {
  assert.match(index, /html\{scrollbar-gutter:stable\}/);
  assert.match(index, /#pageMemo\{[^}]*width:260px;[^}]*min-width:0/);
  assert.match(index, /#pageMemo \.memo-input\{width:0;min-width:0\}/);
});
