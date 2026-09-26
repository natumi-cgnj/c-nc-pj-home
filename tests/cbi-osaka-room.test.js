const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const index = fs.readFileSync('index.html', 'utf8');

function count(pattern) {
  return [...index.matchAll(pattern)].length;
}

test('CBI home follows the reference floor plan without the Osaka room', () => {
  const bedroom = index.indexOf('id="roomJane"');
  const livingRoom = index.indexOf('id="roomNatumi"');
  const lowerRow = index.indexOf('class="cbi-home-lower-row"');
  const bathroom = index.indexOf('id="cbiBathroomRoom"');
  const kitchenRoom = index.indexOf('id="cbiKitchenRoom"');
  const adaptiveBranch = index.indexOf('class="branch-stack branch-adaptive"');

  assert.ok(bedroom >= 0 && livingRoom > bedroom, 'Bedroom should sit to the left of the living room');
  assert.ok(livingRoom >= 0 && lowerRow > livingRoom, 'The lower row should sit below the CBI home row');
  assert.ok(bathroom > lowerRow && kitchenRoom > bathroom, 'Bathroom should be left of the open kitchen');
  assert.ok(adaptiveBranch > kitchenRoom, 'The CBI home rooms should stay inside the shared apartment map');
  assert.match(index, /<div class="room-box cbi-bathroom-room" id="cbiBathroomRoom">/);
  assert.match(index, /<div class="room-label">Bathroom<\/div>/);
  assert.match(index, /<div class="room-box cbi-kitchen-room" id="cbiKitchenRoom">/);
  assert.match(index, /id="cbiKitchenRoom">[\s\S]*?class="furniture cbi-laundry-stack"/);
  assert.match(index, /<div class="room-label">厨房<\/div>/);
  assert.doesNotMatch(index, /id="cbiOsakaRoom"|>Osaka Room</);
  assert.match(index, /body\[data-world-id="cbi"\]\[data-world-location="home"\] \.apt-wrap\{[^}]*display:grid;grid-template-columns:32% 6% 62%;grid-template-rows:59% 41%;aspect-ratio:18\/11/);
  assert.match(index, /\.cbi-office\{[^}]*aspect-ratio:18\/11/);
  assert.match(index, /body\[data-world-id="cbi"\]\[data-world-location="home"\] \.cbi-home-lower-row\{display:contents\}/);
  assert.match(index, /\.cbi-bathroom-room\{grid-area:2\/1/);
  assert.match(index, /\.cbi-kitchen-room\{grid-area:2\/2\/3\/4/);
  assert.match(index, /\.cbi-laundry-stack\{[^}]*left:1\.5%;bottom:8%;width:7%;height:auto;aspect-ratio:1/);
  assert.doesNotMatch(index, /enterOsakaRoom|进入大阪的房间|ENTER ↗/);
  assert.doesNotMatch(index, /cbi-laundry-room|cbiLaundryRoom|cbi-bath-washer|cbi-kitchen-entry|cbi-kitchen-island/);
  assert.equal(count(/class="furniture natumi-bed"/g), 1, 'The retired Osaka room should not duplicate the original bed');
  for (let i = 1; i <= 7; i += 1) {
    assert.equal(count(new RegExp(`class="furniture natumi-box${i}"`, 'g')), 1, `The retired Osaka room should not duplicate box ${i}`);
  }
});

test('CBI home keeps gold furniture with only the bedroom tea set and lamp in green', () => {
  assert.match(index, /\.apt-wrap \.furniture\{background:#E8B96A;opacity:\.055\}/);
  assert.match(index, /\.room-jane \.jane-lamp,[\s\S]*?\.room-jane \.cbi-guest-teacup,[\s\S]*?\.room-jane \.cbi-guest-teapot\{background:#5BA66B;opacity:\.09\}/);
  assert.match(index, /class="furniture cbi-home-only cbi-guest-teapot"/);
  assert.match(index, /class="furniture cbi-bath-tub"/);
  assert.match(index, /class="furniture cbi-home-only natumi-tv-console"/);
  assert.doesNotMatch(index, /\.cbi-kitchen-sink\{[^}]*background:#5BA66B/);
});
