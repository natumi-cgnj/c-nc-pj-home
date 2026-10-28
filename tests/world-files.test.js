const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
test('the legacy CBI archive links to the Sacramento worldline without modifying world or save data',()=>{
 const host={replaceChildren(...nodes){this.children=nodes;}},writes=[];
 const window={document:{querySelector:()=>host,createElement:()=>({})},localStorage:{setItem(...args){writes.push(args);}}};
 vm.runInNewContext(fs.readFileSync('world-files.js','utf8'),{window});
 assert.equal(host.children[0].href,'world-files.html?world=sacramento');
 assert.deepEqual(writes,[]);
});
