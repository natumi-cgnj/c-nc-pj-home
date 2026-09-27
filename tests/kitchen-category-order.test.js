const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const kitchen = fs.readFileSync('kitchen.html', 'utf8');

test('Food category manager can move categories and project groups follow the saved order', () => {
  assert.match(kitchen, /function moveProjectCategoryDraft\(index,delta\)/);
  assert.match(kitchen, /aria-label="上移分类"/);
  assert.match(kitchen, /aria-label="下移分类"/);
  assert.match(kitchen, /const orderedCategories=readProjectCategories\(\)/);
  assert.match(kitchen, /orderedCategories\.forEach\(category=>\{/);
});
