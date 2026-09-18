const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const index = fs.readFileSync('index.html', 'utf8');

function count(pattern) {
  return [...index.matchAll(pattern)].length;
}

test('CBI home copies the Osaka room below the bedroom and living room', () => {
  const livingRoom = index.indexOf('id="roomNatumi"');
  const osakaRoom = index.indexOf('id="cbiOsakaRoom"');
  const adaptiveBranch = index.indexOf('class="branch-stack branch-adaptive"');

  assert.ok(livingRoom >= 0 && osakaRoom > livingRoom, 'Osaka room should sit below the CBI home row');
  assert.ok(adaptiveBranch > osakaRoom, 'Osaka room should stay inside the shared apartment map');
  assert.match(index, /<div class="room-box cbi-osaka-room" id="cbiOsakaRoom">/);
  assert.match(index, /<div class="room-label">Osaka Room<\/div>/);
  assert.match(index, /body\[data-world-id="cbi"\]\[data-world-location="home"\] \.cbi-osaka-room\{display:block\}/);
  assert.match(index, /\.cbi-osaka-room\{[^}]*width:50%;[^}]*aspect-ratio:1\.2\/1/);
  assert.doesNotMatch(index, /enterOsakaRoom|进入大阪的房间|ENTER ↗/);
  assert.equal(count(/class="furniture natumi-bed"/g), 2, 'Osaka copy should reuse the original bed');
  for (let i = 1; i <= 7; i += 1) {
    assert.equal(count(new RegExp(`class="furniture natumi-box${i}"`, 'g')), 2, `Osaka copy should reuse box ${i}`);
  }
});
