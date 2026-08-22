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
  assert.match(cloud, /'cbi\.html': \['cbi_db', 'omniverse_world_context'\]/);
});

test('food archive stays global while meals and recipes switch world layers', () => {
  assert.match(index, /href="meals\.html" data-world-module="kitchen" data-entry-id="kitchen"/);
  assert.match(index, /href="kitchen\.html" data-entry-id="food-archive"/);
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
  assert.match(index, /\.cbi-office \.room-inner\{overflow:hidden;background:#fff\}/);
  assert.match(index, /roomLabelColor: '#E8B96A'/);
  const officeCss = index.slice(index.indexOf('/* ── World shell / CBI office ── */'), index.indexOf('/* ── World selector ── */'));
  assert.doesNotMatch(officeCss, /background-size:18px|#9b896d|#566b72|#8b7355|#96adb8|#8b7b6b/);
  assert.match(officeCss, /background:rgba\(232,185,106,/);
  assert.match(officeCss, /background:rgba\(91,166,107,/);
});

test('schedule page is world-aware and never auto-imports sample events', () => {
  assert.match(schedule, /WorldContext\.getActiveWorldId\(\)/);
  assert.match(schedule, /getScheduleEventsForDate\(ds, WORLD_ID\)/);
  assert.doesNotMatch(schedule, /loadSamplePack|will_concert_osaka|Dutchman/);
});

test('desktop Notes cannot resize or recenter the room column', () => {
  assert.match(index, /html\{scrollbar-gutter:stable\}/);
  assert.match(index, /#pageMemo\{[^}]*width:260px;[^}]*min-width:0/);
  assert.match(index, /#pageMemo \.memo-input\{width:0;min-width:0\}/);
});
