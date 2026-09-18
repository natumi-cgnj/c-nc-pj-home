const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const index = fs.readFileSync('index.html', 'utf8');

function count(pattern) {
  return [...index.matchAll(pattern)].length;
}

test('CBI home splits its lower row between the kitchen and Osaka room', () => {
  const livingRoom = index.indexOf('id="roomNatumi"');
  const lowerRow = index.indexOf('class="cbi-home-lower-row"');
  const kitchenRoom = index.indexOf('id="cbiKitchenRoom"');
  const osakaRoom = index.indexOf('id="cbiOsakaRoom"');
  const adaptiveBranch = index.indexOf('class="branch-stack branch-adaptive"');

  assert.ok(livingRoom >= 0 && lowerRow > livingRoom, 'The lower row should sit below the CBI home row');
  assert.ok(kitchenRoom > lowerRow && osakaRoom > kitchenRoom, 'Kitchen should be left of the Osaka room');
  assert.ok(adaptiveBranch > osakaRoom, 'Osaka room should stay inside the shared apartment map');
  assert.match(index, /<div class="room-box cbi-kitchen-room" id="cbiKitchenRoom">/);
  assert.match(index, /<div class="room-label">厨房<\/div>/);
  assert.match(index, /<div class="room-box cbi-osaka-room" id="cbiOsakaRoom">/);
  assert.match(index, /<div class="room-label">Osaka Room<\/div>/);
  assert.match(index, /body\[data-world-id="cbi"\]\[data-world-location="home"\] \.apt-wrap\{[^}]*aspect-ratio:18\/11/);
  assert.match(index, /\.cbi-office\{[^}]*aspect-ratio:18\/11/);
  assert.match(index, /\.apt-wrap>\.mid-row\{[^}]*height:68\.181818%;[^}]*flex:0 0 68\.181818%/);
  assert.match(index, /\.cbi-home-lower-row\{[^}]*height:31\.818182%;[^}]*flex:0 0 31\.818182%/);
  assert.match(index, /\.cbi-home-lower-row>\.room-box\{[^}]*width:50%;[^}]*height:100%;[^}]*flex:0 0 50%/);
  assert.match(index, /body\[data-world-id="cbi"\]\[data-world-location="home"\] \.cbi-home-lower-row\{display:flex\}/);
  assert.doesNotMatch(index, /enterOsakaRoom|进入大阪的房间|ENTER ↗/);
  assert.equal(count(/class="furniture natumi-bed"/g), 2, 'Osaka copy should reuse the original bed');
  for (let i = 1; i <= 7; i += 1) {
    assert.equal(count(new RegExp(`class="furniture natumi-box${i}"`, 'g')), 2, `Osaka copy should reuse box ${i}`);
  }
});
